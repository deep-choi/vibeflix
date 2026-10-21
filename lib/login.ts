import { ApiError, body, db, json, limit, origin } from './api';
import { digest, ensureProfile, publicMember, sessionName } from './auth';
import { verifyFirebaseLogin, type LoginProvider } from './google-auth';
import { POLICY_VERSION } from './member-safety';

/**
 * Exchanges a Firebase ID token (Google or VIBEFLIX email sign-in) for our own 7-day session cookie.
 * The visitor must accept the current terms; their consent is recorded with the session.
 */
export async function firebaseSignIn(request: Request, providers: LoginProvider[]) {
  origin(request);
  const b = await body(request, 16000);
  if (typeof b.idToken !== 'string') throw new ApiError(400, '로그인 정보가 필요합니다.');
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await limit(`ip:${await digest(ip)}`, 'login', 20); // brute-force guard on top of Firebase's own limits
  const identity = await verifyFirebaseLogin(b.idToken, providers);
  if (b.acceptTerms !== true) throw new ApiError(400, '이용약관 및 개인정보처리방침 동의가 필요합니다.');
  const member = await ensureProfile(identity.id, identity.name, identity.avatar, identity.email, identity.provider);
  await db().prepare('INSERT INTO policy_acceptances(user_id,version,accepted) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,accepted=excluded.accepted').bind(member.id, POLICY_VERSION, Date.now()).run();
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
  await db().prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
  await db().prepare('INSERT INTO sessions (hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token), member.id, Date.now() + 7 * 86400000).run();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const response = json({ user: publicMember(member) });
  response.headers.append('Set-Cookie', `${sessionName(request)}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`);
  response.headers.append('Set-Cookie', `vibeflix_signed_out=; Path=/; SameSite=Lax; Max-Age=0${secure}`);
  return response;
}
