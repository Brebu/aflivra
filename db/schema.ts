import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const sourceCache=sqliteTable('source_cache',{
 key:text('key').primaryKey(),data:text('data'),publishedAt:text('published_at'),lastSuccessAt:text('last_success_at'),lastAttemptAt:text('last_attempt_at'),expiresAt:integer('expires_at').notNull().default(0),nextAttemptAt:integer('next_attempt_at').notNull().default(0),failures:integer('failures').notNull().default(0),lockUntil:integer('lock_until').notNull().default(0),error:text('error'),adapterVersion:text('adapter_version').notNull().default('')
});
export const sourceBudget=sqliteTable('source_budget',{key:text('key').primaryKey(),windowStart:integer('window_start').notNull(),used:integer('used').notNull()});
