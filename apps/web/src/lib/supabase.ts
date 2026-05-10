// Supabase client singleton for the web app. Module: core.

import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://sclisaylpwnffkkyepow.supabase.co'
const fallbackAnon = 'sb_publishable_R7RpCcyNRLgHmuLBCTrFPw_ll4C8QBv'

const url = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnon

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('[supabase] Using checked-in publishable fallback config for the shared Sunpath project.')
}

export const supabase = createClient(
  url,
  anon,
  { auth: { persistSession: true, autoRefreshToken: true } },
)
