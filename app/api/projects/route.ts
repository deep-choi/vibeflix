import { env } from 'cloudflare:workers';
import catalog from '../../public-catalog';
import { blockedOwners, requireContentConsent } from '../../../lib/member-safety';
import { currentUser } from '../../../lib/auth';
import { getSettings } from '../../../lib/admin';
import { PROJECT_COLUMNS, SOURCE_ORDER, contentStatements, isCuratedOrigin, listBanners, publicProject } from '../../../lib/projects';
import { parseProject, parseCover, parseContent, projectProblem, sameOrigin, boundedBody, genreTaxonomy, CONTENT, COVER, GALLERY, PROJECT_BODY_LIMIT } from '../../../lib/project-input';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });

export async function GET() {
  try {
    const user = await currentUser();
    const site = await getSettings();
    // Curated works first in their set order, then community works newest first
    const rows = await env.DB!.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE deleted_at IS NULL AND hidden_at IS NULL AND (visibility = 'public' OR owner_id = ?) ORDER BY ${SOURCE_ORDER}, sort, created DESC LIMIT 300`).bind(user?.id || '').all();
    const blocked = await blockedOwners(user?.id);
    const list = rows.results.filter(row => !blocked.has(String(row.owner_id))).map(row => publicProject(row, user?.id));
    const banners = await listBanners().catch(() => []);
    const batches=await env.DB!.batch<Record<string,unknown>>([
      env.DB!.prepare("SELECT target_id,COUNT(*) AS total,MAX(user_id=?) AS mine FROM reactions WHERE target_kind='project' GROUP BY target_id").bind(user?.id||''),
      env.DB!.prepare('SELECT project_id,AVG(score) AS average,COUNT(*) AS total,MAX(CASE WHEN user_id=? THEN score ELSE 0 END) AS mine FROM ratings GROUP BY project_id').bind(user?.id||''),
      env.DB!.prepare("SELECT target_id,COUNT(*) AS total FROM comments WHERE target_kind='project' AND deleted_at IS NULL AND hidden_at IS NULL GROUP BY target_id"),
    ]);
    // Description images are optional: never let a missing/old table take the whole catalog down.
    const galleryRows=await env.DB!.prepare('SELECT i.id, i.project_id FROM project_images i JOIN projects p ON p.id = i.project_id WHERE i.entry_id IS NULL AND p.deleted_at IS NULL AND p.hidden_at IS NULL ORDER BY i.project_id, i.position').all().catch(()=>({results:[] as Record<string,unknown>[]}));
    const galleries=new Map<string,string[]>();for(const r of galleryRows.results)galleries.set(String(r.project_id),[...(galleries.get(String(r.project_id))||[]),`/api/project-images/${r.id}`]);
    const reactions=new Map(batches[0].results.map(r=>[r.target_id,r]));const ratings=new Map(batches[1].results.map(r=>[r.project_id,r]));const comments=new Map(batches[2].results.map(r=>[r.target_id,r]));
    return json({ site:{notice:site.notice,noticeUrl:site.noticeUrl,pinned:site.pinned}, genres:genreTaxonomy, banners, projects:list.map(p=>({...p,recommendations:Number(reactions.get(p.id)?.total||0),recommended:!!reactions.get(p.id)?.mine,rating:Number(ratings.get(p.id)?.average||0),ratingCount:Number(ratings.get(p.id)?.total||0),myRating:Number(ratings.get(p.id)?.mine||0),commentCount:Number(comments.get(p.id)?.total||0),gallery:galleries.get(p.id)||[]})) });
  } catch (error) {
    console.error('Project list unavailable', error instanceof Error ? error.message : 'unknown');
    return json({ projects:catalog, error:'커뮤니티 작품을 불러오지 못했습니다. 잠시 후 새로고침해주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error:'올바른 사이트에서 다시 시도해주세요.' },403);
  const user = await currentUser();
  if (!user) return json({ error:'작품을 등록하려면 먼저 로그인해주세요.', signIn:'/signin-with-chatgpt?return_to=%2F%3Fupload%3D1' },401);
  try { await requireContentConsent(user.id); } catch (error) { return json({error:error instanceof Error?error.message:'이용약관 동의가 필요합니다.'},428); }
  if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'JSON 요청이 필요합니다.'},415);
  let text: string | null;
  try { text = await boundedBody(request, PROJECT_BODY_LIMIT); } catch { return json({error:'요청을 읽을 수 없습니다.'},400); }
  if (text === null) return json({error:'작품 정보가 너무 깁니다.'},413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({error:'작품 정보를 확인해주세요.'},400); }
  const project = parseProject(body);
  if (!project) return json({error:projectProblem(body)},400);
  const b = body as Record<string, unknown>;
  const rawImage = b.image;
  if (rawImage && !parseCover(rawImage)) return json({error:`커버 이미지는 ${COVER.width}×${COVER.height}px의 PNG·JPG·WebP, ${COVER.maxBytes/1024}KB 이하만 등록할 수 있어요.`},400);
  const image = rawImage ? String(rawImage) : '';
  // Body blocks; older clients still send a plain image list as `gallery`
  const blocks = parseContent(b.content !== undefined ? b.content : Array.isArray(b.gallery) ? b.gallery.map(data => ({ type:'image', data })) : []);
  if (!blocks) return json({error:`본문은 블록 ${CONTENT.maxBlocks}개, 이미지 ${CONTENT.maxImages}장(장당 ${GALLERY.maxBytes/1024}KB 이하), 글 ${CONTENT.maxTotalText.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`},400);
  try { if (project.url && await isCuratedOrigin(project.url)) return json({error:'이미 소개 중인 서비스입니다.'},409); } catch { return json({error:'지금은 등록할 수 없습니다. 잠시 후 다시 시도해주세요.'},503); }
  try {
    const created = Date.now();
    const id = `community-${crypto.randomUUID()}`;
    const { ops, json:content } = await contentStatements(id, blocks, created);
    const result = await env.DB!.prepare('INSERT INTO projects (id, owner_id, title, creator, type, description, url, image, created, genres, details, content, visibility) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM projects WHERE owner_id = ? AND created > ?) < 10 RETURNING id').bind(id,user.id,project.title,user.name,project.type,project.description,project.url||null,image,created,JSON.stringify(project.genres),JSON.stringify(project.details),content,b.draft===true?'draft':'public',user.id,created-86400000).all();
    if (!result.results.length) return json({error:'하루에 최대 10개까지 등록할 수 있습니다. 내일 다시 소개해주세요.'},429);
    if (ops.length) await env.DB!.batch(ops);
    const gallery = JSON.parse(content).filter((x:{type:string})=>x.type==='image').map((x:{id:string})=>`/api/project-images/${x.id}`);
    return json({ project:{...project,image:image?`/api/projects/${id}/cover?v=${image.length}`:'',creator:user.name,id,created,subtitle:project.description,owned:true,art:'custom',tags:['커뮤니티'],badge:'COMMUNITY',status:'live',draft:b.draft===true,rating:0,ratingCount:0,recommendations:0,commentCount:0,gallery} },201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return json({error:'같은 링크의 작품이 이미 등록되어 있습니다.'},409);
    if (error instanceof Error && 'status' in error) return json({error:error.message},Number((error as {status:number}).status));
    console.error('Project creation unavailable',error instanceof Error?error.message:'unknown');
    return json({error:'지금은 등록할 수 없습니다. 잠시 후 다시 시도해주세요.'},503);
  }
}
