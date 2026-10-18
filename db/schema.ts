import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const workspace = sqliteTable('workspace', { id: text('id').primaryKey(), data: text('data').notNull(), version: integer('version').notNull().default(0) });
