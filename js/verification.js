// js/verification.js
// Departmental Head verification workflow

import { supabase, getProfile } from './supabase-client.js';
import { requireAuth, renderUserNav } from './auth.js';
import { toast, setLoading, fmtPct, fmtDate, verificationBadge } from './utils.js';

let profile = null;

document.addEventListener('DOMContentLoaded', async () => {
  profile = await requireAuth();
  if (!profile) return;
  renderUserNav(profile);

  const urlParams = new URLSearchParams(window.location.search);
  const submissionId = urlParams.get('id');

  if (submissionId) {
    await loadSubmission(submissionId);
  } else {
    await loadPendingSubmissions();
  }
});

// ── Load all pending submissions for this school ─────────────
async function loadPendingSubmissions() {
  document.getElementById('pending-view').classList.remove('hidden');
  setLoading(true);

  const { data, error } = await supabase
    .from('submissions')
    .select(`
      id, status, has_evidence, coverage_pct, updated_at,
      school:schools(name), grade:grades(name), subject:subjects(name),
      term:terms(name), week:weeks(label)
    `)
    .eq('school_id', profile.school_id)
    .in('status', ['submitted', 'flagged'])
    .order('updated_at', { ascending: false });

  setLoading(false);

  if (error) { toast(error.message, 'error'); return; }

  const tbody = document.getElementById('pending-tbody');
  tbody.innerHTML = '';

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No pending submissions. Great work!</td></tr>';
    return;
  }

  data.forEach(sub => {
    const badge = verificationBadge(sub.status);
    const tr = document.createElement('tr');
    tr.className = !sub.has_evidence ? 'row-no-evidence' : '';
    tr.innerHTML = `
      <td>${sub.grade?.name}</td>
      <td>${sub.subject?.name}</td>
      <td>${sub.term?.name} · ${sub.week?.label}</td>
      <td>${fmtPct(sub.coverage_pct)}</td>
      <td>${sub.has_evidence ? '<span class="evidence-yes">✓ Yes</span>' : '<span class="evidence-no">✗ No</span>'}</td>
      <td><span class="badge ${badge.cls}">${badge.label}</span></td>
      <td>
        <a href="verification.html?id=${sub.id}" class="btn btn-sm btn-primary">Review</a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Load single submission for verification ──────────────────
async function loadSubmission(submissionId) {
  document.getElementById('verify-view').classList.remove('hidden');
  setLoading(true);

  const { data: sub, error } = await supabase
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

  setLoading(false);

  if (error || !sub) { toast('Submission not found', 'error'); return; }

  // Check DH has access to this school
  if (profile.role === 'departmental_head' && sub.school_id !== profile.school_id) {
    toast('Access denied.', 'error'); return;
  }

  renderVerificationForm(sub);
}

function renderVerificationForm(sub) {
  const cogMap = { 1: 'L1 – Knowledge', 2: 'L2 – Comprehension', 3: 'L3 – Application', 4: 'L4 – Analysis/Evaluation' };
  const topics  = (sub.submission_topics || []).map(t => t.topic?.title).filter(Boolean);
  const stList  = (sub.submission_subtopics || []).map(s => s.subtopic?.title).filter(Boolean);
  const cogs    = (sub.submission_cognitive_levels || []).map(c => cogMap[c.level]);
  const verif   = sub.verification?.[0];
  const badge   = verificationBadge(sub.status);

  document.getElementById('verify-title').textContent =
    `${sub.school?.name} — ${sub.grade?.name} ${sub.subject?.name} — ${sub.week?.label}`;

  document.getElementById('verify-content').innerHTML = `
    <div class="detail-grid">
      <section>
        <h3>Topics Covered</h3>
        <ul>${topics.map(t => `<li>${t}</li>`).join('') || '<li>None</li>'}</ul>
      </section>
      <section>
        <h3>Sub-topics <span class="coverage-pct">${fmtPct(sub.coverage_pct)}</span></h3>
        <ul class="subtopic-list-detail">${stList.map(s => `<li>✓ ${s}</li>`).join('') || '<li>None</li>'}</ul>
      </section>
      <section>
        <h3>Cognitive Levels</h3>
        <ul>${cogs.map(c => `<li>${c}</li>`).join('') || '<li>None</li>'}</ul>
      </section>
      <section>
        <h3>Evidence</h3>
        ${sub.has_evidence
          ? (sub.submission_evidence || []).map(ev => `
              <div class="evidence-item">
                <span class="ev-type">${ev.evidence_type.replace('_',' ')}</span>
                <span class="ev-name">${ev.file_name}</span>
                <button class="btn btn-sm btn-ghost" onclick="window.previewFile('${ev.storage_path}', '${ev.mime_type}')">Preview</button>
              </div>
            `).join('')
          : '<p class="alert-warning">⚠ No evidence uploaded for this submission.</p>'
        }
      </section>
    </div>

    ${sub.notes ? `<div class="notes-block"><h3>Educator Notes</h3><p>${sub.notes}</p></div>` : ''}

    ${verif ? `
      <div class="verif-block">
        <p><strong>Previous decision:</strong> <span class="badge ${verificationBadge(verif.decision).cls}">${verif.decision}</span></p>
        ${verif.verification_comment ? `<p><strong>Comment:</strong> ${verif.verification_comment}</p>` : ''}
      </div>
    ` : ''}

    <div class="verify-form-section">
      <h3>Your Verification Decision</h3>
      <div class="verify-options">
        <label class="verify-option verify-option--approve">
          <input type="radio" name="decision" value="verified"> ✓ Verify Submission
        </label>
        <label class="verify-option verify-option--flag">
          <input type="radio" name="decision" value="flagged"> ⚑ Flag for Follow-up
        </label>
      </div>
      <textarea id="verif-comment" class="input" placeholder="Verification comment (optional)…" rows="3"></textarea>
      <div class="verify-actions">
        <a href="verification.html" class="btn btn-ghost">← Back to list</a>
        <button class="btn btn-primary" onclick="window.submitVerification('${sub.id}')">Save Decision</button>
      </div>
    </div>
  `;

  // Pre-fill existing decision
  if (verif) {
    const radio = document.querySelector(`input[name="decision"][value="${verif.decision}"]`);
    if (radio) radio.checked = true;
    document.getElementById('verif-comment').value = verif.verification_comment || '';
  }
}

window.submitVerification = async (submissionId) => {
  const decision = document.querySelector('input[name="decision"]:checked')?.value;
  const comment  = document.getElementById('verif-comment').value.trim();

  if (!decision) { toast('Please select a decision (Verify or Flag).', 'error'); return; }

  setLoading(true);
  try {
    const userId = (await supabase.auth.getUser()).data.user.id;

    // Upsert verification record
    await supabase.from('verifications').upsert({
      submission_id:        submissionId,
      verified_by:          userId,
      verified_at:          new Date().toISOString(),
      decision:             decision,
      verification_comment: comment || null
    }, { onConflict: 'submission_id' });

    // Update submission status
    await supabase.from('submissions')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', submissionId);

    toast(`Submission ${decision} successfully.`, 'success');
    setTimeout(() => window.location.href = 'verification.html', 1200);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
};

window.previewFile = async (storagePath) => {
  const { data } = await supabase.storage.from('evidence').createSignedUrl(storagePath, 60);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  else toast('Could not generate preview link.', 'error');
};
