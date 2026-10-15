import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/money'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-out-bg px-3 py-2 text-sm text-out">
      {message}
    </div>
  )
}

/** Native <dialog>: gives focus trapping, Esc-to-close and a backdrop for free. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-white p-0 backdrop:bg-slate-900/40 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      {open && (
        <div className="max-h-[90dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="btn-ghost -mr-2 px-2 py-1" aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function PageHeader({ title, back, actions }: { title: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
        {back && (
          <Link to={back} className="btn-ghost -ml-2 px-2 py-1 text-lg" aria-label="Back">
            ←
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        {actions}
      </div>
    </header>
  )
}

export function Money({ paise, colored = false, className = '' }: { paise: number; colored?: boolean; className?: string }) {
  const color = !colored ? '' : paise < 0 ? 'text-out' : 'text-in'
  return <span className={`tabular ${color} ${className}`}>{formatMoney(paise)}</span>
}

export function TotalsBar({ totalIn, totalOut }: { totalIn: number; totalOut: number }) {
  return (
    <div className="card grid grid-cols-3 divide-x divide-slate-200 text-center">
      <div className="px-1 py-3">
        <div className="text-xs text-slate-500">Total In</div>
        <Money paise={totalIn} className="text-sm font-semibold text-in sm:text-base" />
      </div>
      <div className="px-1 py-3">
        <div className="text-xs text-slate-500">Total Out</div>
        <Money paise={totalOut} className="text-sm font-semibold text-out sm:text-base" />
      </div>
      <div className="px-1 py-3">
        <div className="text-xs text-slate-500">Net Balance</div>
        <Money paise={totalIn - totalOut} colored className="text-sm font-semibold sm:text-base" />
      </div>
    </div>
  )
}
