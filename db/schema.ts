import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(), post: text('post').notNull(), visitor: text('visitor').notNull(),
  name: text('name').notNull(), body: text('body').notNull(), created: integer('created').notNull(),
}, t => [index('comments_post_created').on(t.post, t.created), index('comments_visitor_created').on(t.visitor,t.created)]);
export const hooks = sqliteTable('hooks', {
  post: text('post').notNull(), visitor: text('visitor').notNull(),
}, t => [primaryKey({columns:[t.post,t.visitor]})]);
export const views = sqliteTable('views', {
  post: text('post').notNull(), visit: text('visit').notNull(), created: integer('created').notNull(),
}, t => [primaryKey({columns:[t.post,t.visit]})]);
export const visits = sqliteTable('visits', {
  visit: text('visit').primaryKey(), created: integer('created').notNull(),
});
export const rateWindows = sqliteTable('rate_windows', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull(),
}, t => [index('rate_windows_expires').on(t.expires)]);
export const lifeTrips = sqliteTable('life_trips', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
  date: text('date').notNull(), description: text('description').notNull(), points: text('points').notNull(),
  states: text('states').notNull(), contentHash: text('content_hash').notNull(),
  version: integer('version').notNull(), created: integer('created').notNull(), updated: integer('updated').notNull(),
}, t => [index('life_trips_date').on(t.date)]);
export const lifePhotos = sqliteTable('life_photos', {
  id: text('id').primaryKey(), trip: text('trip').notNull(), owner: text('owner').notNull(),
  objectKey: text('object_key').notNull(), mime: text('mime').notNull(), bytes: integer('bytes').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(), caption: text('caption').notNull(),
  stop: text('stop'), digest: text('digest').notNull(), status: text('status').notNull(), created: integer('created').notNull(),
}, t => [index('life_photos_trip').on(t.trip)]);
