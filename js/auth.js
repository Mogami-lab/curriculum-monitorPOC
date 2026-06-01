// js/auth.js
// Authentication helpers — sign in, sign out, route guard

import { supabase, getProfile, clearProfileCache } from './supabase-client.js';

const ROLE_HOME = {
  educator:             'capture.html',
  departmental_head:    'verification.html',
  curriculum_official:  'dashboard.html'
};

// Redirect to login if not authenticated; returns profile
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return getProfile();
}

// Redirect authenticated users away from login page
export async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const profile = await getProfile();
  if (profile) window.location.href = ROLE_HOME[profile.role] || 'dashboard.html';
}

// Sign in with email + password
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const profile = await getProfile();
  if (!profile) throw new Error('No user profile found. Contact your administrator.');
  return profile;
}

// Sign out
export async function signOut() {
  clearProfileCache();
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

// Render the nav user info block
export function renderUserNav(profile) {
  const el = document.getElementById('user-nav');
  if (!el || !profile) return;
  const roleLabel = {
    educator:            'Educator',
    departmental_head:   'Departmental Head',
    curriculum_official: 'Curriculum Official'
  }[profile.role] || profile.role;

  el.innerHTML = `
    <span class="nav-user-name">${profile.full_name}</span>
    <span class="badge badge-role">${roleLabel}</span>
    ${profile.school ? `<span class="nav-school">${profile.school.name}</span>` : ''}
    <button class="btn btn-ghost btn-sm" id="sign-out-btn">Sign out</button>
  `;
  document.getElementById('sign-out-btn').addEventListener('click', signOut);
}
