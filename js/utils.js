// js/utils.js
// Shared utility functions

// Format a percentage for display
export function fmtPct(n) {
  if (n == null) return '—';
  return `${parseFloat(n).toFixed(1)}%`;
}

// Format a date string
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

// Return a coverage status label + CSS class
export function coverageStatus(pct, hasSubmission) {
  if (!hasSubmission) return { label: 'No Submission', cls: 'status-missing' };
  if (pct == null)    return { label: 'Unverified',    cls: 'status-unverified' };
  if (pct >= 90)      return { label: 'On Track',      cls: 'status-ontrack' };
  if (pct >= 60)      return { label: 'Behind',        cls: 'status-behind' };
  return               { label: 'Far Behind',          cls: 'status-far-behind' };
}

// Map submission.status → badge
export function verificationBadge(status) {
  const map = {
    submitted: { label: 'Submitted',  cls: 'badge-submitted'  },
    verified:  { label: 'Verified',   cls: 'badge-verified'   },
    flagged:   { label: 'Flagged',    cls: 'badge-flagged'    },
    draft:     { label: 'Draft',      cls: 'badge-draft'      }
  };
  return map[status] || { label: status, cls: '' };
}

// Show a toast notification
export function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => {
    t.classList.remove('toast-visible');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// Show/hide a loading overlay
export function setLoading(show, selector = '#loading-overlay') {
  const el = document.querySelector(selector);
  if (el) el.style.display = show ? 'flex' : 'none';
}

// Build a select element from an array of {id, name}
export function populateSelect(selectEl, items, placeholder = 'Select…') {
  selectEl.innerHTML = `<option value="">— ${placeholder} —</option>`;
  items.forEach(item => {
    const o = document.createElement('option');
    o.value = item.id;
    o.textContent = item.name || item.label;
    selectEl.appendChild(o);
  });
}

// Debounce
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Read file as base64
export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Human-readable file size
export function humanFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
