import { redirect } from 'next/navigation'

// The Ironmaster's Atlas moved to the root route; keep old /v2 links
// (including ?era=rail / ?preview=... fixtures) working.
export default async function V2Redirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value)
  }
  const query = params.toString()
  redirect(query ? `/?${query}` : '/')
}
