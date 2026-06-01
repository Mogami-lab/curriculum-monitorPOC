// js/capture.js
// Educator weekly coverage capture form logic

import { supabase, getProfile } from './supabase-client.js';
import { requireAuth, renderUserNav } from './auth.js';
import { toast, setLoading, populateSelect, humanFileSize } from './utils.js';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let profile = null;
let selectedFiles = [];
let existingSubmissionId = null;

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load dropdowns immediately — don't wait for profile
  await Promise.all([loadGrades(), loadSubjects(), loadTerms()]);

  // Then check auth separately
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  profile = await getProfile().catch(() => null);

  renderUserNav(profile);

  if (profile?.school) {
    document.getElementById('school-name-display').textContent = profile.school.name;
    document.getElementById('circuit-display').textContent = profile.school.circuit?.name || '—';
    document.getElementById('district-display').textContent = profile.school.circuit?.district?.name || '—';
    document.getElementById('province-display').textContent = profile.school.circuit?.district?.province?.name || '—';
  }

  // Cascade: grade/subject/term → week → topics
  document.getElementById('sel-grade').addEventListener('change', onContextChange);
  document.getElementById('sel-subject').addEventListener('change', onContextChange);
  document.getElementById('sel-term').addEventListener('change', onContextChange);
  document.getElementById('sel-week').addEventListener('change', onWeekChange);

  // Evidence upload
  const dropzone = document.getElementById('evidence-dropzone');
  const fileInput = document.getElementById('file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave',  () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    addFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener('change', () => addFiles([...fileInput.files]));

  // Form submit
  document.getElementById('capture-form').addEventListener('submit', onSubmit);
});

// ── Reference data loaders ──────────────────────────────────
async function loadGrades() {
  const { data } = await supabase.from('grades').select('*').order('sort_order');
  populateSelect(document.getElementById('sel-grade'), data, 'Select grade');
  if (profile?.grade_id) document.getElementById('sel-grade').value = profile.grade_id;
if (profile?.subject_id) document.getElementById('sel-subject').value = profile.subject_id;
}

async function loadSubjects() {
  const { data } = await supabase.from('subjects').select('*').order('name');
  populateSelect(document.getElementById('sel-subject'), data, 'Select subject');
  if (profile.subject_id) document.getElementById('sel-subject').value = profile.subject_id;
}

async function loadTerms() {
  const { data } = await supabase.from('terms').select('*').order('sort_order');
  populateSelect(document.getElementById('sel-term'), data, 'Select term');
}

// ── Cascading selects ───────────────────────────────────────
async function onContextChange() {
  const gradeId   = document.getElementById('sel-grade').value;
  const subjectId = document.getElementById('sel-subject').value;
  const termId    = document.getElementById('sel-term').value;

  clearTopics();
  const weekSec = document.getElementById('week-section');
  if (weekSec) weekSec.classList.toggle('hidden', !termId);

  if (termId) {
    const { data } = await supabase
      .from('weeks').select('*')
      .eq('term_id', termId).order('week_number');
    populateSelect(document.getElementById('sel-week'), (data || []).map(w => ({ id: w.id, name: w.label })), 'Select week');
  }

  if (gradeId && subjectId && termId) {
    await checkExistingSubmission();
  }
}

async function onWeekChange() {
  const gradeId   = document.getElementById('sel-grade').value;
  const subjectId = document.getElementById('sel-subject').value;
  const weekId    = document.getElementById('sel-week').value;

  clearTopics();
  if (!gradeId || !subjectId || !weekId) return;

  await loadTopics(gradeId, subjectId, weekId);
  await checkExistingSubmission();
}

