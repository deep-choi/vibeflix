import { sqliteTable, text, integer, index, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  creator: text('creator').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  url: text('url').unique(), // null for works that are not public yet
  image: text('image').notNull().default(''),
  created: integer('created').notNull(),
  deletedAt: integer('deleted_at'),
  hiddenAt: integer('hidden_at'),
  // 'catalog' = curated works seeded from public/catalog.json, 'community' = uploaded by members
  source: text('source').notNull().default('community'),
  subtitle: text('subtitle').notNull().default(''),
  art: text('art').notNull().default('custom'),
  badge: text('badge').notNull().default(''),
  status: text('status').notNull().default('live'),
  tags: text('tags').notNull().default('[]'),
  genres: text('genres').notNull().default('[]'), // JSON list from public/genres.json for this type; drives category rows
  // Detail page: vertical blocks [{type:'heading'|'text',text}|{type:'image',id,caption}] (images live in project_images)
  content: text('content').notNull().default('[]'),
  // Category-specific fields (website features, app stores, game controls, video duration, novel status…)
  details: text('details').notNull().default('{}'),
  visibility: text('visibility').notNull().default('public'), // 'draft' = saved but only the owner can see it

  featured: integer('featured').notNull().default(0),
  sort: integer('sort').notNull().default(0),
}, table => [index('projects_owner_idx').on(table.ownerId),index('projects_created_idx').on(table.created)]);

export const projectImages = sqliteTable('project_images', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  position: integer('position').notNull(),
  data: text('data').notNull(),
  entryId: text('entry_id'), // set when the image belongs to an episode/update rather than the work body
  created: integer('created').notNull(),
}, table => [index('project_images_project_idx').on(table.projectId, table.position)]);

