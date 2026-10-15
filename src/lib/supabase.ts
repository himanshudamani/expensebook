import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// The anon key is public by design; data is protected by the Row Level
// Security policies in supabase/schema.sql.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
})
