import { db } from './api';
import { parseGalleryImage } from './project-input';

// Curated works first, then member uploads, then sample placeholders
export const SOURCE_ORDER="CASE source WHEN 'catalog' THEN 0 WHEN 'community' THEN 1 ELSE 2 END";
export const PROJECT_COLUMNS="id, owner_id, title, creator, type, description, url, CASE WHEN image LIKE 'data:%' THEN '/api/projects/' || id || '/cover?v=' || length(image) ELSE image END AS image, created, source, subtitle, art, badge, status, tags, genres, featured, sort, hidden_at";
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
  return {id:String(row.id),projectId:row.project_id?String(row.project_id):'',title:row.title,description:row.description,buttonLabel:row.button_label,buttonIcon:row.button_icon,url:row.url,theme:row.theme,image:bannerImageUrl(row),sort:row.sort,enabled:!!row.enabled};
}
export async function listBanners(includeDisabled=false){
  const rows=await db().prepare(`SELECT * FROM banners ${includeDisabled?'':'WHERE enabled=1'} ORDER BY sort, created`).all();
  return rows.results.map(publicBanner);
}
