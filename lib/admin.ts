import { db } from './api';
import { digest } from './auth';

// Site-wide settings the operator edits from /admin. Stored one JSON value per key.
export type SiteSettings={notice:string;noticeUrl:string;pinned:string[];contactEmail:string};
export const defaultSettings:SiteSettings={notice:'',noticeUrl:'',pinned:[],contactEmail:''};

export async function getSettings():Promise<SiteSettings>{
  try{
    const rows=await db().prepare('SELECT key,value FROM settings').all();
    const out:SiteSettings={...defaultSettings};
    for(const r of rows.results){const key=String(r.key) as keyof SiteSettings;if(!(key in out))continue;try{(out as Record<string,unknown>)[key]=JSON.parse(String(r.value));}catch{}}
    return out;
  }catch{return {...defaultSettings};} // table missing before the migration runs: behave as unconfigured
}
export async function saveSettings(patch:Partial<SiteSettings>){
  const now=Date.now();
  const entries=Object.entries(patch).filter(([k])=>k in defaultSettings);
  if(entries.length)await db().batch(entries.map(([k,v])=>db().prepare('INSERT INTO settings (key,value,updated) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated').bind(k,JSON.stringify(v),now)));
}

export async function logAction(adminId:string,action:string,targetKind:string,targetId:string,note=''){
  await db().prepare('INSERT INTO admin_actions (id,admin_id,action,target_kind,target_id,note,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),adminId,action,targetKind,targetId,note.slice(0,300),Date.now()).run();
}

// Visit counting without storing IPs: a truncated daily hash only tells "same visitor today".
export const kstDay=(time=Date.now())=>new Date(time+9*3600000).toISOString().slice(0,10);
const BOT=/bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
export async function recordVisit(request:Request){
  try{
    const ua=request.headers.get('user-agent')||'';
    if(!ua||BOT.test(ua)||request.headers.get('purpose')==='prefetch')return;
    const day=kstDay();const ip=request.headers.get('cf-connecting-ip')||'';
    const visitor=(await digest(`vibeflix:${day}:${ip}:${ua}`)).slice(0,16);
    const statements=[
      db().prepare('INSERT INTO daily_views (day,views) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET views=views+1').bind(day),
      db().prepare('INSERT OR IGNORE INTO daily_visitors (day,visitor) VALUES (?,?)').bind(day,visitor),
    ];
    if(Math.random()<.01)statements.push(db().prepare('DELETE FROM daily_visitors WHERE day < ?').bind(kstDay(Date.now()-90*86400000)));
    await db().batch(statements);
  }catch{} // counting must never break the page
}

// ───── Permanent deletion (spam, illegal content, account deletion requests) ─────
// D1 caps bound parameters per statement, so id lists are processed in chunks.
const CHUNK=50;
const chunks=(ids:string[])=>Array.from({length:Math.ceil(ids.length/CHUNK)},(_,i)=>ids.slice(i*CHUNK,(i+1)*CHUNK));
const marks=(ids:string[])=>ids.map(()=>'?').join(',');
const run=(sql:string,ids:string[])=>db().prepare(sql.replace('(??)',`(${marks(ids)})`)).bind(...ids);
async function idsWhere(sql:string,ids:string[]){const out:string[]=[];for(const part of chunks(ids)){const rows=await run(sql,part).all();out.push(...rows.results.map(r=>String(r.id)));}return out;}

export async function purgeComments(ids:string[]){
  // replies go with their parent, however deep the thread
  const all=new Set(ids);let frontier=ids;
  while(frontier.length){frontier=(await idsWhere('SELECT id FROM comments WHERE parent_id IN (??)',frontier)).filter(id=>!all.has(id));frontier.forEach(id=>all.add(id));}
  for(const part of chunks([...all]))await db().batch([
    run("DELETE FROM reactions WHERE target_kind='comment' AND target_id IN (??)",part),
    run("DELETE FROM reports WHERE target_kind='comment' AND target_id IN (??)",part),
    run("DELETE FROM notifications WHERE target_kind='comment' AND target_id IN (??)",part),
    run('DELETE FROM comments WHERE id IN (??)',part),
  ]);
  return all.size;
}
export async function purgePosts(ids:string[]){
  await purgeComments(await idsWhere("SELECT id FROM comments WHERE target_kind='post' AND target_id IN (??)",ids));
  for(const part of chunks(ids))await db().batch([
    run("DELETE FROM reactions WHERE target_kind='post' AND target_id IN (??)",part),
    run("DELETE FROM reports WHERE target_kind='post' AND target_id IN (??)",part),
    run("DELETE FROM notifications WHERE target_kind='post' AND target_id IN (??)",part),
    run('DELETE FROM posts WHERE id IN (??)',part),
  ]);
}
export async function purgeProjects(ids:string[]){
  await purgeComments(await idsWhere("SELECT id FROM comments WHERE target_kind='project' AND target_id IN (??)",ids));
  for(const part of chunks(ids))await db().batch([
    run('DELETE FROM project_images WHERE project_id IN (??)',part),
    run('DELETE FROM ratings WHERE project_id IN (??)',part),
    run('DELETE FROM bookmarks WHERE project_id IN (??)',part),
    run("DELETE FROM reactions WHERE target_kind='project' AND target_id IN (??)",part),
    run("DELETE FROM reports WHERE target_kind='project' AND target_id IN (??)",part),
    run("DELETE FROM notifications WHERE target_kind='project' AND target_id IN (??)",part),
    run('UPDATE posts SET project_id=NULL WHERE project_id IN (??)',part),
    run('UPDATE banners SET project_id=NULL WHERE project_id IN (??)',part),
    run('DELETE FROM entries WHERE project_id IN (??)',part),
    run('DELETE FROM work_stats WHERE project_id IN (??)',part),
    run('DELETE FROM projects WHERE id IN (??)',part),
    ...part.map(id=>db().prepare("DELETE FROM notifications WHERE target_kind='entry' AND substr(target_id,1,?)=?").bind(id.length+1,`${id}/`)),
  ]);
  const s=await getSettings();if(s.pinned.some(id=>ids.includes(id)))await saveSettings({pinned:s.pinned.filter(id=>!ids.includes(id))});
}
/** Deletes a member and everything they created or left behind (account deletion request). */
export async function purgeUser(userId:string){
  const one=[userId];
  await purgeProjects(await idsWhere('SELECT id FROM projects WHERE owner_id IN (??)',one));
  await purgePosts(await idsWhere('SELECT id FROM posts WHERE owner_id IN (??)',one));
  await purgeComments(await idsWhere('SELECT id FROM comments WHERE owner_id IN (??)',one));
  await db().batch([
    db().prepare('DELETE FROM reactions WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM ratings WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM bookmarks WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM reports WHERE reporter_id=?').bind(userId),
    db().prepare('DELETE FROM notifications WHERE recipient_id=? OR actor_id=?').bind(userId,userId),
    db().prepare('DELETE FROM sessions WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM follows WHERE follower_id=? OR creator_id=?').bind(userId,userId),
    db().prepare('DELETE FROM limits WHERE substr(id,1,?)=?').bind(userId.length+1,userId+':'),
    db().prepare('DELETE FROM member_blocks WHERE owner_id=? OR target_id=?').bind(userId,userId),
    db().prepare('DELETE FROM policy_acceptances WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM deletion_requests WHERE user_id=?').bind(userId),
    db().prepare('DELETE FROM profiles WHERE id=?').bind(userId),
  ]);
}
