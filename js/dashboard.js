// js/dashboard.js
// Curriculum Official & DH dashboard logic

import { supabase, getProfile } from './supabase-client.js';
import { requireAuth, renderUserNav } from './auth.js';
import { toast, setLoading, populateSelect, fmtPct, fmtDate, coverageStatus, verificationBadge, debounce } from './utils.js';

let profile = null;
let allSubmissions = [];
let filters = {};

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  profile = await requireAuth();
  if (!profile) return;
  renderUserNav(profile);

  await loadFilterOptions();
  bindFilterEvents();
  await loadDashboard();
});

// ── Filter options ──────────────────────────────────────────
async function loadFilterOptions() {
  const [
    { data: districts },
    { data: circuits  },
    { data: schools   },
    { data: grades    },
    { data: subjects  },
    { data: terms     }
  ] = await Promise.all([
    supabase.from('districts').select('id, name').order('name'),
    supabase.from('circuits').select('id, name').order('name'),
    supabase.from('schools').select('id, name').order('name'),
    supabase.from('grades').select('id, name').order('sort_order'),
    supabase.from('subjects').select('id, name').order('name'),
    supabase.from('terms').select('id, name').order('sort_order')
  ]);

  populateSelect(document.getElementById('f-district'), districts || [], 'All districts');
  populateSelect(document.getElementById('f-circuit'),  circuits  || [], 'All circuits');
  populateSelect(document.getElementById('f-school'),   schools   || [], 'All schools');
  populateSelect(document.getElementById('f-grade'),    grades    || [], 'All grades');
  populateSelect(document.getElementById('f-subject'),  subjects  || [], 'All subjects');
  populateSelect(document.getElementById('f-term'),     terms     || [], 'All terms');

  // Restrict DH to own school
  if (profile.role === 'departmental_head') {
    document.getElementById('f-school').value = profile.school_id;
    document.getElementById('f-school').disabled = true;
  }
}

function bindFilterEvents() {
  const ids = ['f-district','f-circuit','f-school','f-grade','f-subject','f-term','f-week','f-status'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', debounce(onFilterChange, 200));
  });

  document.getElementById('f-term').addEventListener('change', async () => {
    const termId = document.getElementById('f-term').value;
    if (termId) {
      const { data } = await supabase.from('weeks').select('*').eq('term_id', termId).order('week_number');
      populateSelect(document.getElementById('f-week'), (data || []).map(w => ({ id: w.id, name: w.label })), 'All weeks');
    } else {
      document.getElementById('f-week').innerHTML = '<option value="">— All weeks —</option>';
    }
  });
}

function onFilterChange() {
  filters = {
    district_id: document.getElementById('f-district').value || null,
    circuit_id:  document.getElementById('f-circuit').value  || null,
    school_id:   document.getElementById('f-school').value   || null,
    grade_id:    document.getElementById('f-grade').value    || null,
    subject_id:  document.getElementById('f-subject').value  || null,
    term_id:     document.getElementById('f-term').value     || null,
    week_id:     document.getElementById('f-week').value     || null,
    status:      document.getElementById('f-status').value   || null
  };
  loadDashboard();
}

