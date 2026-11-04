import { sessionName } from '../../../../lib/auth';
import { chatGPTSignInPath } from '../../../chatgpt-auth';
export const dynamic='force-dynamic';
export function GET(request:Request){const u=new URL(request.url);const response=new Response(null,{status:303,headers:{Location:chatGPTSignInPath(u.searchParams.get('return_to')||'/'),'Cache-Control':'no-store'}});const secure=u.protocol==='https:'?'; Secure':'';response.headers.append('Set-Cookie',`vibeflix_signed_out=; Path=/; SameSite=Lax; Max-Age=0${secure}`);response.headers.append('Set-Cookie',`${sessionName(request)}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);return response;}
