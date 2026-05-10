// Supabase client singleton for the web app. Module: core.

import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://sclisaylpwnffkkyepow.supabase.co'
const fallbackAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbGlzYXlscHduZmZra3llcG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTM5NDAsImV4cCI6MjA5Mzk2OTk0MH0.UauOnRMirTmgvwfp0445noEC-du0_hEXjyEQ8lHNuBY'

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
