import { sqliteTable, text, integer, index, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  creator: text('creator').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  url: text('url').notNull().unique(),
  image: text('image').notNull().default(''),
  created: integer('created').notNull(),
  deletedAt: integer('deleted_at'),
  hiddenAt: integer('hidden_at'),
}, table => [index('projects_owner_idx').on(table.ownerId),index('projects_created_idx').on(table.created)]);

export const projectImages = sqliteTable('project_images', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  position: integer('position').notNull(),
  data: text('data').notNull(),
  created: integer('created').notNull(),
}, table => [index('project_images_project_idx').on(table.projectId, table.position)]);

export const profiles = sqliteTable('profiles', {
  id:text('id').primaryKey(), publicId:text('public_id').notNull().unique(),
  name:text('name').notNull(), bio:text('bio').notNull().default(''), avatar:text('avatar').notNull().default(''),
  role:text('role').notNull().default('member'), suspended:integer('suspended').notNull().default(0),
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
  parentId:text('parent_id'), body:text('body').notNull(), created:integer('created').notNull(), updated:integer('updated').notNull(), deletedAt:integer('deleted_at'), hiddenAt:integer('hidden_at'),
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
