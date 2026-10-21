import { ApiError, body, db, failure, json, origin } from '../../../../lib/api';
import { digest, ensureProfile, publicMember, sessionName } from '../../../../lib/auth';
import { verifyGoogleLogin } from '../../../../lib/google-auth';
import { POLICY_VERSION } from '../../../../lib/member-safety';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  origin(request);const b=await body(request,16000);if(typeof b.idToken!=='string')throw new ApiError(400,'Google 로그인 정보가 필요합니다.');
  const identity=await verifyGoogleLogin(b.idToken);if(b.acceptTerms!==true)throw new ApiError(400,'이용약관 및 개인정보처리방침 동의가 필요합니다.');const member=await ensureProfile(identity.id,identity.name,identity.avatar,identity.email);
  await db().prepare('INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,accepted=excluded.accepted').bind(member.id,POLICY_VERSION,Date.now()).run();
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');const expires=Date.now()+7*86400000;
  await db().prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
  await db().prepare('INSERT INTO sessions (hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),member.id,expires).run();
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  const response=json({user:publicMember(member)});response.headers.append('Set-Cookie',`${sessionName(request)}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`);response.headers.append('Set-Cookie',`vibeflix_signed_out=; Path=/; SameSite=Lax; Max-Age=0${secure}`);return response;
}catch(error){return failure(error);}}
