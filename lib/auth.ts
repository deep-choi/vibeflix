import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { ApiError, db } from './api';

export type Member={id:string;publicId:string;name:string;bio:string;avatar:string;isAdmin:boolean;provider:string};
export const sessionName=(request:Request)=>new URL(request.url).protocol==='https:'?'__Host-vibeflix_session':'vibeflix_session';
export async function digest(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
const config=()=>env as Cloudflare.Env & {ADMIN_EMAILS?:string};
function isAdminEmail(email:string){return !!email&&String(config().ADMIN_EMAILS||'').split(',').some(value=>value.trim().toLowerCase()===email.toLowerCase());}
export async function ensureProfile(id:string,name:string,avatar='',email='',provider=''){
  const now=Date.now();
  await db().prepare('INSERT INTO profiles (id, public_id, name, avatar, role, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id,crypto.randomUUID(),name.slice(0,40)||'바이버',avatar,isAdminEmail(email)?'admin':'member',now,now).run();
  if(isAdminEmail(email))await db().prepare("UPDATE profiles SET role = 'admin' WHERE id = ? AND role != 'admin'").bind(id).run();
  if(provider)await db().prepare('UPDATE profiles SET login_provider = ? WHERE id = ? AND login_provider != ?').bind(provider,id,provider).run().catch(()=>{});
  let p=await db().prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first();
  if(!p)throw new ApiError(503,'프로필을 불러올 수 없습니다.');
  // A temporary suspension ends by itself once its time has passed
  if(p.suspended&&p.suspended_until&&Number(p.suspended_until)<=now){
    await db().prepare('UPDATE profiles SET suspended=0,suspended_until=NULL,updated=? WHERE id=? AND suspended_until<=?').bind(now,id,now).run();
    p={...p,suspended:0,suspended_until:null};
  }
  if(p.suspended)throw new ApiError(403,await suspendedMessage(p.suspended_until?Number(p.suspended_until):null));
  return {id,publicId:String(p.public_id),name:String(p.name),bio:String(p.bio),avatar:String(p.avatar),isAdmin:p.role==='admin',provider:String(p.login_provider||'')||(id.startsWith('google:')?'google':'chatgpt')} as Member;
}
/** "이용이 제한된 계정입니다" plus when it ends and where to ask (the operator's public contact address). */
async function suspendedMessage(until:number|null){
  let contact='';try{const row=await db().prepare("SELECT value FROM settings WHERE key='contactEmail'").first();contact=row?String(JSON.parse(String(row.value))||''):'';}catch{}
  const end=until?` ${new Date(until+9*3600000).toISOString().slice(0,16).replace('T',' ').replace(/-/g,'.')}까지 이용할 수 없어요.`:'';
  return `이용이 제한된 계정입니다.${end}${contact?` 문의: ${contact}`:''}`;
}
export async function currentUser():Promise<Member|null>{
  const h=await headers();
  const cookie=h.get('cookie')||'';
  const token=cookie.split(';').map(p=>p.trim()).find(p=>p.startsWith('__Host-vibeflix_session=')||p.startsWith('vibeflix_session='))?.split('=').slice(1).join('=');
  if(token&&/^[a-f0-9]{64}$/.test(token)){
    const row=await db().prepare('SELECT user_id FROM sessions WHERE hash = ? AND expires > ?').bind(await digest(token),Date.now()).first();
    if(row)return ensureProfile(String(row.user_id),'바이버');
    return null;
  }
  if(cookie.split(';').some(p=>p.trim()==='vibeflix_signed_out=1'))return null;
  const chatgpt=await getChatGPTUser();
  return chatgpt?ensureProfile(chatgpt.userId,chatgpt.fullName||'바이버','',chatgpt.email,'chatgpt'):null;
}
export async function requireUser(){const user=await currentUser();if(!user)throw new ApiError(401,'로그인 후 이용해주세요.');return user;}
export async function requireAdmin(){const user=await requireUser();if(!user.isAdmin)throw new ApiError(403,'운영자 권한이 필요합니다.');return user;}
export const publicMember=(user:Member)=>({id:user.publicId,name:user.name,bio:user.bio,avatar:user.avatar,isAdmin:user.isAdmin,provider:user.provider});
