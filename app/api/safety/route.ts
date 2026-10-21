import { ApiError, body, db, failure, json, limit, origin, text } from '../../../lib/api';
import { requireUser } from '../../../lib/auth';
import { entity } from '../../../lib/community';
import { POLICY_VERSION } from '../../../lib/member-safety';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await requireUser();
    const blocks = await db().prepare('SELECT u.public_id AS id,u.name FROM member_blocks b JOIN profiles u ON u.id=b.target_id WHERE b.owner_id=? ORDER BY b.created DESC').bind(user.id).all();
    const deletion = await db().prepare('SELECT requested FROM deletion_requests WHERE user_id=?').bind(user.id).first();
    return json({ blocks: blocks.results, deletionRequested: !!deletion });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await requireUser();
    const input = await body(request, 4000);
    await limit(user.id, 'safety', 15);
    if (input.action === 'accept') {
      if (input.accepted !== true) throw new ApiError(400, '이용약관 동의를 확인해주세요.');
      await db().prepare('INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,accepted=excluded.accepted').bind(user.id, POLICY_VERSION, Date.now()).run();
      return json({ ok: true });
    }
    if (input.action === 'deletion') {
      if (input.confirm !== '삭제 요청') throw new ApiError(400, '삭제 요청을 입력해주세요.');
      await db().prepare('INSERT OR IGNORE INTO deletion_requests(user_id,requested) VALUES(?,?)').bind(user.id, Date.now()).run();
      return json({ ok: true, message: '계정과 작성한 콘텐츠의 삭제 요청이 접수되었습니다.' });
    }
    if (!['block', 'unblock', 'report-user'].includes(String(input.action))) throw new ApiError(400, '처리할 작업을 확인해주세요.');
    let targetId: string;
    if (typeof input.publicId === 'string') {
      const profile = await db().prepare('SELECT id FROM profiles WHERE public_id=?').bind(text(input.publicId, 1, 100, '이용자')).first();
      if (!profile) throw new ApiError(404, '이용자를 찾을 수 없습니다.');
      targetId = String(profile.id);
    } else {
      const target = await entity(String(input.kind), text(input.targetId, 1, 100, '콘텐츠'));
      if (!target.ownerId) throw new ApiError(400, '운영자가 등록한 작품입니다. 작품 신고를 이용해주세요.');
      targetId = target.ownerId;
    }
    if (targetId === user.id) throw new ApiError(400, '본인은 차단하거나 신고할 수 없습니다.');
    if (input.action === 'block') {
      await db().prepare('INSERT OR IGNORE INTO member_blocks(owner_id,target_id,created) VALUES(?,?,?)').bind(user.id, targetId, Date.now()).run();
      await db().batch([
        db().prepare('DELETE FROM follows WHERE follower_id=? AND creator_id=?').bind(user.id, targetId),
        db().prepare('DELETE FROM notifications WHERE recipient_id=? AND actor_id=?').bind(user.id, targetId),
      ]);
    } else if (input.action === 'unblock') {
      await db().prepare('DELETE FROM member_blocks WHERE owner_id=? AND target_id=?').bind(user.id, targetId).run();
    } else {
      const profile = await db().prepare('SELECT public_id FROM profiles WHERE id=?').bind(targetId).first();
      const reason = text(input.reason, 5, 500, '신고 사유');
      const existing = await db().prepare("SELECT id FROM reports WHERE reporter_id=? AND target_kind='user' AND target_id=? AND status='pending'").bind(user.id, profile!.public_id).first();
      if (existing) throw new ApiError(409, '이미 접수된 이용자 신고입니다.');
      await db().prepare("INSERT INTO reports(id,reporter_id,target_kind,target_id,reason,created) VALUES(?,?,'user',?,?,?)").bind(crypto.randomUUID(), user.id, profile!.public_id, reason, Date.now()).run();
    }
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
