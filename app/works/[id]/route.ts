import { db } from '../../../lib/api';
import { blockedOwners } from '../../../lib/member-safety';
import { currentUser } from '../../../lib/auth';
import { stats as reactionStats } from '../../../lib/community';
import { announceDueEntries, entryKind, entryLabel, listEntries } from '../../../lib/entries';
import { DAY_NAMES, parseVideoUrl } from '../../../lib/project-input';
import { resolveContent } from '../../../lib/projects';
import { sampleBlocks, sampleContent, type Scene } from '../../../lib/sample-content';
import { SCENE_CSS, playerScript, scenePlayer } from '../../../lib/scene-player';
import { BASE_CSS, coverPlaceholder, embed, esc, fmtDate, htmlResponse, pageHead, renderBlocks, topBar, typeNames, type ViewBlock } from '../../../lib/page-shell';
import { asset } from '../../../lib/security';
import { waitUntil } from 'cloudflare:workers';
import { countWork, workStats, type WorkStats } from '../../../lib/stats';

// One detail page for every work: media → title and actions → category facts and how it was made with AI →
// description → episodes or update notes → body → ratings and comments. Owners also get their stats and an entry editor.
export const dynamic = 'force-dynamic';
type Details = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? v : []).map(String);
const WARNING_NAMES: Record<string, string> = { violence: '폭력', horror: '공포', language: '거친 언어', mature: '성인 소재', flashing: '깜빡이는 화면' };
const LICENSE_NAMES: Record<string, string> = { 'all-rights': '모든 권리 보유 · 무단 사용 금지', 'cc-by': 'CC BY · 출처 표시 후 사용 가능', 'cc-by-nc': 'CC BY-NC · 출처 표시, 비상업적 사용만', cc0: 'CC0 · 자유롭게 사용 가능' };

