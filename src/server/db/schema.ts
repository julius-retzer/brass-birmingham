import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(),
  state: text('state').notNull(), // JSON serialized XState snapshot
  player1Name: text('player1_name'),
  player2Name: text('player2_name'),
  status: text('status', { 
    enum: ['waiting_for_player2', 'in_progress', 'completed'] 
  }).notNull().default('waiting_for_player2'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
