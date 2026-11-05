import { kstDay } from './admin';
import { db } from './api';
import type { Member } from './auth';
import { entryLabel } from './entries';
import { BASE_CSS, coverPlaceholder, esc, fmtDate, htmlResponse, pageHead, topBar, typeNames } from './page-shell';
import { asset } from './security';
import type { WorkStats } from './stats';

// 내 스튜디오: every signed-in member's own place to upload AI-made work and look after it, whether or not they have uploaded yet.
export const COVER_SQL = "CASE WHEN p.image LIKE 'data:%' THEN '/api/projects/' || p.id || '/cover?v=' || length(p.image) ELSE p.image END";
export type StudioWork = Record<string, unknown> & { id: string; title: string; type: string; views30: number; clicks30: number; saves: number; comments: number; open_feedback: number };
export type WorkState = 'public' | 'upcoming' | 'draft' | 'hidden' | 'removed';

export const workState = (w: Record<string, unknown>): WorkState => w.deleted_at ? 'removed' : w.hidden_at ? 'hidden' : w.visibility === 'draft' ? 'draft' : w.status === 'upcoming' ? 'upcoming' : 'public';
const STATE: Record<WorkState, [label: string, tone: string]> = { public: ['공개 중', ' ok'], upcoming: ['개발 중 공개', ''], draft: ['임시 저장', ''], hidden: ['운영자가 숨김', ' warn'], removed: ['목록에서 내림', ''] };
export const stateBadge = (state: WorkState) => `<em class="chip${STATE[state][1]}">${STATE[state][0]}</em>`;
export const manageHref = (id: unknown) => `/studio/works/${encodeURIComponent(String(id))}`;
export const editHref = (id: unknown) => `/works/${encodeURIComponent(String(id))}/edit`;

/** Everything the member uploaded (also drafts, hidden and removed works: this is where they come back from), with 30-day numbers. */
export async function studioWorks(userId: string) {
  const since = kstDay(Date.now() - 29 * 86400000);
  const rows = await db().prepare(`SELECT p.id,p.title,p.type,p.status,p.visibility,p.hidden_at,p.deleted_at,p.created,${COVER_SQL} AS image,
    COALESCE((SELECT SUM(s.views) FROM work_stats s WHERE s.project_id=p.id AND s.day>=?),0) AS views30,
    COALESCE((SELECT SUM(s.clicks) FROM work_stats s WHERE s.project_id=p.id AND s.day>=?),0) AS clicks30,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.project_id=p.id) AS saves,
    (SELECT AVG(r.score) FROM ratings r WHERE r.project_id=p.id) AS rating,
    (SELECT COUNT(*) FROM comments c WHERE c.target_kind='project' AND c.target_id=p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL) AS comments,
    (SELECT COUNT(*) FROM comments c WHERE c.target_kind='project' AND c.target_id=p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL AND c.parent_id IS NULL AND c.label IN ('feedback','bug') AND c.status='') AS open_feedback
    FROM projects p WHERE p.owner_id=? AND p.source='community' ORDER BY p.created DESC LIMIT 500`).bind(since, since, userId).all();
  return rows.results as StudioWork[];
}
export const scheduledEntries = async (userId: string) => (await db().prepare("SELECT e.id,e.kind,e.number,e.version,e.title,e.published_at,e.project_id,p.title AS work_title FROM entries e JOIN projects p ON p.id=e.project_id WHERE p.owner_id=? AND p.source='community' AND p.deleted_at IS NULL AND e.status='published' AND e.published_at>? ORDER BY e.published_at LIMIT 10").bind(userId, Date.now()).all()).results;
export const followerCount = async (userId: string) => Number((await db().prepare('SELECT COUNT(*) n FROM follows WHERE creator_id=?').bind(userId).first())?.n || 0);

const COVERLESS = (w: Record<string, unknown>) => coverPlaceholder(w.id, w.type);
export const workCover = (w: Record<string, unknown>) => w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy">` : COVERLESS(w);
const metric = (label: string, value: unknown) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
/** One line of the works list: wide table on a desktop, a card on a phone. */
export function workRow(w: StudioWork) {
  const state = workState(w), manage = manageHref(w.id);
  return `<li class="st-work" data-state="${state}"><a class="st-cover" href="${manage}" tabindex="-1" aria-hidden="true">${workCover(w)}</a><div class="st-work-main"><a class="st-work-title" href="${manage}">${esc(w.title)}</a><p>${esc(typeNames[w.type] || '')} · ${fmtDate(w.created)} ${stateBadge(state)}</p></div><dl class="st-metrics">${metric('조회 30일', w.views30)}${metric('링크 클릭', w.clicks30)}${metric('찜', w.saves)}${metric('별점', w.rating ? Number(w.rating).toFixed(1) : '—')}${metric('댓글', w.comments)}</dl><div class="st-actions"><a class="btn small primary" href="${manage}">관리</a>${state === 'hidden' || state === 'removed' ? '' : `<a class="btn small" href="${editHref(w.id)}">수정</a>`}</div></li>`;
}
export const uploadTypes = () => Object.entries(typeNames).map(([type, name]) => `<a class="chip-btn" href="/works/new?type=${type}">${esc(name)}</a>`).join('');
export const entryName = (e: Record<string, unknown>) => entryLabel(e);

