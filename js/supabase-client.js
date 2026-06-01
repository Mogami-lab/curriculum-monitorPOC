import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL     = 'https://bbeomlmrhiddwkmfqrtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZW9tbG1yaGlkZHdrbWZxcnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjExMjMsImV4cCI6MjA5MDM5NzEyM30.WOj9m-F4v09_oEN1SozGE5-lqP-rZWOWsZynafGgkn8'; // your full eyJ key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getProfile() {
  const cached = sessionStorage.getItem('ccm_profile');
  if (cached) return JSON.parse(cached);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select('*, school:schools(id, name, circuit:circuits(id, name, district:districts(id, name, province:provinces(id, name))))')
    .eq('id', user.id)
    .single();

  if (data) sessionStorage.setItem('ccm_profile', JSON.stringify(data));
  return data;
}

export function clearProfileCache() {
  sessionStorage.removeItem('ccm_profile');
}
