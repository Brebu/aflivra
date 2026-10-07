import {sqliteTable,text,integer,unique} from 'drizzle-orm/sqlite-core';
export const sourceCache=sqliteTable('source_cache',{
 key:text('key').primaryKey(),data:text('data'),publishedAt:text('published_at'),lastSuccessAt:text('last_success_at'),lastAttemptAt:text('last_attempt_at'),expiresAt:integer('expires_at').notNull().default(0),nextAttemptAt:integer('next_attempt_at').notNull().default(0),failures:integer('failures').notNull().default(0),lockUntil:integer('lock_until').notNull().default(0),error:text('error'),adapterVersion:text('adapter_version').notNull().default('')
});
export const sourceBudget=sqliteTable('source_budget',{key:text('key').primaryKey(),windowStart:integer('window_start').notNull(),used:integer('used').notNull()});
export const watchItems=sqliteTable('watch_items',{
 id:text('id').primaryKey(),installId:text('install_id').notNull(),kind:text('kind').notNull(),ref:text('ref').notNull(),label:text('label'),createdAt:text('created_at').notNull(),
 muted:integer('muted').notNull().default(0),checkedAt:text('checked_at'),fingerprint:text('fingerprint'),sigs:text('sigs')
},table=>({installKindRefUnique:unique('_wf_install_kind_ref').on(table.installId,table.kind,table.ref)}));
export const watchEvents=sqliteTable('watch_events',{
 id:text('id').primaryKey(),installId:text('install_id').notNull(),kind:text('kind').notNull(),ref:text('ref').notNull(),title:text('title').notNull(),body:text('body'),url:text('url').notNull(),
 createdAt:text('created_at').notNull(),seen:integer('seen').notNull().default(0),sig:text('sig').notNull()
},table=>({installSigUnique:unique('_wf_install_sig').on(table.installId,table.sig)}));
export const pushSubs=sqliteTable('push_subs',{
 id:text('id').primaryKey(),installId:text('install_id').notNull(),endpoint:text('endpoint').notNull(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),createdAt:text('created_at').notNull()
},table=>({endpointUnique:unique('_wf_endpoint').on(table.endpoint)}));
