/**
 * lib/storage.js
 * Single source of truth for Warden's settings shape and persistence.
 * Loaded as a plain script (no ES modules) so it works identically in
 * the popup, the options page, and content scripts.
 */

/* ---------- shape ---------- */

// Category pill levels — 0: Show, 1: Light blur, 2: Strong blur.
// (No "Hide" — Warden only ever blurs, it never removes content.)
// These are fixed defaults, not user-editable in the UI (the old Categories
// panel was removed) — the master Sensitivity dial still adjusts them up
// or down. Change the values below directly if they need retuning.
globalThis.WardenBrowser = globalThis.browser || globalThis.chrome;
const CATEGORY_LEVEL = { SHOW: 0, LIGHT: 1, STRONG: 2 };

// Master sensitivity dial — index into this array is stored in settings.
const SENSITIVITY_LEVELS = [
  { name: 'Off',      desc: 'Nothing is blurred. You see everything as posted.' },
  { name: 'Mild',     desc: 'Only the most explicit content is blurred.' },
  { name: 'Standard', desc: 'Blurs explicit and graphic content automatically.' },
  { name: 'Strict',   desc: 'Blurs anything suggestive, graphic, or violent.' },
  { name: 'Maximum',  desc: 'Blurs everything flagged, even mild or borderline cases.' },
];

const DEFAULT_SETTINGS = {
  masterEnabled: true,
  sensitivityLevel: 2, // Standard
  blurStrength: 4,     // 1–5, visual blur px multiplier
  clickToReveal: true,

  categories: {
    nsfw: CATEGORY_LEVEL.LIGHT,
    comments: CATEGORY_LEVEL.LIGHT,
    semantic: CATEGORY_LEVEL.LIGHT,
  },

  platforms: {
    instagram: { enabled: true, filterText: true },
    reddit: { enabled: true, filterText: true },
  },

  wordFilters: ['self-harm', 'gore warning'],
  semanticPreference: '',

  stats: {
    reviewed: 0,
    blurred: 0,
    byCategory: { nsfw: 0, semantic: 0, comments: 0 },
    byPlatform: { instagram: 0, reddit: 0 },
  },
};

/* ---------- persistence ---------- */

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key in patch) {
    if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
      out[key] = deepMerge(base[key] || {}, patch[key]);
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

async function getSettings() {
  const stored = await WardenBrowser.storage.local.get('settings');
  return stored.settings ? deepMerge(DEFAULT_SETTINGS, stored.settings) : DEFAULT_SETTINGS;
}

async function saveSettings(settings) {
  await WardenBrowser.storage.local.set({ settings });
  return settings;
}

async function updateSettings(patch) {
  const current = await getSettings();
  const updated = deepMerge(current, patch);
  await saveSettings(updated);
  return updated;
}

async function incrementStats(category, platform) {
  const settings = await getSettings();
  settings.stats.reviewed += 1;
  if (category) {
    settings.stats.blurred += 1;
    settings.stats.byCategory[category] = (settings.stats.byCategory[category] || 0) + 1;
    if (platform) {
      settings.stats.byPlatform[platform] = (settings.stats.byPlatform[platform] || 0) + 1;
    }
  }
  await saveSettings(settings);
  return settings.stats;
}

async function resetStats() {
  return updateSettings({ stats: DEFAULT_SETTINGS.stats });
}

/* ---------- live updates across contexts ---------- */
// Popup / options / content scripts all read from storage directly, and can
// subscribe here to react when another surface changes a setting.
function onSettingsChanged(callback) {
  WardenBrowser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      callback(changes.settings.newValue, changes.settings.oldValue);
    }
  });
}
