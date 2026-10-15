// All dates are shown and entered in India time, regardless of the device's
// time zone, so entries look the same on every device.

export const TIME_ZONE = 'Asia/Kolkata'
const IST_OFFSET = '+05:30'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Parts = { year: string; month: string; day: string; hour: string; minute: string }

function istParts(iso: string | Date): Parts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** ISO timestamp → "2026-04-05" (IST calendar date). */
export function toDateKey(iso: string | Date): string {
  const p = istParts(iso)
  return `${p.year}-${p.month}-${p.day}`
}

/** ISO timestamp → "2026-04" (IST month). */
export function toMonthKey(iso: string | Date): string {
  return toDateKey(iso).slice(0, 7)
}

/** "2026-04" → "Apr 2026" */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/** "2026-04-05" → "05 Apr 2026" (CashBook's date format). */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`
}

/** ISO timestamp → "05 Apr 2026" */
export function formatDate(iso: string): string {
  return formatDateKey(toDateKey(iso))
}

/** ISO timestamp → "07:33 AM" (CashBook's time format). */
export function formatTime(iso: string): string {
  const { hour, minute } = istParts(iso)
  const h = Number(hour)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${minute} ${h < 12 ? 'AM' : 'PM'}`
}

/** ISO timestamp → value for <input type="datetime-local">, in IST. */
export function toLocalInput(iso: string | Date): string {
  const p = istParts(iso)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** <input type="datetime-local"> value (treated as IST) → ISO timestamp. */
export function fromLocalInput(value: string): string {
  return new Date(`${value}:00${IST_OFFSET}`).toISOString()
}

/** Start of an IST calendar day ("2026-04-05") as ISO. */
export function startOfDay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00${IST_OFFSET}`).toISOString()
}

/** Start of the IST day after dateKey, as ISO (exclusive upper bound). */
export function endOfDayExclusive(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00${IST_OFFSET}`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

/**
 * Parses CashBook's "05 Apr 2026" + "07:33 AM" (IST) into an ISO timestamp.
 * Returns null when either part is malformed.
 */
export function parseCashbookDateTime(date: string, time: string): string | null {
  const dm = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(date.trim())
  if (!dm) return null
  const month = MONTHS.findIndex((m) => m.toLowerCase() === dm[2].toLowerCase())
  if (month < 0) return null
  const day = Number(dm[1])

  let hour = 0
  let minute = 0
  const t = time.trim()
  if (t !== '') {
    const tm = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(t)
    if (!tm) return null
    hour = Number(tm[1])
    minute = Number(tm[2])
    if (hour < 1 || hour > 12 || minute > 59) return null
    const pm = tm[3].toLowerCase() === 'pm'
    hour = (hour % 12) + (pm ? 12 : 0)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${dm[3]}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${IST_OFFSET}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Reject impossible dates like 31 Feb, which Date would silently roll over.
  if (toDateKey(d) !== `${dm[3]}-${pad(month + 1)}-${pad(day)}`) return null
  return d.toISOString()
}

/** Today's IST date key. */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** Shifts a "YYYY-MM-DD" key by whole months and returns the first of that month. */
export function firstOfMonth(dateKey: string, monthOffset = 0): string {
  const [y, m] = dateKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + monthOffset, 1))
  return d.toISOString().slice(0, 10)
}

/** Last day of the month containing dateKey. */
export function lastOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}
