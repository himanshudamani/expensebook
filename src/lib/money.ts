// Amounts are handled as integer paise in the app to avoid floating point drift
// (0.1 + 0.2 style errors) when summing hundreds of entries.

const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function toPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100)
}

export function toRupees(paise: number): number {
  return paise / 100
}

/** 123456789 → "12,34,567.89" (no currency symbol). */
export function formatAmount(paise: number): string {
  return inr.format(paise / 100)
}

/** 123456789 → "₹12,34,567.89", -500 → "-₹5.00". */
export function formatMoney(paise: number): string {
  return (paise < 0 ? '-₹' : '₹') + formatAmount(Math.abs(paise))
}

/**
 * Parses user-typed or CSV amounts such as "1,975.39", "₹ 300", "  42 ".
 * Returns paise, or null when the text is not a valid amount.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return toPaise(cleaned)
}
