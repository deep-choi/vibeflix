import { ApiError, body, db, failure, json, limit, origin } from '../../../../lib/api';
import { currentUser, requireUser } from '../../../../lib/auth';
import { notify } from '../../../../lib/community';
import { assertVisibleAuthor } from '../../../../lib/member-safety';

// Follow a creator by their public id. Followers hear about the creator's new episodes and updates.
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

async function creator(publicId: string) {
  const row = await db().prepare('SELECT id,name FROM profiles WHERE public_id=? AND suspended=0').bind(publicId).first();
  if (!row) throw new ApiError(404, '크리에이터를 찾을 수 없습니다.');
  await assertVisibleAuthor(String(row.id), (await currentUser())?.id);
  return row;
}
const counts = async (creatorId: string, viewer = '') => {
  const r = await db().prepare('SELECT (SELECT COUNT(*) FROM follows WHERE creator_id=?) followers,EXISTS(SELECT 1 FROM follows WHERE creator_id=? AND follower_id=?) following').bind(creatorId, creatorId, viewer).first();
  return { followers: Number(r?.followers || 0), following: !!r?.following };
};

export async function GET(_request: Request, context: Context) {
  try { const { id } = await context.params; const c = await creator(id); const user = await currentUser(); return json(await counts(String(c.id), user?.id)); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    origin(request); const user = await requireUser(); await limit(user.id, 'follow', 30);
    const { id } = await context.params; const c = await creator(id); const b = await body(request);
    if (typeof b.active !== 'boolean') throw new ApiError(400, '팔로우 상태를 확인해주세요.');
    if (c.id === user.id) throw new ApiError(400, '나를 팔로우할 수는 없어요.');
    if (b.active) {
      const added = await db().prepare('INSERT INTO follows (follower_id,creator_id,created) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(user.id, c.id, Date.now()).run();
      if (added.meta.changes) await notify(String(c.id), user, 'follow', 'creator', user.publicId, `${user.name}님`);
    } else await db().prepare('DELETE FROM follows WHERE follower_id=? AND creator_id=?').bind(user.id, c.id).run();
    return json(await counts(String(c.id), user.id));
  } catch (error) { return failure(error); }
}
