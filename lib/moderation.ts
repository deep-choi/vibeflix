import { ApiError, db } from './api';
import { logAction } from './admin';
import { notifyAdmins, systemNotify } from './community';
import { invalidateCatalog } from './projects';

// Moderation shared by /admin and the in-profile report tab: hiding content tells its author why (and how to
// appeal), resolving a report tells every reporter what happened, and member sanctions go warning → timed → permanent.

export const REPORT_CATEGORIES: Record<string, string> = { spam: '스팸·광고', abuse: '욕설·괴롭힘', copyright: '도용·저작권', privacy: '개인정보 노출', sexual: '음란·선정성', malicious: '악성 링크·사기', other: '기타' };
export const reportCategory = (value: unknown) => typeof value === 'string' && value in REPORT_CATEGORIES ? value : 'other';
/** Reason is required for "기타"; for a chosen category it is optional context. */
export function reportReason(value: unknown, category: string) {
  const reason = typeof value === 'string' ? value.trim() : '';
  const min = category === 'other' ? 5 : 0;
  if (reason.length < min || reason.length > 500) throw new ApiError(400, category === 'other' ? '신고 사유: 5~500자로 입력해주세요.' : '신고 사유는 500자까지 쓸 수 있어요.');
  return reason;
}
export const KIND_NAMES: Record<string, string> = { project: '작품', post: '게시글', comment: '댓글', user: '회원' };
const TABLES: Record<string, string> = { post: 'posts', comment: 'comments', project: 'projects' };

export async function setHidden(kind: string, id: string, hidden: boolean) {
  const table = TABLES[kind]; if (!table) throw new ApiError(400, '처리할 수 없는 대상입니다.');
  const result = await db().prepare(`UPDATE ${table} SET hidden_at=? WHERE id=? AND deleted_at IS NULL`).bind(hidden ? Date.now() : null, id).run();
  if (!result.meta.changes) throw new ApiError(404, '대상을 찾을 수 없습니다.');
  if (kind === 'project') invalidateCatalog();
}
/** The member who wrote a piece of content and a short label for it (curated and sample works have no member owner). */
export async function contentOwner(kind: string, id: string): Promise<{ ownerId: string; label: string } | null> {
  if (kind === 'project') { const r = await db().prepare('SELECT owner_id,source,title FROM projects WHERE id=?').bind(id).first(); return r && r.source === 'community' ? { ownerId: String(r.owner_id), label: `작품 ‘${String(r.title).slice(0, 30)}’` } : null; }
  if (kind === 'post') { const r = await db().prepare('SELECT owner_id,title FROM posts WHERE id=?').bind(id).first(); return r ? { ownerId: String(r.owner_id), label: `게시글 ‘${String(r.title).slice(0, 30)}’` } : null; }
  if (kind === 'comment') { const r = await db().prepare('SELECT owner_id,body FROM comments WHERE id=?').bind(id).first(); return r ? { ownerId: String(r.owner_id), label: `댓글 ‘${String(r.body).slice(0, 24)}’` } : null; }
  return null;
}
/** Hides content and tells its author, with the operator's reason; the notice opens the appeal form. */
export async function hideContent(adminId: string, kind: string, id: string, note = '') {
  await setHidden(kind, id, true);
  const owner = await contentOwner(kind, id);
  if (owner) await systemNotify(owner.ownerId, adminId, 'moderated', kind, id, `운영자가 ${owner.label}을(를) 숨겼어요${note ? ` · 사유: ${note}` : ''}`);
}

// ───── Member sanctions ─────
export const SANCTIONS: Record<string, { label: string; days?: number }> = { warning: { label: '경고' }, suspend7: { label: '7일 이용 정지', days: 7 }, suspend30: { label: '30일 이용 정지', days: 30 }, ban: { label: '영구 이용 정지' }, lift: { label: '정지 해제' } };
/**
 * Applies a sanction to a member (internal id). Warnings arrive as a notice; suspensions sign the member out at
 * once and end by themselves when timed. Every step is kept in `sanctions` so the next decision can see the history.
 */
