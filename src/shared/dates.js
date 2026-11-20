/**
 * Date helpers shared by the management pages.
 * All date-only values use YYYY-MM-DD strings to avoid timezone drift.
 */

export function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(now.getDate()).padStart(2, '0')}`
}

/** Current month in YYYY-MM, optionally shifted by N months. */
export function monthISO(offset = 0) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthRange(offset = 0) {
  const month = monthISO(offset)
  const [year, m] = month.split('-').map(Number)
  const lastDay = new Date(year, m, 0).getDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function lastNDays(n) {
  const end = todayISO()
  const start = new Date()
  start.setDate(start.getDate() - (n - 1))
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(start.getDate()).padStart(2, '0')}`,
    end,
  }
}

export function yearRange() {
  const year = new Date().getFullYear()
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export function formatDate(value) {
  if (!value) return '—'
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
