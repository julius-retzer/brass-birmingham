import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '~/env'
import { configureLocalProxy } from './local-proxy'
import * as schema from './schema'

// No-op unless DATABASE_URL points at the local Docker proxy (compose.yaml);
// a Neon cloud url keeps the driver's own endpoint logic untouched.
configureLocalProxy(env.DATABASE_URL)

const sql = neon(env.DATABASE_URL)
export const db = drizzle(sql, { schema })
