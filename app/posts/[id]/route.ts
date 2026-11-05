import { db } from '../../../lib/api';
import { currentUser } from '../../../lib/auth';
import { postSelect, safePost } from '../../../lib/community';
import { blockedOwners } from '../../../lib/member-safety';
import { BASE_CSS, esc, fmtDate, htmlResponse, messagePage, pageHead, topBar } from '../../../lib/page-shell';
import { POST_LABELS } from '../../../lib/post-form';
import { asset } from '../../../lib/security';

// One community post: readable without an account and listed in the sitemap. public/post.js adds the buttons; comments
// come from public/social.js. The author alone still reaches a post an operator hid, to read why and ask for another look.
export const dynamic = 'force-dynamic';
type Post = Record<string, unknown>;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await currentUser().catch(() => null);
  const gone = () => messagePage('글을 찾을 수 없어요', '삭제되었거나 더 이상 볼 수 없는 글이에요.', 404, '/#community', '커뮤니티로 돌아가기');
  const state = await db().prepare('SELECT owner_id,hidden_at FROM posts WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!state || (await blockedOwners(user?.id)).has(String(state.owner_id))) return gone();
  const row = await db().prepare(`${postSelect} WHERE p.id=?`).bind(user?.id || '', user?.id || '', id).first();
  if (!row) return gone();
  const p = safePost(row) as Post; const owned = !!p.owned, hidden = !!state.hidden_at;
  if (hidden && !owned) return gone();
  const work = p.project_id ? await db().prepare("SELECT id,title FROM projects WHERE id=? AND deleted_at IS NULL AND hidden_at IS NULL AND visibility='public'").bind(p.project_id).first() : null;
  const question = p.category === 'question';
  const badge = !question ? '' : p.solved_comment ? '<em class="chip status-fixed">✓ 해결됨</em>' : '<em class="chip">답변 기다림</em>';
  const origin = new URL(request.url).origin; const href = `${origin}/posts/${encodeURIComponent(id)}`;
  const summary = String(p.body).replace(/\s+/g, ' ').trim().slice(0, 140);
  const config = { id, title: p.title, loggedIn: !!user, owned, hidden, category: p.category, solved: p.solved_comment || null, recommended: !!p.recommended };
  const actions = hidden ? '' : `<div class="post-actions">${owned ? (Number(p.recommendations) ? `<span class="muted">♡ 추천 ${Number(p.recommendations)}</span>` : '') : `<button class="btn${p.recommended ? ' on' : ''}" data-recommend aria-pressed="${!!p.recommended}">♡ 추천 <span data-recommend-count>${Number(p.recommendations) || ''}</span></button>`}<button class="btn" data-share>링크 공유</button>${owned ? `<a class="btn" href="/posts/${encodeURIComponent(id)}/edit">수정</a><button class="btn danger" data-delete-post>삭제</button>` : `<button class="link" data-report-kind="post" data-report-id="${esc(id)}">신고</button>`}</div>`;
  const html = `${pageHead(String(p.title), `<meta name="description" content="${esc(summary)}"><link rel="canonical" href="${esc(href)}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(p.title)} · VIBEFLIX"><meta property="og:description" content="${esc(summary)}"><meta property="og:url" content="${esc(href)}">${hidden ? '<meta name="robots" content="noindex">' : ''}`)}
<link rel="stylesheet" href="${asset('/work.css')}"><link rel="stylesheet" href="${asset('/post.css')}"><style>@layer page{${BASE_CSS}}</style></head><body>
${topBar('/#community', '커뮤니티로 돌아가기')}${hidden ? `<div class="notice warn">운영자가 숨긴 글이에요. 나만 볼 수 있어요. <a href="/#appeal=post:${encodeURIComponent(id)}">이의 제기하기 ›</a></div>` : ''}
<main class="post-page"><article class="post-article"><div class="post-eyebrow"><em class="chip">${esc(POST_LABELS[String(p.category)] || '이야기')}</em><span data-question-badge>${badge}</span></div><h1>${esc(p.title)}</h1><p class="post-by"><span class="post-avatar" aria-hidden="true">${esc(String(p.author_name || 'V')[0])}</span><b>${esc(p.author_name)}</b><time>${fmtDate(p.created)}</time>${Number(p.updated) > Number(p.created) ? '<small>수정됨</small>' : ''}</p><div class="post-body">${esc(p.body)}</div>${work ? `<a class="post-work" href="/works/${encodeURIComponent(String(work.id))}"><span>함께 소개한 작품</span><b>${esc(work.title)} ↗</b></a>` : ''}${actions}</article>
${hidden ? '' : `<section class="discussion" id="discussion"><div class="section-title"><h2>${question ? '답변' : '댓글'}</h2><span data-comment-count>${Number(p.comments) ? `${Number(p.comments)}개` : ''}</span></div><div id="comments"></div></section>`}</main>
<script type="application/json" id="post-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>
<script src="${asset('/social.js')}" defer></script><script src="${asset('/mobile-safety.js')}" defer></script><script src="${asset('/post.js')}" defer></script></body></html>`;
  return htmlResponse(html, hidden ? { 'X-Robots-Tag': 'noindex' } : {});
}
