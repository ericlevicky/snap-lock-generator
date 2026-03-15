'use strict';

(function () {
  const form = document.getElementById('dims-form');
  const errorMsg = document.getElementById('error-msg');
  const generateBtn = document.getElementById('generate-btn');
  const btnText = generateBtn.querySelector('.btn-text');
  const spinner = generateBtn.querySelector('.spinner');

  // ── Preset quick-fill ──────────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('length').value = btn.dataset.l;
      document.getElementById('height').value = btn.dataset.h;
      document.getElementById('depth').value = btn.dataset.d;
      hideError();
      clearInvalid();
    });
  });

  // ── Form submission ────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    clearInvalid();

    const length = parseFloat(document.getElementById('length').value);
    const height = parseFloat(document.getElementById('height').value);
    const depth = parseFloat(document.getElementById('depth').value);

    // Client-side validation
    const errors = [];
    if (!isPositive(length)) {
      markInvalid('length');
      errors.push('Length must be a positive number.');
    }
    if (!isPositive(height)) {
      markInvalid('height');
      errors.push('Height must be a positive number.');
    }
    if (!isPositive(depth)) {
      markInvalid('depth');
      errors.push('Depth must be a positive number.');
    }

    if (errors.length > 0) {
      showError(errors.join(' '));
      return;
    }

    // Show loading state
    setLoading(true);

    try {
      const response = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length, height, depth }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${response.status})`);
      }

      // Trigger file download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snaplock-case-${length}x${height}x${depth}mm.stl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  function isPositive(n) {
    return Number.isFinite(n) && n > 0;
  }

  function markInvalid(id) {
    document.getElementById(id).classList.add('invalid');
  }

  function clearInvalid() {
    document.querySelectorAll('.invalid').forEach((el) =>
      el.classList.remove('invalid')
    );
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
    errorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorMsg.hidden = true;
    errorMsg.textContent = '';
  }

  function setLoading(loading) {
    generateBtn.disabled = loading;
    btnText.textContent = loading ? 'Generating…' : 'Generate & Download STL';
    spinner.hidden = !loading;
  }

  // Clear invalid state on input change
  ['length', 'height', 'depth'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).classList.remove('invalid');
      hideError();
    });
  });
})();
