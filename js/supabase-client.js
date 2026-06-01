// js/supabase-client.js
// Initialise Supabase client — single import across all pages

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.__ENV?.SUPABASE_URL
  || 'https://YOUR_PROJECT_REF.supabase.co';

const SUPABASE_ANON_KEY = window.__ENV?.SUPABASE_ANON_KEY
  || 'YOUR_SUPABASE_ANON_KEY';

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
