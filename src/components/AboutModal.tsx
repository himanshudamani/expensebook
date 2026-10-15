import { useState } from 'react'
import { formatDate } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { useLedgers, useMe } from '../lib/queries'
import { Modal } from './ui'

const WISDOM = [
  { text: 'Paisa bachaya, paisa kamaya.', meaning: 'A rupee saved is a rupee earned.' },
  { text: 'Boond boond se sagar banta hai.', meaning: 'Drop by drop, the ocean fills up. Small savings add up.' },
  { text: 'Jitni chadar ho, utne hi pair phailao.', meaning: 'Stretch your legs only as far as your blanket reaches.' },
  { text: 'Beware of little expenses; a small leak will sink a great ship.', meaning: 'Benjamin Franklin' },
  { text: "Do not save what is left after spending; spend what is left after saving.", meaning: 'Warren Buffett' },
  { text: 'Hisaab saaf, dosti pakki.', meaning: 'Clear accounts make for lasting relationships.' },
]

const TIPS = [
  'Tap + Cash In or − Cash Out to add an entry in seconds.',
  'Pick dates under Filters to see the opening and closing balance for that period.',
  'Use Select to put many entries into a category at once.',
  'Export a CSV every month or so. It is your backup.',
  'On your phone, use “Add to Home Screen” to open ExpenseBook like an app.',
]

const FIRST_YEAR = 2026

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="About">
      {open && <AboutContent />}
    </Modal>
  )
}

function AboutContent() {
  const ledgers = useLedgers()
  const me = useMe()
  // Picked once per opening of the About screen.
  const [wisdomIndex, setWisdomIndex] = useState(() => Math.floor(Math.random() * WISDOM.length))
  const wisdom = WISDOM[wisdomIndex]

  const stats = (ledgers.data ?? []).reduce(
    (s, l) => ({
      ledgers: s.ledgers + 1,
      entries: s.entries + l.entry_count,
      tracked: s.tracked + l.total_in + l.total_out,
    }),
    { ledgers: 0, entries: 0, tracked: 0 },
  )
  const [year] = useState(() => new Date().getFullYear())

  return (
    <div className="space-y-5 text-center">
      <div>
        <img src="./favicon.svg" alt="" className="mx-auto mb-3 size-16" />
        <h3 className="text-2xl leading-tight font-extrabold text-slate-900">Damani Family Expense Management</h3>
        <p className="mt-1 text-slate-500">Every rupee, accounted for.</p>
      </div>

      {ledgers.data && (
        <div className="grid grid-cols-3 gap-2">
          <Stat value={String(stats.ledgers)} label={stats.ledgers === 1 ? 'ledger' : 'ledgers'} />
          <Stat value={stats.entries.toLocaleString('en-IN')} label={stats.entries === 1 ? 'entry' : 'entries'} />
          <Stat value={formatMoney(stats.tracked).replace(/\.\d\d$/, '')} label="tracked" />
        </div>
      )}

      <figure className="rounded-xl bg-brand-50 p-4">
        <blockquote className="font-medium text-brand-700 italic">“{wisdom.text}”</blockquote>
        <figcaption className="mt-1 text-xs text-slate-600">{wisdom.meaning}</figcaption>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-brand-700 underline"
          onClick={() => setWisdomIndex((i) => (i + 1) % WISDOM.length)}
        >
          Another one
        </button>
      </figure>

      <div className="text-left">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Quick tips</h4>
        <ul className="space-y-1.5 text-sm text-slate-600">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="text-brand-600">•</span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
        {me.data && <p>Signed in as {me.data.email}</p>}
        <p>Last updated {formatDate(__BUILD_DATE__)}</p>
        <p>Made with ❤️ and lots of chai ☕</p>
        <p className="pt-2 text-sm font-medium text-slate-700">
          © {year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : FIRST_YEAR} Created by Himanshu Damani
        </p>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-2">
      <div className="truncate font-bold text-slate-900 tabular">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
