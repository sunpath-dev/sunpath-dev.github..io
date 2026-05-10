// Supabase client singleton for the web app. Module: core.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — auth and data calls will fail until set.',
  )
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
})
