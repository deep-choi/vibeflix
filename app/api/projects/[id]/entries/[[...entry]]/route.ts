import { ApiError, body, db, failure, json, limit, origin } from '../../../../../../lib/api';
import { currentUser, requireUser } from '../../../../../../lib/auth';
import { CONTENT, GALLERY, PROJECT_BODY_LIMIT, parseContent } from '../../../../../../lib/project-input';
import { contentStatements, resolveContent } from '../../../../../../lib/projects';
import { ENTRY_LIMITS, announceDueEntries, entryKind, listEntries } from '../../../../../../lib/entries';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; entry?: string[] }> };
const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';

async function work(id: string) {
  const row = await db().prepare('SELECT id,owner_id,type,visibility,hidden_at FROM projects WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!row) throw new ApiError(404, '작품을 찾을 수 없습니다.');
  return row;
}
/** Shared create/update validation: title, number or version, note, publish time, body blocks. */
async function fields(b: Record<string, unknown>, kind: string) {
  const title = str(b.title, ENTRY_LIMITS.title); if (!title) throw new ApiError(400, kind === 'episode' ? '회차 제목을 입력해주세요.' : '업데이트 제목을 입력해주세요.');
  const number = kind === 'episode' ? Number(b.number) : null;
  if (kind === 'episode' && (!Number.isInteger(number) || number! < 1 || number! > 9999)) throw new ApiError(400, '회차 번호는 1 이상의 숫자로 입력해주세요.');
  const version = kind === 'update' ? str(b.version, ENTRY_LIMITS.version) : '';
  const status = b.status === 'draft' ? 'draft' : 'published';
  const at = typeof b.publishAt === 'string' && b.publishAt ? Date.parse(b.publishAt) : NaN;
  const publishedAt = Number.isFinite(at) && at > Date.now() ? at : Date.now(); // past or missing time = now
  const blocks = parseContent(b.content ?? []);
  if (!blocks) throw new ApiError(400, `본문은 블록 ${CONTENT.maxBlocks}개, 이미지 ${CONTENT.maxImages}장(장당 ${GALLERY.maxBytes / 1024}KB 이하), 글 ${CONTENT.maxTotalText.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`);
  return { title, number, version, note: str(b.note, ENTRY_LIMITS.note), status, publishedAt, blocks };
}

async function dispatch(request: Request, context: Context) {
  const { id, entry = [] } = await context.params; const [entryId] = entry; const method = request.method;
  if (method !== 'GET') origin(request);
  const w = await work(id); const kind = entryKind(String(w.type));
  if (method === 'GET') {
    const user = await currentUser(); const owner = !!user && user.id === w.owner_id;
    if (!owner && (w.hidden_at || w.visibility !== 'public')) throw new ApiError(404, '작품을 찾을 수 없습니다.');
    if (!entryId) { await announceDueEntries(id); return json({ kind, entries: await listEntries(id, kind, owner) }); }
    const e = await db().prepare('SELECT * FROM entries WHERE id=? AND project_id=?').bind(entryId, id).first();
    if (!e || (!owner && (e.status !== 'published' || Number(e.published_at) > Date.now()))) throw new ApiError(404, '회차를 찾을 수 없습니다.');
    return json({ entry: { ...e, content: resolveContent(e.content) } });
  }
  const user = await requireUser();
  if (user.id !== w.owner_id) throw new ApiError(403, '작품을 만든 사람만 쓸 수 있어요.');
  await limit(user.id, 'entry', 30, 3600);
  if (method === 'POST' && !entryId) {
    const count = Number((await db().prepare('SELECT COUNT(*) n FROM entries WHERE project_id=?').bind(id).first())?.n || 0);
    if (count >= ENTRY_LIMITS.perWork) throw new ApiError(400, `회차·소식은 작품당 ${ENTRY_LIMITS.perWork}개까지예요.`);
    const f = await fields(await body(request, PROJECT_BODY_LIMIT), kind); const newId = `entry-${crypto.randomUUID()}`; const now = Date.now();
    const { ops, json: content } = await contentStatements(id, f.blocks, now, newId);
    await db().prepare('INSERT INTO entries (id,project_id,kind,number,version,title,note,content,status,published_at,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(newId, id, kind, f.number, f.version, f.title, f.note, content, f.status, f.publishedAt, now, now).run();
    if (ops.length) await db().batch(ops);
    await announceDueEntries(id);
    return json({ id: newId }, 201);
  }
  if (!entryId) throw new ApiError(404, '지원하지 않는 요청입니다.');
  const existing = await db().prepare('SELECT id FROM entries WHERE id=? AND project_id=?').bind(entryId, id).first();
  if (!existing) throw new ApiError(404, '회차를 찾을 수 없습니다.');
  if (method === 'DELETE') {
    await db().batch([db().prepare('DELETE FROM project_images WHERE project_id=? AND entry_id=?').bind(id, entryId), db().prepare('DELETE FROM entries WHERE id=?').bind(entryId), db().prepare("DELETE FROM notifications WHERE target_kind='entry' AND target_id=?").bind(`${id}/${entryId}`)]);
    return json({ ok: true });
  }
  if (method === 'PATCH') {
    const f = await fields(await body(request, PROJECT_BODY_LIMIT), kind);
    const { ops, json: content } = await contentStatements(id, f.blocks, Date.now(), entryId);
    await db().prepare('UPDATE entries SET number=?,version=?,title=?,note=?,content=?,status=?,published_at=CASE WHEN status=\'published\' AND published_at<=? AND ?=\'published\' THEN published_at ELSE ? END,updated=? WHERE id=?').bind(f.number, f.version, f.title, f.note, content, f.status, Date.now(), f.status, f.publishedAt, Date.now(), entryId).run();
    if (ops.length) await db().batch(ops);
    await announceDueEntries(id);
    return json({ ok: true });
  }
  throw new ApiError(404, '지원하지 않는 요청입니다.');
}
async function handle(request: Request, context: Context) { try { return await dispatch(request, context); } catch (error) { return failure(error); } }
export const GET = handle; export const POST = handle; export const PATCH = handle; export const DELETE = handle;
