import firebase from '../public/firebase-config.json';
import { ApiError } from './api';
type Key=JsonWebKey & {kid:string};
let keyCache:{keys:Key[];expires:number}|null=null;
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export type LoginProvider='google.com'|'password';
/** Verifies a Firebase ID token from Google sign-in or VIBEFLIX email/password sign-in. Both require a verified email. */
export async function verifyFirebaseLogin(token:string,providers:LoginProvider[]=['google.com']){
  const parts=token.split('.');if(parts.length!==3||token.length>12000)throw new ApiError(401,'유효하지 않은 로그인 정보입니다.');
  let header,claims;try{header=JSON.parse(new TextDecoder().decode(decode(parts[0])));claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));}catch{throw new ApiError(401,'로그인 정보를 확인할 수 없습니다.');}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.aud!==firebase.projectId||claims.iss!==`https://securetoken.google.com/${firebase.projectId}`||typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||!Number.isFinite(claims.auth_time)||claims.auth_time>now+60||now-claims.auth_time>300||!providers.includes(claims.firebase?.sign_in_provider)||claims.email_verified!==true)throw new ApiError(401,claims.firebase?.sign_in_provider==='password'&&claims.email_verified!==true?'이메일 인증을 마친 뒤 로그인해주세요.':'다시 로그인해주세요.');
  if(!keyCache||keyCache.expires<Date.now()){const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new ApiError(503,'Google 로그인 확인 서비스에 연결할 수 없습니다.');const result=await response.json() as {keys:Key[]};keyCache={keys:result.keys,expires:Date.now()+3600000};}
  const jwk=keyCache.keys.find(k=>k.kid===header.kid);if(!jwk){keyCache=null;throw new ApiError(401,'로그인을 다시 시도해주세요.');}
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))throw new ApiError(401,'로그인 서명을 확인할 수 없습니다.');
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebase.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new ApiError(401,'사용할 수 없는 로그인입니다.');const result=await response.json() as {users?:{localId:string;disabled?:boolean;validSince?:string;displayName?:string;email?:string;photoUrl?:string}[]};const account=result.users?.[0];
  if(!account||account.localId!==claims.sub||account.disabled||Number(account.validSince||0)>claims.auth_time)throw new ApiError(401,'사용할 수 없는 계정입니다.');
  // Firebase keeps one uid per person, so Google and email sign-ins of the same account share a profile
  return{id:`google:${account.localId}`,name:account.displayName||'바이버',email:account.email||'',avatar:account.photoUrl?.startsWith('https://')?account.photoUrl:'',provider:claims.firebase.sign_in_provider==='password'?'email':'google'};
}
export const verifyGoogleLogin=(token:string)=>verifyFirebaseLogin(token,['google.com']);
