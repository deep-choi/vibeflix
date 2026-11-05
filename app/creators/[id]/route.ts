import { db } from '../../../lib/api';
import { blockedOwners } from '../../../lib/member-safety';
import { currentUser } from '../../../lib/auth';
import { entryLabel } from '../../../lib/entries';
import { BASE_CSS, coverPlaceholder, esc, fmtDate, htmlResponse, pageHead, topBar, typeNames } from '../../../lib/page-shell';
import { asset } from '../../../lib/security';

// A creator's page: who they are, their public works, recent episodes/updates, and a follow button.
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const p = await db().prepare('SELECT id,public_id,name,bio,avatar,links,created FROM profiles WHERE public_id=? AND suspended=0').bind(id).first().catch(() => null);
  if (!p) return new Response('크리에이터를 찾을 수 없어요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const user = await currentUser().catch(() => null); if((await blockedOwners(user?.id)).has(String(p.id)))return new Response('차단한 이용자의 콘텐츠입니다.',{status:404});
  const self = user?.id === p.id;
  const works = (await db().prepare("SELECT id,title,type,status,subtitle,description,details,CASE WHEN image LIKE 'data:%' THEN '/api/projects/' || id || '/cover?v=' || length(image) ELSE image END AS image FROM projects WHERE owner_id=? AND deleted_at IS NULL AND hidden_at IS NULL AND visibility='public' ORDER BY created DESC LIMIT 60").bind(p.id).all()).results;
  const s = await db().prepare("SELECT (SELECT COUNT(*) FROM follows WHERE creator_id=?) followers,EXISTS(SELECT 1 FROM follows WHERE creator_id=? AND follower_id=?) following,(SELECT AVG(r.score) FROM ratings r JOIN projects w ON w.id=r.project_id WHERE w.owner_id=?) rating,(SELECT COUNT(*) FROM ratings r JOIN projects w ON w.id=r.project_id WHERE w.owner_id=?) ratings").bind(p.id, p.id, user?.id || '', p.id, p.id).first();
  const recent = (await db().prepare("SELECT e.id,e.kind,e.number,e.version,e.title,e.published_at,w.id AS work_id,w.title AS work_title FROM entries e JOIN projects w ON w.id=e.project_id WHERE w.owner_id=? AND w.visibility='public' AND w.hidden_at IS NULL AND w.deleted_at IS NULL AND e.status='published' AND e.published_at<=? ORDER BY e.published_at DESC LIMIT 6").bind(p.id, Date.now()).all()).results;
  // A creator page doubles as a portfolio: each work shows its tech stack and AI tools, and the profile its links
  const parse = (v: unknown): Record<string, any> => { try { const d = JSON.parse(String(v || '{}')); return d && typeof d === 'object' ? d : {}; } catch { return {}; } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const stackOf = (w: Record<string, unknown>) => { const d = parse(w.details); return [...(Array.isArray(d.stack) ? d.stack : []), ...(Array.isArray(d.making?.tools) ? d.making.tools : [])].map(String).slice(0, 4); };
  const card = (w: Record<string, unknown>) => `<a class="work" href="/works/${encodeURIComponent(String(w.id))}"><span class="thumb"${w.image ? ` style="background-image:url('${esc(w.image)}')"` : ''}>${w.image ? '' : coverPlaceholder(w.id, w.type)}</span><b>${esc(w.title)}</b><small>${esc(typeNames[String(w.type)] || '')}${w.status === 'upcoming' ? ' · 개발 중' : ''}</small>${stackOf(w).length ? `<span class="stack">${stackOf(w).map(t => `<em>${esc(t)}</em>`).join('')}</span>` : ''}</a>`;
  let links: string[] = []; try { const v = JSON.parse(String(p.links || '[]')); if (Array.isArray(v)) links = v.map(String).filter(u => /^https?:\/\//.test(u)).slice(0, 3); } catch {}
  const linkLabel = (u: string) => { try { const h = new URL(u); return (h.hostname.replace(/^www\./, '') + (h.pathname.length > 1 ? h.pathname : '')).slice(0, 40); } catch { return u.slice(0, 40); } };
  const html = `${pageHead(`${p.name}`, `<meta name="description" content="${esc(p.bio || `${p.name}님의 작품`)}">`)}
<style>@layer page{${BASE_CSS}
.profile{display:flex;align-items:center;gap:22px;flex-wrap:wrap}.avatar{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;background:#c3f56822;color:var(--lime);font:800 34px 'DM Sans',sans-serif;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}
.profile h1{margin:0;font-size:clamp(28px,4vw,40px);color:#fff;letter-spacing:-1px}.profile p{margin:4px 0 0;color:#bdbdbd;white-space:pre-line}.who{flex:1;min-width:220px}
.counts{display:flex;gap:18px;margin-top:10px;color:#9a9a9a;font-size:14px}.counts b{color:#fff;margin-right:4px}
.works{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.work{display:block}.thumb{display:block;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#1a1a1a center/cover no-repeat;border:1px solid var(--line)}.work:hover .thumb{border-color:#ffffff40}.work b{display:block;margin-top:8px;color:#fff}.work small{color:#8d8d8d}
.stack{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.stack em{font-style:normal;font-size:11.5px;padding:1px 8px;border-radius:999px;background:#ffffff10;color:#cfcfcf}
.links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.links a{font-size:13.5px;color:var(--lime);padding:4px 12px;border-radius:999px;border:1px solid #c3f56840}.links a:hover{background:#c3f5681a}
.recent{list-style:none;margin:0;padding:0;border-radius:12px;border:1px solid var(--line);background:var(--panel)}.recent li{border-bottom:1px solid var(--line)}.recent li:last-child{border-bottom:0}.recent a{display:flex;justify-content:space-between;gap:12px;padding:13px 16px}.recent a:hover{background:#ffffff08}.recent span{color:#8d8d8d;font-size:13px;white-space:nowrap}}</style></head><body>
${topBar()}<main><section class="profile"><div class="avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(String(p.name || 'V')[0])}</div><div class="who"><h1>${esc(p.name)}</h1>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}${links.length ? `<div class="links">${links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow" data-leave-guard>${esc(linkLabel(u))} ↗</a>`).join('')}</div>` : ''}<div class="counts"><span><b>${works.length}</b>작품</span><span><b data-follower-count>${Number(s?.followers || 0)}</b>팔로워</span>${Number(s?.ratings) ? `<span><b>★ ${Number(s?.rating).toFixed(1)}</b>받은 별점</span>` : ''}</div></div>${self ? '<a class="btn" href="/#profile">내 프로필 수정</a>' : `<button class="btn${s?.following ? ' on' : ''}" data-follow>${s?.following ? '팔로잉' : '＋ 팔로우'}</button>`}</section>
${recent.length ? `<div class="section-title"><h2>최근 올린 회차 · 소식</h2></div><ul class="recent">${recent.map(e => `<li><a href="/works/${encodeURIComponent(String(e.work_id))}/e/${encodeURIComponent(String(e.id))}"><b>${esc(e.work_title)} · ${esc(entryLabel(e))}</b><span>${fmtDate(e.published_at)}</span></a></li>`).join('')}</ul>` : ''}
<div class="section-title"><h2>작품</h2><span>${works.length}개</span></div>${works.length ? `<div class="works">${works.map(card).join('')}</div>` : '<p class="muted">아직 공개한 작품이 없어요.</p>'}</main>
<script type="application/json" id="work-config">${JSON.stringify({ creatorId: p.public_id, loggedIn: !!user, following: !!s?.following, creatorPage: true }).replace(/</g, '\\u003c')}</script><script src="${asset('/social.js')}" defer></script><script src="${asset('/work.js')}" defer></script><script src="${asset('/leave-guard.js')}" defer></script></body></html>`;
  return htmlResponse(html);
}
