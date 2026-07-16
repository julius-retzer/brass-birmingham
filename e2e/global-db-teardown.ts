// Playwright globalTeardown: drop this run's local database.
//
// Separate module from e2e/global-db.ts only because playwright resolves both
// globalSetup and globalTeardown via a file's DEFAULT export.
import { dropLocalDatabase } from '../src/test/local-db'
import { dbName } from './global-db'

export default async function globalTeardown(): Promise<void> {
  const name = dbName()
  if (!name) return
  try {
    await dropLocalDatabase(name)
    console.info(`[e2e-db] dropped local Docker database ${name}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[e2e-db] could not drop ${name} (${msg}); \`docker compose down\` clears it`,
    )
  }
}
