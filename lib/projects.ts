import { ApiError, db } from './api';
import { parseGalleryImage, type ContentBlock } from './project-input';

// Curated works first, then member uploads, then sample placeholders
export const SOURCE_ORDER="CASE source WHEN 'catalog' THEN 0 WHEN 'community' THEN 1 ELSE 2 END";
export const PROJECT_COLUMNS="id, owner_id, title, creator, type, description, url, CASE WHEN image LIKE 'data:%' THEN '/api/projects/' || id || '/cover?v=' || length(image) ELSE image END AS image, created, source, subtitle, art, badge, status, tags, genres, details, visibility, featured, sort, hidden_at, verified_at, (SELECT public_id FROM profiles WHERE profiles.id = projects.owner_id) AS owner_public_id";
const parseTags=(value:unknown)=>{try{const v=JSON.parse(String(value||'[]'));return Array.isArray(v)?v.map(String):[];}catch{return [];}};

// Shape a projects row the way the site expects (curated and community works look the same to the client).
export function publicProject(row:Record<string,unknown>,userId=''){
  const community=row.source==='community';
  const tags=parseTags(row.tags);
  return {
    id:String(row.id),title:row.title,creator:row.creator,type:row.type,description:row.description,
    subtitle:row.subtitle||row.description,url:row.url||'',image:row.image||'',created:row.created,
    art:row.art||'custom',tags:tags.length?tags:community?['커뮤니티']:[],genres:parseTags(row.genres),badge:row.badge||(community?'COMMUNITY':''),
    status:row.status||'live',featured:!!row.featured,owned:!!userId&&row.source==='community'&&row.owner_id===userId,
    sample:row.source==='sample', // placeholder content an operator added; shown with a "예시" label and no link
    draft:row.visibility==='draft',
    // curated works are the operator's own; community links count as checked once an operator verified them
    verified:row.source==='catalog'||!!row.verified_at,creatorId:row.source==='catalog'?'':String(row.owner_public_id||''),
    details:(()=>{try{const d=JSON.parse(String(row.details||'{}'));return d&&typeof d==='object'?d:{};}catch{return {};}})(),
  };
}

/** True when the link points at the same site as a curated work (a curated work never matches itself). */
export async function isCuratedOrigin(url:string,exceptId=''){
  const rows=await db().prepare("SELECT id,url FROM projects WHERE source='catalog' AND url IS NOT NULL AND deleted_at IS NULL").all();
  const origin=new URL(url).origin;
  return rows.results.some(r=>r.id!==exceptId&&(()=>{try{return new URL(String(r.url)).origin===origin;}catch{return false;}})());
}

// Banner images: built-in paths under /assets, or uploaded data URLs served from /api/banners/:id/image.
export const BANNER_IMAGE={maxBytes:700*1024,maxDimension:4096} as const; // same ceiling as description images
export const bannerImageUrl=(row:Record<string,unknown>)=>{const image=String(row.image||'');return image.startsWith('data:')?`/api/banners/${row.id}/image?v=${image.length}`:image;};
export const parseBannerImage=(value:unknown)=>{const image=parseGalleryImage(value);return image&&image.bytes.length<=BANNER_IMAGE.maxBytes?image:null;};
export function publicBanner(row:Record<string,unknown>){
  return {id:String(row.id),projectId:row.project_id?String(row.project_id):'',title:row.title,description:row.description,buttonLabel:row.button_label,buttonIcon:row.button_icon,url:row.url,theme:row.theme,image:bannerImageUrl(row),sort:row.sort,enabled:!!row.enabled,startsAt:row.starts_at?Number(row.starts_at):null,endsAt:row.ends_at?Number(row.ends_at):null};
}
/** Scheduled rows (banners, collections) are live when enabled and inside their optional start/end window. */
export const LIVE_WINDOW='enabled=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?)';
export async function listBanners(includeAll=false){
  const now=Date.now();
  const rows=await (includeAll?db().prepare('SELECT * FROM banners ORDER BY sort, created'):db().prepare(`SELECT * FROM banners WHERE ${LIVE_WINDOW} ORDER BY sort, created`).bind(now,now)).all();
  return rows.results.map(publicBanner);
}

// ───── Collections (기획전): operator-curated rows on the home page ─────
export const parseIds=(value:unknown)=>{try{const v=JSON.parse(String(value||'[]'));return Array.isArray(v)?v.map(String):[];}catch{return [];}};
export function publicCollection(row:Record<string,unknown>){
  return {id:String(row.id),title:String(row.title),description:String(row.description||''),projectIds:parseIds(row.project_ids),sort:Number(row.sort||0),enabled:!!row.enabled,startsAt:row.starts_at?Number(row.starts_at):null,endsAt:row.ends_at?Number(row.ends_at):null};
}
export async function listCollections(includeAll=false){
  const now=Date.now();
  const rows=await (includeAll?db().prepare('SELECT * FROM collections ORDER BY sort, created'):db().prepare(`SELECT * FROM collections WHERE ${LIVE_WINDOW} ORDER BY sort, created`).bind(now,now)).all();
  return rows.results.map(publicCollection);
}

