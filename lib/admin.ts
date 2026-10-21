import { db } from './api';
import { digest } from './auth';

// Site-wide settings the operator edits from /admin. Stored one JSON value per key.
export type SiteSettings={notice:string;noticeUrl:string;pinned:string[];hiddenCatalog:string[];contactEmail:string};
export const defaultSettings:SiteSettings={notice:'',noticeUrl:'',pinned:[],hiddenCatalog:[],contactEmail:''};

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