export async function sanctionUser(adminId: string, userId: string, kind: string, note = '') {
  const s = SANCTIONS[kind]; if (!s) throw new ApiError(400, '제재 방식을 확인해주세요.');
  const target = await db().prepare('SELECT id,role,public_id FROM profiles WHERE id=?').bind(userId).first();
  if (!target) throw new ApiError(404, '회원을 찾을 수 없습니다.');
  if (target.id === adminId) throw new ApiError(400, '내 계정에는 적용할 수 없어요.');
  if (target.role === 'admin' && kind !== 'lift') throw new ApiError(400, '운영자는 먼저 일반 회원으로 바꾼 뒤 제재할 수 있어요.');
  if (kind === 'warning' && !note.trim()) throw new ApiError(400, '경고 사유를 적어주세요. 회원에게 그대로 전달돼요.');
  const now = Date.now(); const until = s.days ? now + s.days * 86400000 : null; const id = crypto.randomUUID();
  const stored = kind === 'suspend7' || kind === 'suspend30' ? 'suspend' : kind;
  const ops = [db().prepare('INSERT INTO sanctions (id,user_id,kind,until,note,admin_id,created) VALUES (?,?,?,?,?,?,?)').bind(id, userId, stored, until, note.slice(0, 300), adminId, now)];
  if (stored === 'suspend' || stored === 'ban') ops.push(db().prepare('UPDATE profiles SET suspended=1,suspended_until=?,updated=? WHERE id=?').bind(until, now, userId), db().prepare('DELETE FROM sessions WHERE user_id=?').bind(userId));
  if (stored === 'lift') ops.push(db().prepare('UPDATE profiles SET suspended=0,suspended_until=NULL,updated=? WHERE id=?').bind(now, userId));
  await db().batch(ops);
  const message = kind === 'warning' ? `운영 정책 위반으로 경고를 받았어요 · ${note}` : kind === 'lift' ? '이용 정지가 해제됐어요. 다시 활동할 수 있어요.' : `${s.label} 조치를 받았어요${note ? ` · 사유: ${note}` : ''}`;
  await systemNotify(userId, adminId, kind === 'warning' ? 'warning' : 'sanction', 'notice', id, message);
  await logAction(adminId, `user.${kind}`, 'user', String(target.public_id), note);
}

// ───── Reports ─────
/**
 * Resolves every pending report on one target. Content: 'hide' hides it (author is told), 'dismiss' leaves it.
 * Members: 'warning' / 'suspend7' / 'suspend30' / 'ban' sanction them ('hide' on a member = 'ban', as before).
 * Each reporter hears the outcome once.
 */
export async function resolveReports(adminId: string, targetKind: string, targetId: string, action: string, note = '', onlyId = '') {
  const pending = (await db().prepare(`SELECT id,reporter_id FROM reports WHERE target_kind=? AND target_id=? AND status='pending' ${onlyId ? 'AND id=?' : ''}`).bind(...(onlyId ? [targetKind, targetId, onlyId] : [targetKind, targetId])).all()).results;
  if (!pending.length) throw new ApiError(404, '처리할 신고를 찾을 수 없습니다.');
  const user = targetKind === 'user';
  const sanction = user ? (action === 'hide' ? 'ban' : action) : '';
  if (action !== 'dismiss') {
    if (user) {
      if (!['warning', 'suspend7', 'suspend30', 'ban'].includes(sanction)) throw new ApiError(400, '회원 신고는 경고·정지·기각으로 처리해주세요.');
      const target = await db().prepare('SELECT id,role FROM profiles WHERE public_id=?').bind(targetId).first();
      if (!target || target.id === adminId || target.role === 'admin') throw new ApiError(400, '이용자 관리에서 확인해주세요.');
      await sanctionUser(adminId, String(target.id), sanction, note || '신고 접수 내용 확인');
    } else if (action === 'hide') await hideContent(adminId, targetKind, targetId, note);
    else throw new ApiError(400, '처리 방식을 확인해주세요.');
  }
  const status = action === 'dismiss' ? 'dismissed' : 'resolved'; const now = Date.now();
  await db().batch(pending.map(r => db().prepare('UPDATE reports SET status=?,resolved_at=? WHERE id=?').bind(status, now, r.id)));
  const name = KIND_NAMES[targetKind] || '콘텐츠';
  const reporters = [...new Set(pending.map(r => String(r.reporter_id)))];
  for (const reporter of reporters) await systemNotify(reporter, adminId, 'report-result', 'notice', String(pending[0].id), action === 'dismiss' ? `신고하신 ${name}을(를) 검토했어요. 운영 기준에 따라 그대로 두기로 했어요.` : `신고하신 ${name}에 조치했어요. 알려주셔서 고마워요.`);
  await logAction(adminId, `report.${action}`, targetKind, targetId, `${pending.length}건${note ? ' · ' + note : ''}`);
  return pending.length;
}
/** Alerts operators about the first pending report on a target (later reports on it only raise its count). */
export async function alertNewReport(reporterId: string, targetKind: string, targetId: string, category: string) {
  const n = Number((await db().prepare("SELECT COUNT(*) n FROM reports WHERE target_kind=? AND target_id=? AND status='pending'").bind(targetKind, targetId).first())?.n || 0);
  if (n === 1) await notifyAdmins(reporterId, 'report', 'reports', `${KIND_NAMES[targetKind] || '콘텐츠'} 신고 · ${REPORT_CATEGORIES[category] || '기타'}`);
}

