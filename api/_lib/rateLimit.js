/**
 * In-memory rate limiter for login attempts.
 *
 * Note: on Vercel serverless this limits per warm instance, which is
 * acceptable for a three-partner application and still blocks bursts.
 * Repeated offenders are additionally slowed by bcrypt work.
 */
const attempts = new Map() // key -> { count, resetAt }
const MAX_ATTEMPTS = 8
const WINDOW_MS = 15 * 60 * 1000

export function isRateLimited(key) {
  const now = Date.now()
  const entry = attempts.get(key)

  if (entry && now < entry.resetAt && entry.count >= MAX_ATTEMPTS) {
    return {
      limited: true,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    }
  }
  return { limited: false }
}

export function recordFailedAttempt(key) {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    entry.count += 1
  }
}

export function clearAttempts(key) {
  attempts.delete(key)
}