/** Owner-only insights: 30 days of views as bars, where views came from, and how far readers get through episodes. */
export function workInsights(stats: WorkStats, entries: Record<string, unknown>[], kind: string) {
  const max = Math.max(1, ...stats.daily.map(d => d.views)); const W = 300, H = 72, bw = W / stats.daily.length;
  const bars = stats.daily.map((d, i) => { const h = d.views ? Math.max(2, (d.views / max) * (H - 4)) : 0; return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${d.day} · 조회 ${d.views} · 링크 클릭 ${d.clicks}</title></rect>`; }).join('');
  const chart = !stats.views30 ? '<div class="insight"><span>최근 30일 조회</span><p class="muted">아직 조회가 없어요. 커뮤니티에 소개 글을 쓰거나 링크를 공유해보세요.</p></div>' : `<div class="insight"><span>최근 30일 조회</span><svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="최근 30일 일별 조회수, 최대 ${max}회">${bars}</svg><small><em>${stats.daily[0].day.slice(5).replace('-', '/')}</em><em>오늘</em></small></div>`;
  const total = stats.sources.reduce((n, s) => n + s.views, 0);
  const sources = `<div class="insight"><span>어디서 왔나요 · 30일</span>${total ? `<ul class="bars">${stats.sources.map(s => `<li><b>${esc(s.source)}</b><i style="--w:${Math.round((s.views / total) * 100)}%"></i><em>${s.views}</em></li>`).join('')}</ul>` : '<p class="muted">아직 기록된 방문이 없어요.</p>'}</div>`;
  const views = new Map(stats.entries.map(e => [e.id, e.views]));
  const published = entries.filter(e => e.status === 'published' && !e.scheduled);
  const list = kind === 'episode' ? published : published.slice(0, 8);
  const first = kind === 'episode' && list.length ? views.get(String(list[0].id)) || 0 : 0; const top = Math.max(1, ...list.map(e => views.get(String(e.id)) || 0));
  const reading = list.length ? `<div class="insight wide"><span>${kind === 'episode' ? '회차별 조회 · 1화 대비 남은 독자' : '업데이트 소식 조회'}</span><ul class="bars">${list.map(e => { const v = views.get(String(e.id)) || 0; return `<li><b>${esc(entryLabel(e))}</b><i style="--w:${Math.round((v / top) * 100)}%"></i><em>${v}${kind === 'episode' && first ? ` · ${Math.round((v / first) * 100)}%` : ''}</em></li>`; }).join('')}</ul></div>` : '';
  return `<div class="insights">${chart}${sources}${reading}</div>`;
}

type Shell = { title: string; active: 'home' | 'works'; user: Member; body: string; config?: unknown; sections?: boolean };
/** The studio frame: site bar, the studio menu, and the page. */
export const studioPage = ({ title, active, user, body, config = {}, sections }: Shell) => htmlResponse(`${pageHead(`${title} · 내 스튜디오`, '<meta name="robots" content="noindex">')}<link rel="stylesheet" href="${asset('/work.css')}"><link rel="stylesheet" href="${asset('/form-page.css')}"><link rel="stylesheet" href="${asset('/studio.css')}"><style>@layer page{${BASE_CSS}}</style></head><body>
${topBar('/', '사이트로 돌아가기')}
<div class="st-layout"><nav class="st-nav" aria-label="내 스튜디오"><p class="st-who"><b>${esc(user.name)}</b><span>내 스튜디오</span></p><a href="/studio"${active === 'home' ? ' aria-current="page"' : ''}>개요</a><a href="/studio/works"${active === 'works' ? ' aria-current="page"' : ''}>내 작품</a><a href="/posts/new">이야기 쓰기</a><a href="/creators/${esc(user.publicId)}">내 크리에이터 페이지</a><a href="/account">내 계정</a><a class="btn primary st-upload" href="/works/new">＋ 작품 올리기</a></nav>
<main class="st-main${sections ? ' has-sections' : ''}">${body}</main></div>
<script type="application/json" id="studio-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>
<script src="${asset('/social.js')}" defer></script><script src="${asset('/mobile-safety.js')}" defer></script><script src="${asset('/studio.js')}" defer></script></body></html>`, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
