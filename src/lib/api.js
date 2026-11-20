/**
 * Small fetch helper for the Munchivo Management API.
 * Throws an Error with a friendly message on non-2xx responses.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // empty/non-JSON response
  }
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'Request failed.'), {
      status: res.status,
    })
  }
  return data
}
