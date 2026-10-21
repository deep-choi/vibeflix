import { ApiError, db } from './api';

export const POLICY_VERSION = '2026-10-21';
export async function blockedOwners(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db().prepare('SELECT target_id FROM member_blocks WHERE owner_id=?').bind(userId).all();
  return new Set(rows.results.map(row => String(row.target_id)));
}
export async function assertVisibleAuthor(ownerId: string, viewerId?: string) {
  if ((await blockedOwners(viewerId)).has(ownerId)) throw new ApiError(404, '차단한 이용자의 콘텐츠입니다.');
}
export async function blockedPublicIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db().prepare('SELECT u.public_id FROM member_blocks b JOIN profiles u ON u.id=b.target_id WHERE b.owner_id=?').bind(userId).all();
  return new Set(rows.results.map(row => String(row.public_id)));
}
export async function requireContentConsent(userId: string) {
  const consent = await db().prepare('SELECT version FROM policy_acceptances WHERE user_id=?').bind(userId).first();
  if (consent?.version !== POLICY_VERSION) throw new ApiError(428, '내 프로필에서 이용약관에 동의한 뒤 작성해주세요.');
}
