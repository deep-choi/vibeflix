import { env } from 'cloudflare:workers';
import catalog from '../../public-catalog';
import { getChatGPTUser } from '../../chatgpt-auth';
import { parseProject, sameOrigin, boundedBody } from '../../../lib/project-input';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });

export async function GET() {
  try {
    const user = await getChatGPTUser();
    const rows = await env.DB!.prepare('SELECT id, title, creator, type, description, url, image, created, owner_id FROM projects WHERE deleted_at IS NULL ORDER BY created DESC LIMIT 200').all();
    const community = rows.results.map(row => {
      const { owner_id, ...project } = row;
      return { ...project, owned: !!user && owner_id === user.userId, subtitle: row.description, art:'custom', tags:['커뮤니티'], badge:'COMMUNITY', status:'live' };
    });
    return json({ projects:[...catalog,...community] });
  } catch (error) {
    console.error('Project list unavailable', error instanceof Error ? error.message : 'unknown');
    return json({ projects:catalog, error:'커뮤니티 작품을 불러오지 못했습니다. 잠시 후 새로고침해주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error:'올바른 사이트에서 다시 시도해주세요.' },403);
  const user = await getChatGPTUser();
  if (!user) return json({ error:'작품을 등록하려면 먼저 로그인해주세요.', signIn:'/signin-with-chatgpt?return_to=%2F%3Fupload%3D1' },401);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'JSON 요청이 필요합니다.'},415);
  let text: string | null;
  try { text = await boundedBody(request); } catch { return json({error:'요청을 읽을 수 없습니다.'},400); }
  if (text === null) return json({error:'작품 정보가 너무 깁니다.'},413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({error:'작품 정보를 확인해주세요.'},400); }
  const project = parseProject(body);
  if (!project) return json({error:'이름, 소개, 카테고리와 공개 웹사이트 링크를 확인해주세요.'},400);
  if (catalog.some(p=>p.url && new URL(p.url).origin === new URL(project.url).origin)) return json({error:'이미 소개 중인 서비스입니다.'},409);
  try {
    const created = Date.now();
    const id = `community-${crypto.randomUUID()}`;
    const result = await env.DB!.prepare('INSERT INTO projects (id, owner_id, title, creator, type, description, url, image, created) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM projects WHERE owner_id = ? AND created > ?) < 10 RETURNING id').bind(id,user.userId,project.title,project.creator,project.type,project.description,project.url,project.image,created,user.userId,created-86400000).all();
    if (!result.results.length) return json({error:'하루에 최대 10개까지 등록할 수 있습니다. 내일 다시 소개해주세요.'},429);
    return json({ project:{...project,id,created,subtitle:project.description,owned:true,art:'custom',tags:['커뮤니티'],badge:'COMMUNITY',status:'live'} },201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return json({error:'같은 링크의 작품이 이미 등록되어 있습니다.'},409);
    console.error('Project creation unavailable',error instanceof Error?error.message:'unknown');
    return json({error:'지금은 등록할 수 없습니다. 잠시 후 다시 시도해주세요.'},503);
  }
}