// ───── Appeals ─────
/** A member asks for their hidden work, post or comment to be looked at again. */
export async function createAppeal(userId: string, kind: string, id: string, reason: string) {
  const table = TABLES[kind]; if (!table) throw new ApiError(400, '이의 제기할 대상을 확인해주세요.');
  const row = await db().prepare(`SELECT owner_id,hidden_at,deleted_at FROM ${table} WHERE id=?`).bind(id).first();
  if (!row || row.owner_id !== userId || row.deleted_at) throw new ApiError(404, '이의 제기할 콘텐츠를 찾을 수 없어요.');
  if (!row.hidden_at) throw new ApiError(409, '숨겨진 콘텐츠가 아니에요.');
  if (await db().prepare("SELECT 1 FROM appeals WHERE target_kind=? AND target_id=? AND status='pending'").bind(kind, id).first()) throw new ApiError(409, '이미 이의 제기를 접수했어요. 운영자가 확인하면 알려드릴게요.');
  const appealId = crypto.randomUUID();
  await db().prepare('INSERT INTO appeals (id,user_id,target_kind,target_id,reason,created) VALUES (?,?,?,?,?,?)').bind(appealId, userId, kind, id, reason, Date.now()).run();
  await notifyAdmins(userId, 'appeal', 'appeals', `${KIND_NAMES[kind]} 숨김에 대한 이의 제기`);
  return appealId;
}
export async function resolveAppeal(adminId: string, appealId: string, accept: boolean, note = '') {
  const a = await db().prepare("SELECT * FROM appeals WHERE id=? AND status='pending'").bind(appealId).first();
  if (!a) throw new ApiError(404, '처리할 이의 제기를 찾을 수 없어요.');
  if (!accept && !note.trim()) throw new ApiError(400, '그대로 두는 이유를 적어주세요. 회원에게 전달돼요.');
  if (accept) await setHidden(String(a.target_kind), String(a.target_id), false).catch(error => { if (!(error instanceof ApiError && error.status === 404)) throw error; });
  await db().prepare('UPDATE appeals SET status=?,response=?,resolved_at=? WHERE id=?').bind(accept ? 'accepted' : 'rejected', note.slice(0, 300), Date.now(), appealId).run();
  const name = KIND_NAMES[String(a.target_kind)] || '콘텐츠';
  await systemNotify(String(a.user_id), adminId, 'appeal-result', accept ? String(a.target_kind) : 'notice', accept ? String(a.target_id) : appealId, accept ? `이의 제기를 받아들여 ${name}을(를) 다시 공개했어요.${note ? ` ${note}` : ''}` : `이의 제기를 검토했지만 ${name}은(는) 숨김을 유지해요 · ${note}`);
  await logAction(adminId, accept ? 'appeal.accept' : 'appeal.reject', String(a.target_kind), String(a.target_id), note);
}
