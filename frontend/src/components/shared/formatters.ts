/**
 * Common presentation formatters for scores, JSON, dates, and percentages.
 */

export function formatJson(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(typeof raw === 'string' ? JSON.parse(raw) : raw, null, 2)
  } catch {
    return String(raw)
  }
}

export function formatScore(val: number | null | undefined, digits: number = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '—'
  return val.toFixed(digits)
}

export function formatPercent(rate: number | null | undefined, digits: number = 1): string {
  if (rate === null || rate === undefined || isNaN(rate)) return '0.0%'
  return `${(rate * 100).toFixed(digits)}%`
}

export function formatDate(timestamp: string | null | undefined): string {
  if (!timestamp) return '—'
  return timestamp.slice(0, 19).replace('T', ' ')
}