// ── Check for existing submission ───────────────────────────
async function checkExistingSubmission() {
  const gradeId   = document.getElementById('sel-grade').value;
  const subjectId = document.getElementById('sel-subject').value;
  const termId    = document.getElementById('sel-term').value;
  const weekId    = document.getElementById('sel-week').value;
  if (!gradeId || !subjectId || !termId || !weekId) return;

  const { data } = await supabase
    .from('submissions')
    .select('id, status, coverage_pct')
    .eq('school_id', profile.school_id)
    .eq('grade_id', gradeId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .eq('week_id', weekId)
    .maybeSingle();

  const notice = document.getElementById('existing-notice');
  if (data) {
    existingSubmissionId = data.id;
    notice.innerHTML = `<span class="icon">ℹ️</span> A submission already exists for this week (Status: <strong>${data.status}</strong>, Coverage: ${data.coverage_pct ?? '—'}%). Submitting will update it.`;
    notice.classList.remove('hidden');
    await prefillExisting(data.id);
  } else {
    existingSubmissionId = null;
    notice.classList.add('hidden');
  }
}

async function prefillExisting(submissionId) {
  // Load previously selected subtopics and cognitive levels
  const [{ data: subTopics }, { data: subCog }] = await Promise.all([
    supabase.from('submission_subtopics').select('subtopic_id').eq('submission_id', submissionId),
    supabase.from('submission_cognitive_levels').select('level').eq('submission_id', submissionId)
  ]);

  (subTopics || []).forEach(row => {
    const cb = document.querySelector(`input[data-subtopic="${row.subtopic_id}"]`);
    if (cb) cb.checked = true;
  });
  (subCog || []).forEach(row => {
    const cb = document.querySelector(`input[name="cog-level"][value="${row.level}"]`);
    if (cb) cb.checked = true;
  });

  updateTopicCoverage();
}

// ── Topic / subtopic loading ────────────────────────────────
async function loadTopics(gradeId, subjectId, weekId) {
  setLoading(true);

  // Get topics expected this week
  const { data: expected } = await supabase
    .from('weekly_expectations')
    .select('topic:atp_topics(id, title, code)')
    .eq('week_id', weekId);

  const expectedTopicIds = new Set((expected || []).map(r => r.topic?.id).filter(Boolean));

  // Get all topics for grade+subject
  const { data: topics } = await supabase
    .from('atp_topics')
    .select(`id, title, code, atp_subtopics(id, title, code, sort_order)`)
    .eq('grade_id', gradeId)
    .eq('subject_id', subjectId)
    .order('sort_order');

  renderTopics(topics || [], expectedTopicIds);
  setLoading(false);
}

function renderTopics(topics, expectedIds) {
  const container = document.getElementById('topics-container');
  container.innerHTML = '';

  if (!topics.length) {
    container.innerHTML = '<p class="text-muted">No topics found for this grade and subject.</p>';
    return;
  }

  document.getElementById('topics-section').style.display = 'block';

  topics.forEach(topic => {
    const isExpected = expectedIds.has(topic.id);
    const card = document.createElement('div');
    card.className = `topic-card ${isExpected ? 'topic-expected' : ''}`;
    card.innerHTML = `
      <div class="topic-header">
        <label class="topic-title">
          <input type="checkbox" name="topic" value="${topic.id}" data-topic="${topic.id}"
                 onchange="window.onTopicToggle(this)">
          <span>${topic.code ? `<code>${topic.code}</code> ` : ''}${topic.title}</span>
        </label>
        ${isExpected ? '<span class="badge badge-expected">Expected this week</span>' : ''}
      </div>
      <div class="subtopic-list" id="subtopics-${topic.id}">
        ${(topic.atp_subtopics || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(st => `
            <label class="subtopic-item">
              <input type="checkbox" name="subtopic" value="${st.id}"
                     data-subtopic="${st.id}" data-topic="${topic.id}"
                     onchange="window.updateTopicCoverage()">
              <span>${st.code ? `<small>${st.code}</small> ` : ''}${st.title}</span>
            </label>
          `).join('')}
      </div>
    `;
    container.appendChild(card);
  });
}

window.onTopicToggle = (checkbox) => {
  const topicId = checkbox.dataset.topic;
  const subtopics = document.querySelectorAll(`input[data-topic="${topicId}"][name="subtopic"]`);
  subtopics.forEach(st => st.checked = checkbox.checked);
  updateTopicCoverage();
};

function clearTopics() {
  document.getElementById('topics-section').style.display = 'none';
  document.getElementById('topics-container').innerHTML = '';
}

// ── Coverage progress bar ───────────────────────────────────
window.updateTopicCoverage = function() {
  const total   = document.querySelectorAll('input[name="subtopic"]').length;
  const checked = document.querySelectorAll('input[name="subtopic"]:checked').length;
  const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;

  const bar   = document.getElementById('coverage-bar');
  const label = document.getElementById('coverage-label');
  if (bar) {
    bar.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    label.textContent = `${checked} / ${total} sub-topics selected (${pct}%)`;
  }
};

// ── Evidence file handling ──────────────────────────────────
function addFiles(files) {
  const remaining = MAX_FILES - selectedFiles.length;
  const toAdd = files.slice(0, remaining);

  toAdd.forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      toast(`${file.name} exceeds 10MB limit`, 'error');
      return;
    }
    if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
      selectedFiles.push(file);
    }
  });

  if (files.length > remaining) {
    toast(`Maximum ${MAX_FILES} files allowed`, 'warning');
  }

  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');
  list.innerHTML = '';

  selectedFiles.forEach((file, i) => {
    const isImage = file.type.startsWith('image/');
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <span class="file-icon">${isImage ? '🖼️' : '📄'}</span>
      <span class="file-name">${file.name}</span>
      <span class="file-size">${humanFileSize(file.size)}</span>
      <select class="file-type-select" data-index="${i}">
        <option value="classwork">Classwork</option>
        <option value="homework">Homework</option>
        <option value="learner_script">Learner Script</option>
        <option value="test">Test</option>
        <option value="workbook">Workbook</option>
        <option value="other">Other</option>
      </select>
      <button type="button" class="btn btn-ghost btn-icon" onclick="window.removeFile(${i})" title="Remove">✕</button>
    `;
    list.appendChild(div);
  });

  document.getElementById('evidence-count').textContent =
    selectedFiles.length > 0
      ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`
      : '';
}

window.removeFile = (i) => {
  selectedFiles.splice(i, 1);
  renderFileList();
};

// ── Form submission ─────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();

  const gradeId   = document.getElementById('sel-grade').value;
  const subjectId = document.getElementById('sel-subject').value;
  const termId    = document.getElementById('sel-term').value;
  const weekId    = document.getElementById('sel-week').value;
  const notes     = document.getElementById('notes').value.trim();

  // Validation
  const topicChecked    = document.querySelectorAll('input[name="topic"]:checked');
  const subtopicChecked = document.querySelectorAll('input[name="subtopic"]:checked');
  const cogChecked      = document.querySelectorAll('input[name="cog-level"]:checked');

  if (!gradeId || !subjectId || !termId || !weekId) {
    toast('Please select grade, subject, term and week.', 'error'); return;
  }
  if (!topicChecked.length) {
    toast('Please select at least one topic.', 'error'); return;
  }
  if (!subtopicChecked.length) {
    toast('Please select at least one sub-topic.', 'error'); return;
  }
  if (!cogChecked.length) {
    toast('Please select at least one cognitive level.', 'error'); return;
  }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  setLoading(true);

  try {
    // Coverage calculation
    const totalSubs   = document.querySelectorAll('input[name="subtopic"]').length;
    const coveredSubs = subtopicChecked.length;
    const coveragePct = totalSubs > 0 ? (coveredSubs / totalSubs) * 100 : 0;

    // Upsert submission
    const submissionPayload = {
      school_id:    profile.school_id,
      grade_id:     gradeId,
      subject_id:   subjectId,
      term_id:      termId,
      week_id:      weekId,
      submitted_by: (await supabase.auth.getUser()).data.user.id,
      status:       'submitted',
      has_evidence: selectedFiles.length > 0,
      coverage_pct: parseFloat(coveragePct.toFixed(2)),
      notes:        notes || null,
      updated_at:   new Date().toISOString()
    };

    let submissionId;

    if (existingSubmissionId) {
      await supabase.from('submissions').update(submissionPayload).eq('id', existingSubmissionId);
      submissionId = existingSubmissionId;
      // Delete old child records
      await Promise.all([
        supabase.from('submission_topics').delete().eq('submission_id', submissionId),
        supabase.from('submission_subtopics').delete().eq('submission_id', submissionId),
        supabase.from('submission_cognitive_levels').delete().eq('submission_id', submissionId)
      ]);
    } else {
      const { data, error } = await supabase.from('submissions').insert(submissionPayload).select('id').single();
      if (error) throw error;
      submissionId = data.id;
    }

    // Insert child records
    await supabase.from('submission_topics').insert(
      [...topicChecked].map(cb => ({ submission_id: submissionId, topic_id: cb.value }))
    );
    await supabase.from('submission_subtopics').insert(
      [...subtopicChecked].map(cb => ({ submission_id: submissionId, subtopic_id: cb.value }))
    );
    await supabase.from('submission_cognitive_levels').insert(
      [...cogChecked].map(cb => ({ submission_id: submissionId, level: parseInt(cb.value) }))
    );

    // Upload evidence files
    if (selectedFiles.length > 0) {
      const userId = (await supabase.auth.getUser()).data.user.id;
      const evidenceRecords = [];

      for (const [i, file] of selectedFiles.entries()) {
        const typeSelect = document.querySelector(`.file-type-select[data-index="${i}"]`);
        const evidenceType = typeSelect?.value || 'other';
        const ext = file.name.split('.').pop();
        const storagePath = `${userId}/${submissionId}/${Date.now()}_${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          console.warn('Upload error:', uploadError);
          toast(`Failed to upload ${file.name}`, 'warning');
          continue;
        }

        evidenceRecords.push({
          submission_id: submissionId,
          evidence_type: evidenceType,
          file_name:     file.name,
          storage_path:  storagePath,
          mime_type:     file.type,
          file_size_kb:  Math.round(file.size / 1024)
        });
      }

      if (evidenceRecords.length > 0) {
        await supabase.from('submission_evidence').insert(evidenceRecords);
        await supabase.from('submissions').update({ has_evidence: true }).eq('id', submissionId);
      }
    }

    toast('Submission saved successfully! ✓', 'success');
    setTimeout(() => window.location.href = 'capture.html', 1500);

  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Coverage';
  } finally {
    setLoading(false);
  }
}
