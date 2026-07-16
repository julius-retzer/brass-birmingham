import { neonConfig } from '@neondatabase/serverless'
import { afterEach, describe, expect, it } from 'vitest'
import { configureLocalProxy, isLocalProxyUrl } from './local-proxy'

// `neonConfig.fetchEndpoint` is global process state; restore it between cases
// so one test's override cannot leak into another's assertion.
const original = neonConfig.fetchEndpoint
afterEach(() => {
  neonConfig.fetchEndpoint = original
})

const CLOUD = 'postgres://u:p@ep-cool-darkness-123.us-east-1.aws.neon.tech/main'
const LOCAL = 'postgres://postgres:postgres@localhost:4444/main'

describe('isLocalProxyUrl', () => {
  it.each([
    ['postgres://postgres:postgres@localhost:4444/main', true],
    ['postgres://postgres:postgres@127.0.0.1:4444/main', true],
    [CLOUD, false],
    // Not a url at all — callers pass whatever DATABASE_URL holds.
    ['', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isLocalProxyUrl(url)).toBe(expected)
  })

  it('does not mistake a cloud host that merely contains "localhost"', () => {
    expect(isLocalProxyUrl('postgres://u:p@localhost.example.com/db')).toBe(
      false,
    )
  })
})

describe('configureLocalProxy', () => {
  it('points the driver at plain HTTP on the local proxy port', () => {
    configureLocalProxy(LOCAL)
    const endpoint = neonConfig.fetchEndpoint as (
      h: string,
      p: number,
    ) => string
    expect(endpoint('localhost', 4444)).toBe('http://localhost:4444/sql')
  })

  // The load-bearing one: the cloud default rewrites the host (to `api.*`), so
  // an unconditional override would silently break every real Neon connection.
  it('leaves the driver default alone for a Neon cloud url', () => {
    configureLocalProxy(CLOUD)
    expect(neonConfig.fetchEndpoint).toBe(original)
  })
})
