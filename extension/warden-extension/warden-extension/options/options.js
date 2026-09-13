/**
 * options/options.js
 */

let settings;

async function init() {
  settings = await getSettings();
  renderSensitivity();
  renderPlatforms();
  renderTags();
  document.getElementById('semantic-preference').value = settings.semanticPreference || '';
  renderActivity();
  wireStaticControls();
  onSettingsChanged(async () => { settings = await getSettings(); renderActivity(); });
}

/* ---------- rail nav ---------- */
document.querySelectorAll('.rail-item').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.rail-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('panel-hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.remove('panel-hidden');
  };
});

/* ---------- sensitivity ---------- */
function renderSensitivity() {
  const lv = SENSITIVITY_LEVELS[settings.sensitivityLevel];
  document.getElementById('level-name-settings').textContent = lv.name;
  document.getElementById('level-desc-settings').textContent = lv.desc;
  drawGauge(document.getElementById('gauge-settings'), settings.sensitivityLevel);

  const wrap = document.getElementById('level-buttons');
  wrap.innerHTML = '';
  SENSITIVITY_LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'level-btn' + (i === settings.sensitivityLevel ? ' active' : '');
    b.textContent = l.name;
    b.onclick = async () => { settings = await updateSettings({ sensitivityLevel: i }); renderSensitivity(); };
    wrap.appendChild(b);
  });

  renderPreview();
}

// Live preview next to the Blur strength control — reflects both the
// sensitivity level and the blur-strength slider, same formula the real
// content script uses in filter-engine.js (blurPx()).
function renderPreview() {
  const photo = document.getElementById('demo-photo');
  const chip = document.getElementById('reveal-chip');
  if (settings.sensitivityLevel === 0) {
    photo.style.filter = 'none';
    chip.textContent = 'Not filtered';
    return;
  }
  const base = settings.sensitivityLevel * 3;
  const px = base * (settings.blurStrength / 4);
  photo.style.filter = `blur(${px}px)`;
  chip.textContent = 'Illustrative only';
}

document.getElementById('blur-strength').addEventListener('input', (e) => {
  settings.blurStrength = Number(e.target.value); // live feedback while dragging
  renderPreview();
});
document.getElementById('blur-strength').addEventListener('change', async (e) => {
  settings = await updateSettings({ blurStrength: Number(e.target.value) });
  renderPreview();
});

document.getElementById('toggle-reveal').onclick = async function () {
  settings = await updateSettings({ clickToReveal: !settings.clickToReveal });
  this.classList.toggle('on', settings.clickToReveal);
};

/* ---------- platforms ---------- */
function renderPlatforms() {
  const map = [
    ['ig-enabled', 'ig-text', 'instagram'],
    ['rd-enabled', 'rd-text', 'reddit'],
  ];
  map.forEach(([toggleId, checkId, key]) => {
    const toggle = document.getElementById(toggleId);
    const check = document.getElementById(checkId);
    toggle.classList.toggle('on', settings.platforms[key].enabled);
    check.checked = settings.platforms[key].filterText;
    toggle.onclick = async () => {
      settings = await updateSettings({ platforms: { [key]: { enabled: !settings.platforms[key].enabled } } });
      renderPlatforms();
    };
    check.onchange = async () => {
      settings = await updateSettings({ platforms: { [key]: { filterText: check.checked } } });
    };
  });
}

/* ---------- word filters ---------- */
function renderTags() {
  const wrap = document.getElementById('tag-wrap');
  const input = document.getElementById('tag-input');
  wrap.querySelectorAll('.tag-chip').forEach((c) => c.remove());
  settings.wordFilters.forEach((t, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escapeHtml(t)} <button aria-label="Remove ${escapeHtml(t)}">×</button>`;
    chip.querySelector('button').onclick = async () => {
      const next = settings.wordFilters.slice();
      next.splice(i, 1);
      settings = await updateSettings({ wordFilters: next });
      renderTags();
    };
    wrap.insertBefore(chip, input);
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
document.getElementById('tag-input').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    settings = await updateSettings({ wordFilters: [...settings.wordFilters, e.target.value.trim()] });
    e.target.value = '';
    renderTags();
  }
});
document.getElementById('semantic-preference').addEventListener('change', async (e) => {
  settings = await updateSettings({ semanticPreference: e.target.value.trim() });
});

/* ---------- activity ---------- */
function renderActivity() {
  const s = settings.stats;
  document.getElementById('stat-reviewed').textContent = s.reviewed;
  document.getElementById('stat-blurred').textContent = s.blurred;
  document.getElementById('stat-pct').textContent = s.reviewed ? `${((s.blurred / s.reviewed) * 100).toFixed(1)}%` : '0%';

  const bars = document.getElementById('bars');
  bars.innerHTML = '';
  const colors = { nsfw: 'var(--clay)', semantic: 'var(--amber)', comments: 'var(--moss)' };
  const labels = { nsfw: 'Nudity & sexual', semantic: 'Image topic match', comments: 'Toxic comments' };
  const max = Math.max(1, ...Object.values(s.byCategory));
  Object.keys(labels).forEach((key) => {
    const val = s.byCategory[key] || 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<div class="bl">${labels[key]}</div><div class="bar-track"><div class="bar-fill" style="width:${(val / max) * 100}%;background:${colors[key]};"></div></div><div class="bv mono">${val}</div>`;
    bars.appendChild(row);
  });
}

function wireStaticControls() {
  document.getElementById('reset-stats').onclick = async () => { settings = await resetStats(); renderActivity(); };
}

init();