function infoCards(type: string, d: Details, blocks: ViewBlock[], entryCount: number) {
  const card = (label: string, body: string, wide = false) => body ? `<div class="info${wide ? ' wide' : ''}"><span>${label}</span>${body}</div>` : '';
  const chips = (items: string[]) => items.length ? `<p class="chips">${items.map(x => `<em class="chip">${esc(x)}</em>`).join('')}</p>` : '';
  const p = (v: unknown) => v ? `<p>${esc(v)}</p>` : '';
  const form = d.form === 'serial' ? (type === 'video' ? '시리즈' : '연재') : d.form === 'single' ? '단편' : '';
  if (type === 'website') return card('주요 기능', list(d.features).length ? `<ul>${list(d.features).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '') + card('사용 기술', chips(list(d.stack)));
  if (type === 'app') return card('사용 기술', chips(list(d.stack))) + card('플랫폼', chips(list(d.platforms).map(x => ({ ios: 'iOS', android: 'Android', web: '웹' }[x] || x)))) + card('가격', p({ free: '무료', paid: '유료', iap: '무료 · 앱 내 결제' }[String(d.price)])) + card('베타 테스터', d.beta ? `<p>모집 중${d.betaUrl ? ` · <a href="${esc(d.betaUrl)}" target="_blank" rel="noopener noreferrer" data-track-click>참여하기 ↗</a>` : ''}</p>` : '');
  if (type === 'game') return card('사용 기술', chips(list(d.stack))) + card('개발 단계', p({ demo: '데모', early: '얼리 액세스', release: '정식 출시' }[String(d.stage)])) + card('플레이 방식', p({ browser: '브라우저에서 바로', download: '다운로드 설치', mobile: '모바일' }[String(d.playMode)])) + card('조작 장치', chips(list(d.inputs).map(x => ({ keyboard: '키보드', mouse: '마우스', gamepad: '게임패드', touch: '터치' }[x] || x)))) + card('플레이 시간', p(d.playtime)) + card('조작법', d.controls ? `<p class="pre">${esc(d.controls)}</p>` : '', true);
  if (type === 'art') return card('형식', p([{ illustration: '일러스트', webtoon: '웹툰 (세로 스크롤)', comic: '만화' }[String(d.format)], form].filter(Boolean).join(' · '))) + card('연재 일정', p(scheduleText(d))) + card('라이선스', p(LICENSE_NAMES[String(d.license)]));
  if (type === 'video') return card('형식', p(form)) + card('길이', p(d.duration)) + card('연재 일정', p(scheduleText(d)));
  if (type === 'novel') { const chars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0); return card('형식', p(form)) + card('연재 상태', d.status ? `<p>${d.status === 'complete' ? '완결' : '연재 중'}${scheduleText(d) && d.status !== 'complete' ? ` · ${scheduleText(d)}` : ''}</p>` : p(scheduleText(d))) + card('분량', entryCount ? `<p>${entryCount}화</p>` : chars ? `<p>약 ${chars.toLocaleString('ko-KR')}자</p>` : ''); }
  return '';
}
/** "매주 수·토 연재" for serials that set a schedule. */
const scheduleText = (d: Details) => { const days = list(d.schedule).map(x => DAY_NAMES[x]).filter(Boolean); return d.form === 'serial' && days.length ? `매주 ${days.join('·')} 연재` : ''; };
/** Video chapters: "1:20 본편" lines become buttons that jump the player to that moment. */
function chaptersList(text: string) {
  return `<ol class="chapters">${text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!m) return `<li><span>${esc(line)}</span></li>`;
    const seconds = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return `<li><button type="button" data-seek="${seconds}">${esc(line.slice(0, line.length - m[4].length).trim())}</button><span>${esc(m[4])}</span></li>`;
  }).join('')}</ol>`;
}
/** "AI로 이렇게 만들었어요" — the site's core: tools, time, process, source. */
function makingCard(d: Details) {
  const m = (d.making || {}) as Details; const tools = list(m.tools);
  if (!tools.length && !m.days && !m.process && !m.github) return '';
  return `<section class="making"><h2>AI로 이렇게 만들었어요</h2><div class="making-grid">${tools.length ? `<div><span>사용한 AI 도구</span><p class="chips">${tools.map(t => `<em class="chip">${esc(t)}</em>`).join('')}</p></div>` : ''}${m.days ? `<div><span>제작 기간</span><p>${esc(m.days)}</p></div>` : ''}${m.github ? `<div><span>소스 코드</span><p><a href="${esc(m.github)}" target="_blank" rel="noopener noreferrer" data-track-click>${m.openSource ? '오픈소스 · ' : ''}GitHub ↗</a></p></div>` : m.openSource ? '<div><span>소스 코드</span><p>오픈소스</p></div>' : ''}</div>${m.process ? `<p class="process">${esc(m.process)}</p>` : ''}</section>`;
}
function actions(row: Record<string, unknown>, d: Details, hasBody: boolean, firstEntry: string) {
  const out: string[] = []; const url = String(row.url || ''); const type = String(row.type);
  // member links nobody has checked yet ask before leaving the site (public/leave-guard.js)
  const guard = row.source === 'community' && !row.verified_at ? ' data-leave-guard' : '';
  const ext = (href: string, label: string, primary = false) => `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-track-click${guard}>${label}</a>`;
  if (row.status === 'upcoming') out.push('<span class="btn primary disabled">공개 준비 중</span>');
  else if (firstEntry) out.push(`<a class="btn primary" href="${esc(firstEntry)}" data-continue>${type === 'novel' ? '첫 화 읽기' : type === 'video' ? '첫 편 보기' : '첫 화 보기'}</a>`);
  else if (row.source === 'sample') { if (hasBody) out.push(`<a class="btn primary" href="#content">${type === 'novel' ? '읽기 시작 ↓' : '예시 보기 ↓'}</a>`); }
  else if (type === 'website' && url) out.push(ext(url, '사이트 열기 ↗', true));
  else if (type === 'game') { if (d.embed) out.push('<button class="btn primary" data-play-embed>▶ 여기서 바로 플레이</button>'); if (url) out.push(ext(url, d.embed ? '새 창에서 플레이 ↗' : '▶ 지금 플레이 ↗', !d.embed)); }
  else if (type === 'video' && url) out.push(ext(url, `${parseVideoUrl(url)?.provider === 'vimeo' ? 'Vimeo' : 'YouTube'}에서 보기 ↗`));
  else if (type === 'app') { if (d.appStore) out.push(ext(String(d.appStore), 'App Store ↗', true)); if (d.playStore) out.push(ext(String(d.playStore), 'Google Play ↗', !d.appStore)); if (url) out.push(ext(url, '웹에서 열기 ↗', !d.appStore && !d.playStore)); }
  else if (hasBody) out.push(`<a class="btn primary" href="#content">${type === 'novel' ? '읽기 시작 ↓' : '작품 보기 ↓'}</a>`);
  if ((type === 'art' || type === 'novel') && url && row.source !== 'sample') out.push(ext(url, '원본 링크 ↗'));
  return out.join('');
}

/** Owner-only insights: 30 days of views as bars, where views came from, and how far readers get through episodes. */
function ownerInsights(stats: WorkStats, entries: Record<string, unknown>[], kind: string) {
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = await db().prepare("SELECT p.id,p.owner_id,p.title,p.creator,p.type,p.description,p.subtitle,p.url,CASE WHEN p.image LIKE 'data:%' THEN '/api/projects/' || p.id || '/cover?v=' || length(p.image) ELSE p.image END AS image,p.genres,p.details,p.content,p.status,p.source,p.visibility,p.hidden_at,p.verified_at,u.public_id AS creator_id,u.name AS owner_name FROM projects p LEFT JOIN profiles u ON u.id=p.owner_id WHERE p.id=? AND p.deleted_at IS NULL").bind(id).first().catch(() => null);
  const user = await currentUser().catch(() => null);
  if(row && (await blockedOwners(user?.id)).has(String(row.owner_id)))return new Response('차단한 이용자의 콘텐츠입니다.',{status:404});
  const owner = !!row && !!user && user.id === row.owner_id && row.source === 'community';
  if (!row || ((row.hidden_at || row.visibility !== 'public') && !owner)) return new Response('작품을 찾을 수 없어요.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const parse = <T>(v: unknown, fallback: T): T => { try { return JSON.parse(String(v)) ?? fallback; } catch { return fallback; } };
  const genres = parse<string[]>(row.genres, []), details = parse<Details>(row.details, {});
  const type = String(row.type), image = String(row.image || ''), sample = row.source === 'sample', kind = entryKind(type);
  if (!owner) waitUntil(countWork(request, id, 'view'));
  await announceDueEntries(id);

  const entries = await listEntries(id, kind, owner);
  let blocks: ViewBlock[] = resolveContent(row.content).map(b => b.type === 'image' ? { type: 'image', src: b.src, caption: b.caption } : b);
  // samples without episodes show their built-in body; serialized samples read through their episodes instead
  if (sample && !blocks.length && !entries.length) blocks = sampleBlocks(id, image);
  if (!blocks.length) blocks = ((await db().prepare('SELECT id FROM project_images WHERE project_id=? AND entry_id IS NULL ORDER BY position').bind(id).all()).results).map(r => ({ type: 'image' as const, src: `/api/project-images/${r.id}` }));
  const published = entries.filter(e => e.status === 'published' && !e.scheduled);
  const firstEntry = kind === 'episode' && published.length ? `/works/${encodeURIComponent(id)}/e/${encodeURIComponent(String(published[0].id))}` : '';
  const r = await reactionStats('project', id, user?.id).catch(() => ({ recommendations: 0, recommended: false, comments: 0, rating: 0, ratingCount: 0, myRating: 0, myReview: '' }));
  const saved = user ? !!(await db().prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND project_id=?').bind(user.id, id).first()) : false;
  const follow = row.creator_id ? await db().prepare('SELECT (SELECT COUNT(*) FROM follows WHERE creator_id=?) n,EXISTS(SELECT 1 FROM follows WHERE creator_id=? AND follower_id=?) mine').bind(row.owner_id, row.owner_id, user?.id || '').first() : null;
  const mine = owner ? await workStats(id) : null;

  const scenes = sample ? (sampleContent[id] as { scenes?: Scene[] } | undefined)?.scenes : undefined;
  const media = type === 'video' ? (scenes ? scenePlayer(scenes) : embed(String(row.url || ''), String(row.title)) || (image ? `<img class="cover" src="${esc(image)}" alt="">` : '')) : image ? `<img class="cover" src="${esc(image)}" alt="${esc(row.title)} 커버">` : coverPlaceholder(row.id, type, 'cover');
  const stacked = type === 'art' && (details.format === 'webtoon' || details.format === 'comic');
  const warnings = list(details.warnings).map(w => WARNING_NAMES[w]).filter(Boolean);
  const creator = row.creator_id ? `<a class="creator" href="/creators/${esc(row.creator_id)}">${esc(row.creator)}</a>` : esc(row.creator);
  const meta = [`by ${creator}`, r.ratingCount ? `★ ${Number(r.rating).toFixed(1)} (${r.ratingCount})` : '', r.recommendations ? `♡ ${r.recommendations}` : '', r.comments ? `댓글 ${r.comments}` : ''].filter(Boolean);
  const entryRows = entries.map(e => { const href = `/works/${encodeURIComponent(id)}/e/${encodeURIComponent(String(e.id))}`; const badge = e.status === 'draft' ? '<em class="chip">임시 저장</em>' : e.scheduled ? `<em class="chip">예약 · ${fmtDate(e.published_at)}</em>` : ''; return `<li><a href="${href}" data-entry="${esc(e.id)}"><b>${esc(entryLabel(e))}</b><span>${badge}${fmtDate(e.published_at)}</span></a></li>`; }).join('');
  const entriesHtml = entries.length || owner ? `<section class="entries" id="entries"><div class="section-title"><h2>${kind === 'episode' ? '회차' : '업데이트 소식'}</h2><span>${kind === 'episode' ? `${published.length}화` : published.length ? `최근 ${fmtDate(published[0].published_at)}` : ''}</span></div>${kind === 'episode' && published.length ? '<a class="btn small continue" data-continue-latest hidden>이어 보기</a>' : ''}${entryRows ? `<ol class="entry-list ${kind}">${entryRows}</ol>` : `<p class="muted">${kind === 'episode' ? '아직 회차가 없어요.' : '아직 업데이트 소식이 없어요.'}</p>`}</section>` : '';
  const ownerPanel = mine ? `<section class="owner"><div class="owner-head"><b>내 작품 관리</b>${row.visibility === 'draft' ? '<em class="chip">임시 저장 · 나만 볼 수 있어요</em>' : ''}${row.hidden_at ? `<a class="chip warn" href="/#appeal=project:${encodeURIComponent(id)}">운영자가 숨긴 작품 · 이의 제기 ›</a>` : ''}</div><div class="owner-stats"><div><span>조회 (7일)</span><b>${mine.views7}</b></div><div><span>조회 (30일)</span><b>${mine.views30}</b></div><div><span>링크 클릭 (30일)</span><b>${mine.clicks30}</b></div><div><span>찜</span><b>${mine.saves}</b></div><div><span>팔로워</span><b>${Number(follow?.n || 0)}</b></div></div>${ownerInsights(mine, entries, kind)}<div class="owner-actions"><a class="btn small" href="/#edit=${encodeURIComponent(id)}">작품 정보 수정</a><button class="btn small primary" data-new-entry>＋ ${kind === 'episode' ? '새 회차 쓰기' : '업데이트 소식 쓰기'}</button></div></section>` : '';
  const chapters = type === 'video' && details.chapters ? `<div class="info wide"><span>챕터 <small>누르면 그 장면부터 재생돼요</small></span>${chaptersList(String(details.chapters))}</div>` : '';
  const team = list(details.team).length ? `<div class="info wide"><span>함께 만든 사람</span><ul class="team">${list(details.team).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
  const credits = type === 'video' && details.credits ? `<div class="info wide"><span>크레딧</span><p class="pre">${esc(details.credits)}</p></div>` : '';
  const cards = infoCards(type, details, blocks, published.length) + chapters + credits + team;
  // works marked 성인 소재 stay blurred until the visitor chooses to see them (once per visit, per work)
  const mature = list(details.warnings).includes('mature') && !owner;
  const config = { id, type, kind, title: row.title, owner, mature, loggedIn: !!user, creatorId: row.creator_id || '', following: !!follow?.mine, saved, recommended: r.recommended, myRating: r.myRating || 0, myReview: r.myReview || '', canRate: row.status !== 'upcoming' && !sample && !owner, labels: ['app', 'game', 'website'].includes(type), nextNumber: entries.reduce((n, e) => Math.max(n, Number(e.number) || 0), 0) + 1, upcoming: row.status === 'upcoming',
    updates: owner && kind === 'update' ? published.map(e => ({ id: String(e.id), label: entryLabel(e) })) : [] };
  const origin = new URL(request.url).origin; const ogImage = image ? new URL(image, origin).href : '';

  const html = `${pageHead(`${row.title}${sample ? ' (예시)' : ''}`, `<meta name="description" content="${esc(row.subtitle || row.description)}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(row.title)} · VIBEFLIX"><meta property="og:description" content="${esc(row.subtitle || row.description)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}<meta property="og:url" content="${esc(origin)}/works/${esc(id)}">${sample || row.visibility !== 'public' ? '<meta name="robots" content="noindex">' : ''}`)}
<link rel="stylesheet" href="${asset('/work.css')}">${owner ? `<link rel="stylesheet" href="${asset('/block-editor.css')}">` : ''}<style>@layer page{${BASE_CSS}${SCENE_CSS}}</style></head><body>
${topBar()}
${sample ? '<div class="notice">화면 구성을 보여주기 위해 운영자가 만든 예시 작품이에요. 실제 작품이 아니에요.</div>' : ''}${row.visibility === 'draft' ? '<div class="notice">임시 저장된 작품이에요. 공개하기 전까지 나만 볼 수 있어요.</div>' : ''}
<main${mature ? ' class="is-gated"' : ''}>${mature ? '<div class="mature-gate" role="region" aria-label="성인 소재 안내"><b>성인 소재가 포함된 작품이에요</b><p>작가가 성인 소재 경고를 표시했어요. 만 19세 이상이고 내용을 보고 싶을 때만 열어주세요.</p><button class="btn primary" data-mature-ok>확인하고 보기</button></div>' : ''}${media}${details.embed ? `<div class="play-embed" id="play-embed" hidden data-src="${esc(details.embed)}"></div>` : ''}
<div class="head"><span class="kicker">${esc(typeNames[type] || '')}${sample ? ' · SAMPLE' : ''}${genres.length ? ` <b>· ${genres.map(esc).join(' · ')}</b>` : ''}</span><h1>${esc(row.title)}</h1>${row.subtitle && row.subtitle !== row.description ? `<p class="sub">${esc(row.subtitle)}</p>` : ''}<div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}${row.source === 'community' && row.verified_at && row.url ? '<span class="chip ok" title="운영자가 링크를 확인했어요">✓ 운영자 확인</span>' : ''}${row.creator_id && !owner ? `<button class="follow${follow?.mine ? ' on' : ''}" data-follow>${follow?.mine ? '팔로잉' : '＋ 팔로우'}</button>` : ''}</div>
<div class="actions">${actions(row, details, blocks.length > 0, firstEntry)}<button class="btn${saved ? ' on' : ''}" data-save>${row.status === 'upcoming' ? (saved ? '✓ 출시 알림 신청함' : '＋ 출시 알림 받기') : (saved ? '✓ 찜했어요' : '＋ 찜하기')}</button><button class="btn${r.recommended ? ' on' : ''}" data-recommend>♡ 추천 <span data-recommend-count>${r.recommendations || ''}</span></button><button class="btn" data-share>링크 공유</button></div></div>
${warnings.length ? `<p class="warning">이 작품에는 ${warnings.join(', ')} 요소가 있어요.</p>` : ''}${ownerPanel}
${cards ? `<div class="infos">${cards}</div>` : ''}${makingCard(details)}
<p class="desc">${esc(row.description)}</p>
${type === 'game' && details.trailer ? `<div class="section-title"><h2>트레일러</h2></div>${embed(String(details.trailer), String(row.title))}` : ''}
${entriesHtml}
${blocks.length ? `<article class="body${type === 'novel' ? ' novel' : ''}${stacked ? ' stacked' : ''}${type === 'app' ? ' phones' : ''}" id="content">${renderBlocks(blocks, String(row.title))}${type === 'novel' && sample ? '<p class="end">— 다음 화는 준비 중이에요 —</p>' : ''}</article>` : ''}
${type === 'art' && details.license ? `<p class="license">© ${esc(row.creator)} · ${esc(LICENSE_NAMES[String(details.license)])}</p>` : ''}
<section class="discussion" id="discussion"><div class="section-title"><h2>별점 · 리뷰</h2><span data-rating-summary>${r.ratingCount ? `★ ${Number(r.rating).toFixed(1)} · ${r.ratingCount}명` : '첫 평가를 기다려요'}</span></div><div id="rating-box"></div><div id="reviews"></div>
<div class="section-title"><h2>${config.labels ? '댓글 · 피드백' : '댓글'}</h2><span data-comment-count>${r.comments ? `${r.comments}개` : ''}</span></div>${config.labels ? '<div class="comment-tabs" role="group" aria-label="댓글 분류"><button data-comment-filter="" class="on">전체</button><button data-comment-filter="feedback">피드백</button><button data-comment-filter="bug">버그 제보</button></div>' : ''}<form class="comment-form" id="comment-form">${config.labels ? '<select name="label" aria-label="댓글 분류"><option value="">댓글</option><option value="feedback">피드백</option><option value="bug">버그 제보</option></select>' : ''}<textarea name="body" maxlength="2000" rows="3" placeholder="${user ? '이 작품에 대한 이야기를 남겨주세요.' : '로그인하면 댓글을 남길 수 있어요.'}"></textarea><button class="btn small primary">남기기</button></form><div id="comments"></div></section>
</main>
${owner ? `<dialog class="modal entry-dialog" id="entry-dialog" data-guard-unsaved aria-labelledby="entry-dialog-title"><form id="entry-form" novalidate><h2 id="entry-dialog-title"></h2><div class="entry-grid">${kind === 'episode' ? '<label>회차 <input name="number" type="number" min="1" max="9999" required></label>' : '<label>버전 <input name="version" maxlength="30" placeholder="예: 1.2.0"></label>'}<label class="grow">제목 <input name="title" maxlength="100" required placeholder="${kind === 'episode' ? '예: 첫 번째 별' : '예: 다크 모드 추가'}"></label></div><div class="entry-body" id="entry-body"></div><label>${kind === 'episode' ? '작가의 말' : '덧붙이는 말'} <small>선택</small><textarea name="note" maxlength="1000" rows="2"></textarea></label><div class="entry-grid"><label>공개 <select name="status"><option value="published">공개</option><option value="draft">임시 저장</option></select></label><label class="grow">예약 공개 <small>비우면 지금 공개</small><input name="publishAt" type="datetime-local"></label></div><p class="form-error" id="entry-error" hidden></p><div class="entry-actions"><button type="button" class="btn small" data-entry-delete hidden>삭제</button><span></span><button type="button" class="btn small" data-entry-cancel>취소</button><button class="btn small primary">저장</button></div></form></dialog>` : ''}
<script type="application/json" id="work-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>
${owner ? `<script src="${asset('/block-editor.js')}" defer></script>` : ''}<script src="${asset('/work.js')}" defer></script><script src="${asset('/leave-guard.js')}" defer></script>${scenes ? `<script>${playerScript}</script>` : ''}</body></html>`;
  return htmlResponse(html, sample || row.visibility !== 'public' ? { 'X-Robots-Tag': 'noindex' } : {});
}
