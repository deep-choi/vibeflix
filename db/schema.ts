import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

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
}, table => [index('projects_owner_idx').on(table.ownerId),index('projects_created_idx').on(table.created)]);