export const profiles = sqliteTable('profiles', {
  id:text('id').primaryKey(), publicId:text('public_id').notNull().unique(),
  name:text('name').notNull(), bio:text('bio').notNull().default(''), avatar:text('avatar').notNull().default(''),
  role:text('role').notNull().default('member'), suspended:integer('suspended').notNull().default(0),
  loginProvider:text('login_provider').notNull().default(''), // 'google' | 'email' | 'chatgpt' — last sign-in method
  created:integer('created').notNull(), updated:integer('updated').notNull(),
});
export const sessions = sqliteTable('sessions', {
  hash:text('hash').primaryKey(), userId:text('user_id').notNull(), expires:integer('expires').notNull(),
}, t=>[index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expires)]);
export const posts = sqliteTable('posts', {
  id:text('id').primaryKey(), ownerId:text('owner_id').notNull(), title:text('title').notNull(), body:text('body').notNull(),
  category:text('category').notNull().default('general'), projectId:text('project_id'), created:integer('created').notNull(), updated:integer('updated').notNull(),
  deletedAt:integer('deleted_at'), hiddenAt:integer('hidden_at'),
}, t=>[index('posts_created_idx').on(t.created),index('posts_owner_idx').on(t.ownerId)]);
export const comments = sqliteTable('comments', {
  id:text('id').primaryKey(), ownerId:text('owner_id').notNull(), targetKind:text('target_kind').notNull(), targetId:text('target_id').notNull(),
  parentId:text('parent_id'), body:text('body').notNull(), label:text('label').notNull().default(''), created:integer('created').notNull(), updated:integer('updated').notNull(), deletedAt:integer('deleted_at'), hiddenAt:integer('hidden_at'),
}, t=>[index('comments_target_idx').on(t.targetKind,t.targetId,t.created),index('comments_owner_idx').on(t.ownerId)]);
export const reactions = sqliteTable('reactions', {
  userId:text('user_id').notNull(), targetKind:text('target_kind').notNull(), targetId:text('target_id').notNull(), created:integer('created').notNull(),
}, t=>[primaryKey({columns:[t.userId,t.targetKind,t.targetId]}),index('reactions_target_idx').on(t.targetKind,t.targetId)]);
export const ratings = sqliteTable('ratings', {
  userId:text('user_id').notNull(), projectId:text('project_id').notNull(), score:integer('score').notNull(), review:text('review').notNull().default(''), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[primaryKey({columns:[t.userId,t.projectId]}),index('ratings_project_idx').on(t.projectId),check('ratings_score_check',sql`${t.score} between 1 and 5`)]);
export const bookmarks = sqliteTable('bookmarks', {
  userId:text('user_id').notNull(), projectId:text('project_id').notNull(), created:integer('created').notNull(),
},t=>[primaryKey({columns:[t.userId,t.projectId]})]);
export const notifications = sqliteTable('notifications', {
  id:text('id').primaryKey(), recipientId:text('recipient_id').notNull(), actorId:text('actor_id').notNull(),
  kind:text('kind').notNull(), targetKind:text('target_kind').notNull(), targetId:text('target_id').notNull(), excerpt:text('excerpt').notNull(),
  created:integer('created').notNull(), readAt:integer('read_at'),
},t=>[index('notifications_recipient_idx').on(t.recipientId,t.created)]);
export const reports = sqliteTable('reports', {
  id:text('id').primaryKey(), reporterId:text('reporter_id').notNull(), targetKind:text('target_kind').notNull(), targetId:text('target_id').notNull(), reason:text('reason').notNull(),
  status:text('status').notNull().default('pending'), created:integer('created').notNull(), resolvedAt:integer('resolved_at'),
},t=>[index('reports_status_idx').on(t.status,t.created)]);
export const limits = sqliteTable('limits', {
  id:text('id').primaryKey(), windowStart:integer('window_start').notNull(), count:integer('count').notNull(),
});
// Operator tooling: site-wide settings, an audit trail of admin actions, and privacy-friendly visit counts
export const settings = sqliteTable('settings', {
  key:text('key').primaryKey(), value:text('value').notNull(), updated:integer('updated').notNull(),
});
export const adminActions = sqliteTable('admin_actions', {
  id:text('id').primaryKey(), adminId:text('admin_id').notNull(), action:text('action').notNull(), targetKind:text('target_kind').notNull(), targetId:text('target_id').notNull(), note:text('note').notNull().default(''), created:integer('created').notNull(),
},t=>[index('admin_actions_created_idx').on(t.created)]);
export const dailyViews = sqliteTable('daily_views', {
  day:text('day').primaryKey(), views:integer('views').notNull(),
});
export const dailyVisitors = sqliteTable('daily_visitors', {
  day:text('day').notNull(), visitor:text('visitor').notNull(),
},t=>[primaryKey({columns:[t.day,t.visitor]})]);
// Home hero slides, managed from /admin. theme picks a built-in background; 'custom' uses image as the backdrop.
export const banners = sqliteTable('banners', {
  id:text('id').primaryKey(), projectId:text('project_id'), title:text('title').notNull(), description:text('description').notNull().default(''),
  buttonLabel:text('button_label').notNull().default(''), buttonIcon:text('button_icon').notNull().default('none'), url:text('url').notNull().default(''),
  theme:text('theme').notNull().default('custom'), image:text('image').notNull().default(''),
  sort:integer('sort').notNull().default(0), enabled:integer('enabled').notNull().default(1), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[index('banners_sort_idx').on(t.sort)]);
// Episodes (novel/webtoon/video series) and update notes (app/game/website)
export const entries = sqliteTable('entries', {
  id:text('id').primaryKey(), projectId:text('project_id').notNull(), kind:text('kind').notNull(), // 'episode' | 'update'
  number:integer('number'), version:text('version').notNull().default(''), title:text('title').notNull(), note:text('note').notNull().default(''),
  content:text('content').notNull().default('[]'), status:text('status').notNull().default('published'), // 'published' | 'draft'
  publishedAt:integer('published_at').notNull(), notifiedAt:integer('notified_at'), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[index('entries_project_idx').on(t.projectId,t.publishedAt)]);
export const follows = sqliteTable('follows', {
  followerId:text('follower_id').notNull(), creatorId:text('creator_id').notNull(), created:integer('created').notNull(),
},t=>[primaryKey({columns:[t.followerId,t.creatorId]}),index('follows_creator_idx').on(t.creatorId)]);
// Per-work daily counters for creators: detail views and outbound link clicks
export const workStats = sqliteTable('work_stats', {
  projectId:text('project_id').notNull(), day:text('day').notNull(), views:integer('views').notNull().default(0), clicks:integer('clicks').notNull().default(0),
},t=>[primaryKey({columns:[t.projectId,t.day]})]);

// Android release: member controls and explicit content policy consent.
export const memberBlocks=sqliteTable('member_blocks',{ownerId:text('owner_id').notNull(),targetId:text('target_id').notNull(),created:integer('created').notNull()},t=>[primaryKey({columns:[t.ownerId,t.targetId]})]);
export const policyAcceptances=sqliteTable('policy_acceptances',{userId:text('user_id').primaryKey(),version:text('version').notNull(),accepted:integer('accepted').notNull()});
export const deletionRequests=sqliteTable('deletion_requests',{userId:text('user_id').primaryKey(),requested:integer('requested').notNull()});
