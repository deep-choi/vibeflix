import { env } from 'cloudflare:workers';
import catalog from '../../public-catalog';
import { blockedOwners, requireContentConsent } from '../../../lib/member-safety';
import { currentUser } from '../../../lib/auth';
import { activeNotice, getSettings } from '../../../lib/admin';
import { recordError } from '../../../lib/api';
import { PROJECT_COLUMNS, SOURCE_ORDER, cachedCatalog, contentStatements, invalidateCatalog, isCuratedOrigin, listBanners, listCollections, publicProject, storeCatalog } from '../../../lib/projects';
import { parseProject, parseCover, parseContent, projectProblem, sameOrigin, boundedBody, genreTaxonomy, CONTENT, COVER, GALLERY, PROJECT_BODY_LIMIT } from '../../../lib/project-input';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });

// The catalog is served in pages so it never silently stops at a fixed size; the site loads page 0 first and
// fetches the rest in the background. Site settings, banners and collections ride along on page 0 only.
const CATALOG_PAGE = 200;
export async function GET(request: Request) {
  const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(new URL(request.url).searchParams.get('offset')) || 0)));
  try {
    const user = await currentUser();
    const cacheKey = `catalog:${offset}`;
    if (!user) { const hit = cachedCatalog(cacheKey); if (hit) return new Response(hit, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Catalog-Cache': 'hit' } }); }
    // Curated works first in their set order, then community works newest first
    const rows = await env.DB!.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE deleted_at IS NULL AND hidden_at IS NULL AND (visibility = 'public' OR owner_id = ?) ORDER BY ${SOURCE_ORDER}, sort, created DESC, id LIMIT ? OFFSET ?`).bind(user?.id || '', CATALOG_PAGE, offset).all();
    const next = rows.results.length === CATALOG_PAGE ? offset + CATALOG_PAGE : null;
    const blocked = await blockedOwners(user?.id);
    const list = rows.results.filter(row => !blocked.has(String(row.owner_id))).map(row => publicProject(row, user?.id));
    // Counts only for the works on this page (ids passed as one JSON value, so there is no bound-parameter limit)
    const ids = JSON.stringify(list.map(p => p.id));
    const batches=await env.DB!.batch<Record<string,unknown>>([
      env.DB!.prepare("SELECT target_id,COUNT(*) AS total,MAX(user_id=?) AS mine FROM reactions WHERE target_kind='project' AND target_id IN (SELECT value FROM json_each(?)) GROUP BY target_id").bind(user?.id||'',ids),
      env.DB!.prepare('SELECT project_id,AVG(score) AS average,COUNT(*) AS total,MAX(CASE WHEN user_id=? THEN score ELSE 0 END) AS mine FROM ratings WHERE project_id IN (SELECT value FROM json_each(?)) GROUP BY project_id').bind(user?.id||'',ids),
      env.DB!.prepare("SELECT target_id,COUNT(*) AS total FROM comments WHERE target_kind='project' AND deleted_at IS NULL AND hidden_at IS NULL AND target_id IN (SELECT value FROM json_each(?)) GROUP BY target_id").bind(ids),
    ]);
    // Description images are optional: never let a missing/old table take the whole catalog down.
    const galleryRows=await env.DB!.prepare('SELECT id, project_id FROM project_images WHERE entry_id IS NULL AND project_id IN (SELECT value FROM json_each(?)) ORDER BY project_id, position').bind(ids).all().catch(()=>({results:[] as Record<string,unknown>[]}));
    const galleries=new Map<string,string[]>();for(const r of galleryRows.results)galleries.set(String(r.project_id),[...(galleries.get(String(r.project_id))||[]),`/api/project-images/${r.id}`]);
    const reactions=new Map(batches[0].results.map(r=>[r.target_id,r]));const ratings=new Map(batches[1].results.map(r=>[r.project_id,r]));const comments=new Map(batches[2].results.map(r=>[r.target_id,r]));
    const projects=list.map(p=>({...p,recommendations:Number(reactions.get(p.id)?.total||0),recommended:!!reactions.get(p.id)?.mine,rating:Number(ratings.get(p.id)?.average||0),ratingCount:Number(ratings.get(p.id)?.total||0),myRating:Number(ratings.get(p.id)?.mine||0),commentCount:Number(comments.get(p.id)?.total||0),gallery:galleries.get(p.id)||[]}));
    let head = {};
    if (!offset) {
      const site = await getSettings();
      const banners = await listBanners().catch(() => []);
      const collections = await listCollections().catch(() => []);
      head = { site:{...activeNotice(site),pinned:site.pinned}, genres:genreTaxonomy, banners, collections };
    }
    const body = JSON.stringify({ ...head, projects, next, pageSize: CATALOG_PAGE });
    if (!user) storeCatalog(cacheKey, body);
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('Project list unavailable', message); await recordError(message);
    return json({ projects:offset?[]:catalog, next:null, error:'커뮤니티 작품을 불러오지 못했습니다. 잠시 후 새로고침해주세요.' }, 503);
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
    // brand-new accounts (first 24 hours) get a smaller daily allowance: the usual shape of link-spam accounts
    const joined = Number((await env.DB!.prepare('SELECT created FROM profiles WHERE id=?').bind(user.id).first())?.created || 0);
    const daily = created - joined < 86400000 ? 2 : 10;
    const result = await env.DB!.prepare('INSERT INTO projects (id, owner_id, title, creator, type, description, url, image, created, genres, details, content, visibility, status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM projects WHERE owner_id = ? AND created > ?) < ? RETURNING id').bind(id,user.id,project.title,user.name,project.type,project.description,project.url||null,image,created,JSON.stringify(project.genres),JSON.stringify(project.details),content,b.draft===true?'draft':'public',project.status,user.id,created-86400000,daily).all();
    if (!result.results.length) return json({error:daily===2?'가입 첫날에는 작품을 2개까지 올릴 수 있어요. 내일부터는 하루 10개까지 가능해요.':'하루에 최대 10개까지 등록할 수 있습니다. 내일 다시 소개해주세요.'},429);
    if (ops.length) await env.DB!.batch(ops);
    invalidateCatalog();
    const gallery = JSON.parse(content).filter((x:{type:string})=>x.type==='image').map((x:{id:string})=>`/api/project-images/${x.id}`);
    // a first public work is when feedback matters most: the work page offers a ready-made 피드백 요청 post
    const firstWork = b.draft!==true && Number((await env.DB!.prepare("SELECT COUNT(*) n FROM projects WHERE owner_id=? AND visibility='public' AND deleted_at IS NULL").bind(user.id).first())?.n||0)===1;
    return json({ firstWork, project:{...project,image:image?`/api/projects/${id}/cover?v=${image.length}`:'',creator:user.name,id,created,subtitle:project.description,owned:true,art:'custom',tags:['커뮤니티'],badge:'COMMUNITY',status:project.status,draft:b.draft===true,rating:0,ratingCount:0,recommendations:0,commentCount:0,gallery} },201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return json({error:'같은 링크의 작품이 이미 등록되어 있습니다.'},409);
    if (error instanceof Error && 'status' in error) return json({error:error.message},Number((error as {status:number}).status));
    const message=error instanceof Error?error.message:'unknown';console.error('Project creation unavailable',message);await recordError(message);
    return json({error:'지금은 등록할 수 없습니다. 잠시 후 다시 시도해주세요.'},503);
  }
}
