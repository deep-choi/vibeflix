import { db } from './api';

// Episodes for stories (novel, art, video) and update notes for products (app, game, website).
export const entryKind = (type: string) => (['novel', 'art', 'video'].includes(type) ? 'episode' : 'update') as 'episode' | 'update';
export const ENTRY_LIMITS = { title: 100, version: 30, note: 1000, perWork: 500 } as const;

export type EntryRow = Record<string, unknown>;
export const entryLabel = (e: EntryRow) => e.kind === 'episode' ? `${e.number}화 · ${e.title}` : `${e.version ? `v${String(e.version).replace(/^v/i, '')} · ` : ''}${e.title}`;
const visibleNow = "status='published' AND published_at<=?";

/** Entries of a work in reading order (episodes by number, updates newest first). Owners also see drafts and scheduled ones. */
export async function listEntries(projectId: string, kind: string, ownerView = false) {
  const order = kind === 'episode' ? 'number ASC, published_at ASC' : 'published_at DESC';
  const rows = await db().prepare(`SELECT id,kind,number,version,title,note,status,published_at,created,length(content) AS size FROM entries WHERE project_id=? ${ownerView ? '' : `AND ${visibleNow}`} ORDER BY ${order} LIMIT ${ENTRY_LIMITS.perWork}`).bind(...(ownerView ? [projectId] : [projectId, Date.now()])).all();
  return rows.results.map(r => ({ ...r, scheduled: r.status === 'published' && Number(r.published_at) > Date.now() }) as EntryRow & { id: string; status: string; number: number | null; published_at: number; scheduled: boolean });
}

/**
 * Tells readers about entries that have become visible: everyone who saved the work and everyone following its creator.
 * Runs when an entry is published and, for scheduled ones, lazily the first time the work is viewed after its time.
 */
export async function announceDueEntries(projectId: string) {
  const due = await db().prepare(`SELECT e.id,e.kind,e.number,e.version,e.title,p.owner_id,p.title AS work_title FROM entries e JOIN projects p ON p.id=e.project_id WHERE e.project_id=? AND e.status='published' AND e.published_at<=? AND e.notified_at IS NULL AND p.visibility='public' AND p.hidden_at IS NULL AND p.deleted_at IS NULL LIMIT 5`).bind(projectId, Date.now()).all().catch(() => ({ results: [] as EntryRow[] }));
  for (const e of due.results) {
    const claimed = await db().prepare('UPDATE entries SET notified_at=? WHERE id=? AND notified_at IS NULL').bind(Date.now(), e.id).run();
    if (!claimed.meta.changes) continue; // another request is already announcing it
    const owner = String(e.owner_id);
    const recipients = await db().prepare('SELECT user_id AS id FROM bookmarks WHERE project_id=? UNION SELECT follower_id AS id FROM follows WHERE creator_id=? LIMIT 1000').bind(projectId, owner).all();
    const now = Date.now(); const excerpt = `${e.work_title} · ${entryLabel(e)}`.slice(0, 140);
    const ops = recipients.results.filter(r => r.id !== owner).map(r => db().prepare('INSERT INTO notifications (id,recipient_id,actor_id,kind,target_kind,target_id,excerpt,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), r.id, owner, String(e.kind), 'entry', `${projectId}/${e.id}`, excerpt, now));
    for (let i = 0; i < ops.length; i += 50) await db().batch(ops.slice(i, i + 50));
  }
}