// ── Main data load ──────────────────────────────────────────
async function loadDashboard() {
  setLoading(true);
  try {
    let query = supabase
      .from('submissions')
      .select(`
        id, status, has_evidence, coverage_pct, created_at, updated_at,
        school:schools(id, name, circuit:circuits(id, name, district:districts(id, name))),
        grade:grades(id, name),
        subject:subjects(id, name),
        term:terms(id, name),
        week:weeks(id, label, week_number),
        verification:verifications(decision, verified_at, verification_comment)
      `)
      .order('updated_at', { ascending: false });

    // Apply filters
    if (filters.school_id)  query = query.eq('school_id', filters.school_id);
    else if (profile.role === 'departmental_head') query = query.eq('school_id', profile.school_id);
    if (filters.grade_id)   query = query.eq('grade_id',   filters.grade_id);
    if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
    if (filters.term_id)    query = query.eq('term_id',    filters.term_id);
    if (filters.week_id)    query = query.eq('week_id',    filters.week_id);
    if (filters.status)     query = query.eq('status',     filters.status);

    const { data, error } = await query;
    if (error) throw error;

    allSubmissions = data || [];
    renderSummaryCards(allSubmissions);
    renderTable(allSubmissions);
  } catch (err) {
    toast('Failed to load data: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── Summary cards ───────────────────────────────────────────
function renderSummaryCards(submissions) {
  const total        = submissions.length;
  const verified     = submissions.filter(s => s.status === 'verified').length;
  const flagged      = submissions.filter(s => s.status === 'flagged').length;
  const noEvidence   = submissions.filter(s => !s.has_evidence).length;
  const avgCov       = submissions.length
    ? (submissions.reduce((sum, s) => sum + (parseFloat(s.coverage_pct) || 0), 0) / submissions.length)
    : 0;

  document.getElementById('card-total').textContent      = total;
  document.getElementById('card-verified').textContent   = verified;
  document.getElementById('card-flagged').textContent    = flagged;
  document.getElementById('card-no-evidence').textContent = noEvidence;
  document.getElementById('card-avg-coverage').textContent = fmtPct(avgCov);
}

// ── Submission table ────────────────────────────────────────
function renderTable(submissions) {
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = '';

  if (!submissions.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No submissions found for the selected filters.</td></tr>`;
    return;
  }

  submissions.forEach(sub => {
    const vBadge = verificationBadge(sub.status);
    const hasEvGlyph = sub.has_evidence ? '<span class="evidence-yes">✓ Yes</span>' : '<span class="evidence-no">✗ No</span>';
    const verComment = sub.verification?.[0]?.verification_comment || '';
    const tr = document.createElement('tr');
    tr.className = `sub-row ${!sub.has_evidence ? 'row-no-evidence' : ''} ${sub.status === 'flagged' ? 'row-flagged' : ''}`;
    tr.innerHTML = `
      <td><button class="link-btn" onclick="window.openDetail('${sub.id}')">${sub.school?.name || '—'}</button></td>
      <td>${sub.grade?.name || '—'}</td>
      <td>${sub.subject?.name || '—'}</td>
      <td>${sub.week?.label || '—'}</td>
      <td>
        <div class="coverage-cell">
          <div class="mini-bar">
            <div class="mini-bar-fill" style="width:${sub.coverage_pct || 0}%"></div>
          </div>
          <span>${fmtPct(sub.coverage_pct)}</span>
        </div>
      </td>
      <td>${hasEvGlyph}</td>
      <td><span class="badge ${vBadge.cls}">${vBadge.label}</span></td>
      <td><small>${fmtDate(sub.updated_at)}</small></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm btn-ghost" onclick="window.openDetail('${sub.id}')">View</button>
          ${profile.role === 'departmental_head' ? `<button class="btn btn-sm btn-primary" onclick="window.openVerify('${sub.id}')">Verify</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Detail drilldown ────────────────────────────────────────
window.openDetail = async (submissionId) => {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="loading-spinner">Loading…</div>';

  const { data: sub } = await supabase
    .from('submissions')
    .select(`
      *,
      school:schools(name), grade:grades(name), subject:subjects(name),
      term:terms(name), week:weeks(label),
      submission_topics(topic:atp_topics(title, code)),
      submission_subtopics(subtopic:atp_subtopics(title, code)),
      submission_cognitive_levels(level),
      submission_evidence(*),
      verification:verifications(*)
    `)
    .eq('id', submissionId)
    .single();

  if (!sub) { panel.innerHTML = '<p>Not found.</p>'; return; }

  const vBadge  = verificationBadge(sub.status);
  const cogMap  = { 1: 'L1 – Knowledge', 2: 'L2 – Comprehension', 3: 'L3 – Application', 4: 'L4 – Analysis/Evaluation' };
  const topics  = (sub.submission_topics || []).map(t => t.topic?.title).filter(Boolean);
  const subs    = (sub.submission_subtopics || []).map(s => s.subtopic?.title).filter(Boolean);
  const cogs    = (sub.submission_cognitive_levels || []).map(c => cogMap[c.level]).filter(Boolean);
  const verif   = sub.verification?.[0];

  panel.innerHTML = `
    <div class="detail-header">
      <h2>${sub.school?.name}</h2>
      <button class="btn btn-ghost" onclick="document.getElementById('detail-panel').classList.add('hidden')">✕ Close</button>
    </div>
    <div class="detail-meta">
      <span>${sub.grade?.name} · ${sub.subject?.name} · ${sub.term?.name} · ${sub.week?.label}</span>
      <span class="badge ${vBadge.cls}">${vBadge.label}</span>
    </div>

    <div class="detail-grid">
      <section>
        <h3>Topics Covered</h3>
        <ul>${topics.map(t => `<li>${t}</li>`).join('') || '<li>None recorded</li>'}</ul>
      </section>
      <section>
        <h3>Sub-topics Covered <span class="coverage-pct">${fmtPct(sub.coverage_pct)}</span></h3>
        <ul class="subtopic-list-detail">${subs.map(s => `<li>✓ ${s}</li>`).join('') || '<li>None recorded</li>'}</ul>
      </section>
      <section>
        <h3>Cognitive Levels Assessed</h3>
        <ul>${cogs.map(c => `<li>${c}</li>`).join('') || '<li>None recorded</li>'}</ul>
      </section>
      <section>
        <h3>Evidence <span class="${sub.has_evidence ? 'evidence-yes' : 'evidence-no'}">${sub.has_evidence ? '✓ Uploaded' : '✗ Missing'}</span></h3>
        ${(sub.submission_evidence || []).map(ev => `
          <div class="evidence-item">
            <span class="ev-type">${ev.evidence_type.replace('_',' ')}</span>
            <span class="ev-name">${ev.file_name}</span>
            <button class="btn btn-sm btn-ghost" onclick="window.previewFile('${ev.storage_path}', '${ev.mime_type}')">Preview</button>
          </div>
        `).join('') || '<p class="text-muted">No evidence uploaded.</p>'}
      </section>
    </div>

    ${verif ? `
      <div class="verif-block">
        <h3>Verification</h3>
        <p><strong>Decision:</strong> <span class="badge ${verificationBadge(verif.decision).cls}">${verif.decision}</span></p>
        <p><strong>Date:</strong> ${fmtDate(verif.verified_at)}</p>
        ${verif.verification_comment ? `<p><strong>Comment:</strong> ${verif.verification_comment}</p>` : ''}
      </div>
    ` : ''}

    ${sub.notes ? `<div class="notes-block"><h3>Educator Notes</h3><p>${sub.notes}</p></div>` : ''}
  `;
};

window.openVerify = (submissionId) => {
  window.location.href = `verification.html?id=${submissionId}`;
};

// ── Evidence preview ────────────────────────────────────────
window.previewFile = async (storagePath) => {
  try {
    const { data, error } = await supabase.storage
      .from('evidence')
      .createSignedUrl(storagePath, 300);

    if (error) {
      toast('Preview error: ' + error.message, 'error');
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    } else {
      toast('No preview URL returned.', 'error');
    }
  } catch (err) {
    toast('Preview failed: ' + err.message, 'error');
  }
};
