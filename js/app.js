/**
 * KubeFix Application Controller
 * Handles UI interactions, live validation, diff viewer, and file management.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Instances
  const validator = new K8sYamlValidator();
  const corrector = new K8sYamlCorrector();

  // DOM Elements
  const codeEditor = document.getElementById('codeEditor');
  const lineNumbers = document.getElementById('lineNumbers');
  const dropOverlay = document.getElementById('dropOverlay');
  const presetSelect = document.getElementById('presetSelect');
  const fileUploadInput = document.getElementById('fileUploadInput');

  // Toolbar & Action buttons
  const btnValidate = document.getElementById('btnValidate');
  const btnAutoFixAll = document.getElementById('btnAutoFixAll');
  const btnPrettify = document.getElementById('btnPrettify');
  const btnClear = document.getElementById('btnClear');
  const btnCopy = document.getElementById('btnCopy');
  const btnDownload = document.getElementById('btnDownload');
  const btnUpload = document.getElementById('btnUpload');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const btnHelpModal = document.getElementById('btnHelpModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const helpModal = document.getElementById('helpModal');

  // Metric displays
  const healthDial = document.getElementById('healthDial');
  const healthDialScore = document.getElementById('healthDialScore');
  const statusBadge = document.getElementById('statusBadge');
  const scoreLabel = document.getElementById('scoreLabel');
  const statTotalResources = document.getElementById('statTotalResources');
  const statErrors = document.getElementById('statErrors');
  const statWarnings = document.getElementById('statWarnings');
  const statInfos = document.getElementById('statInfos');
  const statFixable = document.getElementById('statFixable');

  // Footer counters
  const cursorPosition = document.getElementById('cursorPosition');
  const docCharCount = document.getElementById('docCharCount');
  const docLineCount = document.getElementById('docLineCount');

  // Tabs & Views
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const issuesList = document.getElementById('issuesList');
  const tabBadgeIssues = document.getElementById('tabBadgeIssues');
  const tabBadgeResources = document.getElementById('tabBadgeResources');
  const filterPills = document.querySelectorAll('.filter-pill');
  const diffContainer = document.getElementById('diffContainer');
  const btnApplyDiff = document.getElementById('btnApplyDiff');
  const btnCopyDiff = document.getElementById('btnCopyDiff');
  const resourcesGrid = document.getElementById('resourcesGrid');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let currentReport = null;
  let currentActiveFilter = 'all';
  let latestCorrectedYaml = '';
  let validationTimeout = null;

  // Initialize with the first preset
  if (window.K8S_PRESETS && window.K8S_PRESETS.indentationErrors) {
    codeEditor.value = window.K8S_PRESETS.indentationErrors.yaml;
  }

  // Initial Run
  updateEditorGutter();
  runValidation();

  // =========================================================================
  // Editor Event Handlers & Line Gutter
  // =========================================================================

  codeEditor.addEventListener('input', () => {
    updateEditorGutter();
    updateFooterStats();

    // Debounce live validation (300ms)
    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(() => {
      runValidation();
    }, 300);
  });

  // Synchronize scrolling
  codeEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
  });

  // Cursor position tracking
  codeEditor.addEventListener('keyup', updateCursorPosition);
  codeEditor.addEventListener('click', updateCursorPosition);

  // Tab key indents with 2 spaces instead of leaving textarea
  codeEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeEditor.selectionStart;
      const end = codeEditor.selectionEnd;
      const val = codeEditor.value;

      codeEditor.value = val.substring(0, start) + '  ' + val.substring(end);
      codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
      updateEditorGutter();
      updateFooterStats();
      runValidation();
    }
  });

  function updateEditorGutter() {
    const lines = codeEditor.value.split('\n');
    const totalLines = lines.length;

    let gutterHtml = '';
    const errorLines = new Set();

    if (currentReport && currentReport.issues) {
      currentReport.issues.forEach(iss => {
        if (iss.severity === 'error' && iss.line) {
          errorLines.add(iss.line);
        }
      });
    }

    for (let i = 1; i <= totalLines; i++) {
      const isErr = errorLines.has(i);
      gutterHtml += `<span class="line-num ${isErr ? 'has-error' : ''}">${i}</span>`;
    }

    lineNumbers.innerHTML = gutterHtml;
    docLineCount.textContent = `${totalLines} lines`;
  }

  function updateFooterStats() {
    docCharCount.textContent = `${codeEditor.value.length} chars`;
  }

  function updateCursorPosition() {
    const text = codeEditor.value;
    const selStart = codeEditor.selectionStart;
    const textBefore = text.substring(0, selStart);
    const lines = textBefore.split('\n');
    const curLine = lines.length;
    const curCol = lines[lines.length - 1].length + 1;
    cursorPosition.textContent = `Ln ${curLine}, Col ${curCol}`;
  }

  // =========================================================================
  // Drag & Drop File Handling
  // =========================================================================

  ['dragenter', 'dragover'].forEach(name => {
    codeEditor.addEventListener(name, (e) => {
      e.preventDefault();
      dropOverlay.classList.add('active');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropOverlay.addEventListener(name, (e) => {
      e.preventDefault();
      dropOverlay.classList.remove('active');
    });
  });

  dropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      readFileIntoEditor(file);
    }
  });

  btnUpload.addEventListener('click', () => {
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      readFileIntoEditor(e.target.files[0]);
    }
  });

  function readFileIntoEditor(file) {
    if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml') && !file.name.endsWith('.txt')) {
      showToast('Please upload a valid .yaml or .yml file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      codeEditor.value = event.target.result;
      updateEditorGutter();
      updateFooterStats();
      runValidation();
      showToast(`Loaded ${file.name}`, 'success');
    };
    reader.readAsText(file);
  }

  // =========================================================================
  // Preset Templates
  // =========================================================================

  presetSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    if (window.K8S_PRESETS && window.K8S_PRESETS[key]) {
      codeEditor.value = window.K8S_PRESETS[key].yaml;
      updateEditorGutter();
      updateFooterStats();
      runValidation();
      switchTab('issues');
      showToast(`Preset loaded: ${window.K8S_PRESETS[key].name}`, 'info');
    }
  });

  // =========================================================================
  // Action Buttons
  // =========================================================================

  btnValidate.addEventListener('click', () => {
    runValidation();
    showToast('Validation completed', 'info');
  });

  btnPrettify.addEventListener('click', () => {
    const formatted = corrector.prettify(codeEditor.value);
    codeEditor.value = formatted;
    updateEditorGutter();
    updateFooterStats();
    runValidation();
    showToast('YAML reformatted with standard 2-space indentation', 'success');
  });

  btnAutoFixAll.addEventListener('click', () => {
    const originalYaml = codeEditor.value;
    const fixedYaml = corrector.fixAll(originalYaml);

    if (fixedYaml === originalYaml) {
      showToast('No auto-fixable issues detected.', 'info');
      return;
    }

    latestCorrectedYaml = fixedYaml;
    renderDiff(originalYaml, fixedYaml);

    // Prompt user via tab switch or direct apply
    codeEditor.value = fixedYaml;
    updateEditorGutter();
    updateFooterStats();
    runValidation();
    switchTab('diff');
    showToast('Applied all automated fixes! Review diff below.', 'success');
  });

  btnClear.addEventListener('click', () => {
    codeEditor.value = '';
    updateEditorGutter();
    updateFooterStats();
    runValidation();
    showToast('Editor cleared', 'info');
  });

  btnCopy.addEventListener('click', () => {
    if (!codeEditor.value) return;
    navigator.clipboard.writeText(codeEditor.value).then(() => {
      showToast('Copied YAML to clipboard', 'success');
    });
  });

  btnDownload.addEventListener('click', () => {
    if (!codeEditor.value) return;
    downloadYamlFile(codeEditor.value, 'kubernetes-manifest.yaml');
  });

  function downloadYamlFile(content, filename) {
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`, 'success');
  }

  // =========================================================================
  // Main Validation Pipeline
  // =========================================================================

  function runValidation() {
    const yamlText = codeEditor.value;
    currentReport = validator.validate(yamlText);

    // 1. Update Metrics Banner
    updateMetrics(currentReport);

    // 2. Render Issues Tab
    renderIssues(currentReport);

    // 3. Render Resource Visualizer
    renderResources(currentReport);

    // 4. Update Gutter Error Indicators
    updateEditorGutter();

    // 5. Update Diff preview if user switches to diff
    if (yamlText.trim() !== '') {
      latestCorrectedYaml = corrector.fixAll(yamlText);
      renderDiff(yamlText, latestCorrectedYaml);
    }
  }

  function updateMetrics(report) {
    // Health dial
    healthDial.style.setProperty('--score-pct', report.score);
    healthDialScore.textContent = `${report.score}%`;

    // Status Badge
    statusBadge.className = 'status-badge';
    if (report.stats.errors > 0) {
      statusBadge.classList.add('has-errors');
      statusBadge.textContent = 'Critical Issues';
    } else if (report.stats.warnings > 0) {
      statusBadge.classList.add('has-warnings');
      statusBadge.textContent = 'Has Warnings';
    } else if (report.stats.totalResources > 0) {
      statusBadge.classList.add('valid');
      statusBadge.textContent = 'Valid Manifest';
    } else {
      statusBadge.textContent = 'Empty';
    }

    scoreLabel.textContent = `Grade: ${report.grade} • ${report.stats.totalResources} resource(s)`;

    // Stat counters
    statTotalResources.textContent = report.stats.totalResources;
    statErrors.textContent = report.stats.errors;
    statWarnings.textContent = report.stats.warnings;
    statInfos.textContent = report.stats.infos;
    statFixable.textContent = report.stats.fixableCount;

    // Badges on tabs
    tabBadgeIssues.textContent = report.issues.length;
    tabBadgeResources.textContent = report.documents.length;
  }

  // =========================================================================
  // Issues Rendering & Filtering
  // =========================================================================

  function renderIssues(report) {
    const issues = report.issues || [];

    // Filter issues
    const filteredIssues = issues.filter(iss => {
      if (currentActiveFilter === 'all') return true;
      if (currentActiveFilter === 'error') return iss.severity === 'error';
      if (currentActiveFilter === 'warning') return iss.severity === 'warning';
      if (currentActiveFilter === 'info') return iss.severity === 'info';
      if (currentActiveFilter === 'fixable') return !!iss.fixable;
      return true;
    });

    if (filteredIssues.length === 0) {
      if (issues.length === 0 && report.stats.totalResources > 0) {
        issuesList.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3>All Checks Passed!</h3>
            <p>Your Kubernetes manifests are compliant, secure, and ready for deployment.</p>
          </div>
        `;
      } else if (report.stats.totalResources === 0) {
        issuesList.innerHTML = `
          <div class="empty-state">
            <p>Enter or upload Kubernetes YAML to inspect issues.</p>
          </div>
        `;
      } else {
        issuesList.innerHTML = `
          <div class="empty-state">
            <p>No issues match the selected filter "${currentActiveFilter}".</p>
          </div>
        `;
      }
      return;
    }

    let html = '';
    filteredIssues.forEach((iss, idx) => {
      html += `
        <div class="issue-card ${iss.severity}">
          <div class="issue-card-header">
            <div class="issue-meta">
              <span class="issue-severity ${iss.severity}">${iss.severity}</span>
              ${iss.line ? `<span class="issue-line-badge" data-line="${iss.line}">Line ${iss.line}${iss.column ? `:${iss.column}` : ''}</span>` : ''}
              <span class="resource-tag">${iss.category || 'General'}</span>
            </div>
            ${iss.fixable ? `
              <button class="btn-quick-fix" data-issue-index="${idx}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                Quick Fix
              </button>
            ` : ''}
          </div>

          <div class="issue-title">${escapeHtml(iss.message)}</div>

          ${iss.details ? `<div class="issue-details">${escapeHtml(iss.details)}</div>` : ''}

          ${iss.recommendation ? `
            <div class="issue-recommendation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>${escapeHtml(iss.recommendation)}</span>
            </div>
          ` : ''}
        </div>
      `;
    });

    issuesList.innerHTML = html;

    // Attach Click Events to Quick Fix buttons
    issuesList.querySelectorAll('.btn-quick-fix').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const issueIdx = parseInt(e.currentTarget.getAttribute('data-issue-index'), 10);
        const targetIssue = filteredIssues[issueIdx];
        if (targetIssue) {
          applySingleIssueFix(targetIssue);
        }
      });
    });

    // Attach Click Events to Line Badges to jump cursor
    issuesList.querySelectorAll('.issue-line-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        const line = parseInt(e.currentTarget.getAttribute('data-line'), 10);
        jumpToLine(line);
      });
    });
  }

  function applySingleIssueFix(issue) {
    const originalYaml = codeEditor.value;
    const fixedYaml = corrector.applySingleFix(originalYaml, issue);

    if (fixedYaml === originalYaml) {
      showToast('Could not automatically fix this item.', 'warning');
      return;
    }

    codeEditor.value = fixedYaml;
    updateEditorGutter();
    updateFooterStats();
    runValidation();
    showToast(`Fix applied for: ${issue.category}`, 'success');
  }

  function jumpToLine(lineNumber) {
    const lines = codeEditor.value.split('\n');
    let charIndex = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      charIndex += lines[i].length + 1;
    }

    codeEditor.focus();
    codeEditor.setSelectionRange(charIndex, charIndex + (lines[lineNumber - 1] ? lines[lineNumber - 1].length : 0));

    // Scroll textarea to line
    const lineHeight = 1.6 * 13.12; // approximate line height in px
    codeEditor.scrollTop = Math.max(0, (lineNumber - 4) * lineHeight);
    showToast(`Scrolled to line ${lineNumber}`, 'info');
  }

  // Filter Pill buttons
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentActiveFilter = pill.getAttribute('data-filter');
      renderIssues(currentReport);
    });
  });

  // =========================================================================
  // Diff View Rendering
  // =========================================================================

  function renderDiff(oldYaml, newYaml) {
    if (!oldYaml && !newYaml) {
      diffContainer.innerHTML = '<div style="padding:1rem;color:var(--text-muted);">No diff to display.</div>';
      return;
    }

    const diffLines = corrector.computeDiff(oldYaml, newYaml);
    let html = '';

    diffLines.forEach(item => {
      const lineNumStr = item.newLineNumber ? item.newLineNumber : (item.oldLineNumber ? item.oldLineNumber : '');
      html += `
        <div class="diff-line ${item.type}">
          <span class="diff-line-number">${lineNumStr}</span>
          <span class="diff-line-content">${escapeHtml(item.content)}</span>
        </div>
      `;
    });

    diffContainer.innerHTML = html;
  }

  btnApplyDiff.addEventListener('click', () => {
    if (!latestCorrectedYaml) return;
    codeEditor.value = latestCorrectedYaml;
    updateEditorGutter();
    updateFooterStats();
    runValidation();
    showToast('Applied corrected YAML to editor', 'success');
  });

  btnCopyDiff.addEventListener('click', () => {
    if (!latestCorrectedYaml) return;
    navigator.clipboard.writeText(latestCorrectedYaml).then(() => {
      showToast('Copied corrected YAML to clipboard', 'success');
    });
  });

  // =========================================================================
  // Resource Visualizer Rendering
  // =========================================================================

  function renderResources(report) {
    const docs = report.documents || [];

    if (docs.length === 0) {
      resourcesGrid.innerHTML = '<div class="empty-state"><p>No parsed Kubernetes resources found.</p></div>';
      return;
    }

    let html = '';
    docs.forEach(doc => {
      const raw = doc.raw || {};
      const kind = doc.kind;
      const name = doc.name;
      const namespace = doc.namespace;

      // Extract containers/replicas/ports
      let containers = [];
      let replicas = '1';
      let ports = [];

      if (raw.spec) {
        if (raw.spec.replicas !== undefined) {
          replicas = String(raw.spec.replicas);
        }
        if (raw.spec.containers) {
          containers = raw.spec.containers;
        } else if (raw.spec.template && raw.spec.template.spec && raw.spec.template.spec.containers) {
          containers = raw.spec.template.spec.containers;
        }
        if (raw.spec.ports) {
          ports = raw.spec.ports;
        }
      }

      html += `
        <div class="resource-card">
          <div class="resource-card-header">
            <span class="resource-kind-badge">${escapeHtml(kind)}</span>
            <span class="resource-tag">${escapeHtml(doc.apiVersion)}</span>
          </div>

          <div class="resource-name">${escapeHtml(name)}</div>
          <div class="resource-namespace">Namespace: <strong>${escapeHtml(namespace)}</strong></div>

          <div class="resource-attributes">
            ${replicas && ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind) ? `
              <span class="resource-tag">Replicas: ${replicas}</span>
            ` : ''}

            ${containers.length > 0 ? `
              <span class="resource-tag">Containers: ${containers.length}</span>
            ` : ''}

            ${ports.length > 0 ? `
              <span class="resource-tag">Ports: ${ports.map(p => p.port).join(', ')}</span>
            ` : ''}
          </div>

          ${containers.length > 0 ? `
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">
              <strong>Images:</strong> ${containers.map(c => escapeHtml(c.image || 'None')).join(', ')}
            </div>
          ` : ''}
        </div>
      `;
    });

    resourcesGrid.innerHTML = html;
  }

  // =========================================================================
  // Tabs Navigation
  // =========================================================================

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  function switchTab(tabId) {
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
  }

  // =========================================================================
  // Theme Toggle (Dark / Light)
  // =========================================================================

  btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-light');
    const isLight = document.body.classList.contains('theme-light');
    localStorage.setItem('kubefix-theme', isLight ? 'light' : 'dark');
    showToast(`Switched to ${isLight ? 'Light' : 'Dark'} mode`, 'info');
  });

  // Restore saved theme
  if (localStorage.getItem('kubefix-theme') === 'light') {
    document.body.classList.add('theme-light');
  }

  // =========================================================================
  // Help Modal & Keyboard Shortcuts
  // =========================================================================

  btnHelpModal.addEventListener('click', () => {
    helpModal.classList.add('open');
  });

  btnCloseModal.addEventListener('click', () => {
    helpModal.classList.remove('open');
  });

  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    // Escape closes modal
    if (e.key === 'Escape') {
      helpModal.classList.remove('open');
    }

    // Ctrl/Cmd + Enter: Validate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runValidation();
      showToast('Validated via shortcut', 'info');
    }

    // Ctrl/Cmd + Shift + K: Auto-Fix All
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      btnAutoFixAll.click();
    }

    // Ctrl/Cmd + Shift + F: Prettify
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      btnPrettify.click();
    }
  });

  // =========================================================================
  // Utilities & Toast Notifications
  // =========================================================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
