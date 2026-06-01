// js/supabase-client.js
// Initialise Supabase client — single import across all pages

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = window.__ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.__ENV?.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase config — check config.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// Convenience: get current user profile (cached in sessionStorage)
export async function getProfile() {
  const cached = sessionStorage.getItem('ccm_profile');
  if (cached) return JSON.parse(cached);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select(`*, school:schools(id, name, circuit:circuits(id, name, district:districts(id, name, province:provinces(id, name))))`)
    .eq('id', user.id)
    .single();

  if (data) sessionStorage.setItem('ccm_profile', JSON.stringify(data));
  return data;
}

export function clearProfileCache() {
  sessionStorage.removeItem('ccm_profile');
}
