// Supabase client singleton for the web app. Module: core.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — auth and data calls will fail until set.',
  )
}

// `createClient` validates the URL synchronously at module load. When env
// is missing (e.g. CI without secrets) we substitute a syntactically valid
// placeholder so the bundle keeps working as a static shell — the auth
// hook short-circuits on the same condition and renders the sign-in page.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