/** Tells everyone who saved an upcoming work that it is now live (once per launch). */
export async function announceLaunch(projectId:string,actorId:string,title:string){
  const recipients=await db().prepare('SELECT user_id FROM bookmarks WHERE project_id=? LIMIT 2000').bind(projectId).all();
  const now=Date.now();
  const ops=recipients.results.filter(r=>r.user_id!==actorId).map(r=>db().prepare('INSERT INTO notifications (id,recipient_id,actor_id,kind,target_kind,target_id,excerpt,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),r.user_id,actorId,'launch','project',projectId,`${title} · 지금 만나볼 수 있어요`.slice(0,140),now));
  for(let i=0;i<ops.length;i+=50)await db().batch(ops.slice(i,i+50));
  return ops.length;
}

// ───── Public catalog cache ─────
// Signed-out visitors all get the same catalog page, so each Worker isolate keeps it for a short while instead of
// re-running the list and its aggregates on every home visit. Writes in this isolate clear it straight away;
// other isolates catch up within CATALOG_TTL. (The Cache API is not available on workers.dev, so this lives in memory.)
export const CATALOG_TTL=30_000;
const catalogCache=new Map<string,{at:number;body:string}>();
export function cachedCatalog(key:string){const hit=catalogCache.get(key);return hit&&Date.now()-hit.at<CATALOG_TTL?hit.body:null;}
export function storeCatalog(key:string,body:string){if(catalogCache.size>50)catalogCache.clear();catalogCache.set(key,{at:Date.now(),body});}
let catalogGeneration=0;
/** Bumped by every catalog write in this isolate; other per-isolate caches built from works (the sitemap) compare it. */
export const catalogGen=()=>catalogGeneration;
export function invalidateCatalog(){catalogCache.clear();catalogGeneration++;}

/**
 * Turns validated body blocks into D1 statements: new images are inserted into project_images, kept ones are
 * re-ordered, and images no longer referenced are deleted. Images are scoped to the work body (entryId null)
 * or to one episode/update. Returns the JSON to store in the content column.
 */
export async function contentStatements(projectId:string,blocks:ContentBlock[],now=Date.now(),entryId:string|null=null){
  const existing=new Set(((await db().prepare('SELECT id FROM project_images WHERE project_id=? AND entry_id IS ?').bind(projectId,entryId).all()).results).map(r=>String(r.id)));
  const stored:Record<string,string>[]=[];const ops:D1PreparedStatement[]=[];const keep=new Set<string>();let position=0;
  for(const b of blocks){
    if(b.type==='video'){stored.push({type:'video',url:b.url});continue;}
    if(b.type!=='image'){stored.push({type:b.type,text:b.text});continue;}
    if(b.data){const id=`img-${crypto.randomUUID()}`;ops.push(db().prepare('INSERT INTO project_images (id,project_id,position,data,created,entry_id) VALUES (?,?,?,?,?,?)').bind(id,projectId,position++,b.data,now,entryId));stored.push({type:'image',id,caption:b.caption||''});}
    else if(b.id&&existing.has(b.id)){keep.add(b.id);ops.push(db().prepare('UPDATE project_images SET position=? WHERE id=? AND project_id=?').bind(position++,b.id,projectId));stored.push({type:'image',id:b.id,caption:b.caption||''});}
    else throw new ApiError(400,'본문 이미지 정보를 확인해주세요. 새로고침 후 다시 시도해주세요.');
  }
  for(const id of existing)if(!keep.has(id))ops.push(db().prepare('DELETE FROM project_images WHERE id=? AND project_id=?').bind(id,projectId));
  return {ops,json:JSON.stringify(stored)};
}
export type ResolvedBlock={type:'heading'|'text';text:string}|{type:'image';id:string;src:string;caption:string}|{type:'video';url:string};
/** Body blocks for the editor/viewer, with image ids resolved to URLs. */
export function resolveContent(raw:unknown):ResolvedBlock[]{
  let blocks:Record<string,string>[]=[];try{const v=JSON.parse(String(raw||'[]'));if(Array.isArray(v))blocks=v;}catch{}
  return blocks.map(b=>b.type==='image'?{type:'image' as const,id:b.id,src:b.src||`/api/project-images/${b.id}`,caption:b.caption||''}:b.type==='video'?{type:'video' as const,url:b.url}:{type:(b.type==='heading'?'heading':'text') as 'heading'|'text',text:String(b.text||'')});
}
