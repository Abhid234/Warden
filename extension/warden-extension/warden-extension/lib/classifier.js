/**
 * Backend adapter for Warden's local FastAPI models.
 * All failures fail open: content remains visible when the backend is unavailable.
 */

const WARDEN_API_BASE = 'https://warden-production-074e.up.railway.app';
let wardenSessionPromise;
const semanticCache = new Map();

function wardenApi(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  return fetch(WARDEN_API_BASE + path, { ...options, signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error('Warden API returned ' + response.status);
      return response.json();
    })
    .finally(() => clearTimeout(timer));
}

function getWardenSessionId() {
  if (!wardenSessionPromise) {
    wardenSessionPromise = new Promise((resolve) => {
      WardenBrowser.runtime.sendMessage({ type: 'WARDEN_SESSION_ID' }, (response) => {
        if (!WardenBrowser.runtime.lastError && response?.sessionId) {
          resolve(response.sessionId);
          return;
        }
        WardenBrowser.storage.local.get('wardenSessionId').then((stored) => {
          const id = stored.wardenSessionId || crypto.randomUUID();
          WardenBrowser.storage.local.set({ wardenSessionId: id });
          resolve(id);
        });
      });
    });
  }
  return wardenSessionPromise;
}

async function postLedgerEvent(event) {
  try {
    const sessionId = await getWardenSessionId();
    const result = await wardenApi('/ledger/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, session_id: sessionId }),
    });
    return result.event_id;
  } catch (_) {
    return null;
  }
}

async function overrideLedgerEvent(eventId) {
  try {
    const sessionId = await getWardenSessionId();
    await wardenApi('/ledger/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, session_id: sessionId }),
    });
  } catch (_) {}
}

async function getDecisionCache(key) {
  try {
    const response = await WardenBrowser.runtime.sendMessage({ type: 'WARDEN_CACHE_GET', key });
    return response?.value || null;
  } catch (_) {
    return null;
  }
}

async function setDecisionCache(key, value) {
  try {
    await WardenBrowser.runtime.sendMessage({ type: 'WARDEN_CACHE_SET', key, value });
  } catch (_) {}
}

async function classifyText(text, post = null, preference = '') {
  try {
    const result = await wardenApi('/toxicity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    let semantic = null;
    const semanticPost = post ? {
      title: post.title || '',
      caption: post.caption || post.text || '',
      alt_text: post.alt_text || '',
      account_name: post.account_name || post.author || '',
    } : null;
    if (preference?.trim() && semanticPost && (
      semanticPost.title.trim() || semanticPost.caption.trim() ||
      semanticPost.alt_text.trim() || semanticPost.account_name.trim()
    )) {
      const cacheKey = JSON.stringify([preference, semanticPost]);
      if (!semanticCache.has(cacheKey)) {
        semanticCache.set(cacheKey, wardenApi('/semantic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preference, post: semanticPost }),
        }));
      }
      semantic = await semanticCache.get(cacheKey);
      if (semanticCache.size > 500) semanticCache.delete(semanticCache.keys().next().value);
    }
    return {
      toxicity: result.toxicity_score || 0,
      violence: Math.max(result.categories?.threat || 0, 0),
      result,
      semantic,
    };
  } catch (err) {
    console.warn('[Warden] text classification failed; showing content:', err);
    return { toxicity: 0, violence: 0, result: null, semantic: null };
  }
}

async function classifyImage(mediaEl) {
  try {
    const blob = await elementToBlob(mediaEl);
    if (!blob) throw new Error('could not read image pixels');
    const form = new FormData();
    form.append('file', blob, 'feed-image.jpg');
    const result = await wardenApi('/image/nsfw', { method: 'POST', body: form });
    return { nsfw: result.nsfw_score || 0, result };
  } catch (err) {
    console.warn('[Warden] image classification failed; showing content:', err);
    return { nsfw: 0, result: null };
  }
}

async function classifyImageSemantics(mediaEl, preference) {
  if (!preference?.trim()) return { semantic: 0, result: null };
  try {
    const blob = await elementToBlob(mediaEl);
    if (!blob) throw new Error('could not read image pixels');
    const form = new FormData();
    form.append('preference', preference);
    form.append('file', blob, 'feed-image.jpg');
    const result = await wardenApi('/semantic/image', { method: 'POST', body: form });
    return { semantic: result.image_similarity || 0, result };
  } catch (err) {
    console.warn('[Warden] image semantic classification failed; showing content:', err);
    return { semantic: 0, result: null };
  }
}

async function elementToBlob(mediaEl, type = 'image/jpeg', quality = 0.85) {
  if (mediaEl.tagName === 'VIDEO' && mediaEl.readyState < 2) return null;
  const canvas = document.createElement('canvas');
  canvas.width = mediaEl.naturalWidth || mediaEl.videoWidth || mediaEl.width;
  canvas.height = mediaEl.naturalHeight || mediaEl.videoHeight || mediaEl.height;
  if (!canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(mediaEl, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

globalThis.WardenClassifier = {
  classifyText,
  classifyImage,
  classifyImageSemantics,
  postLedgerEvent,
  overrideLedgerEvent,
  getDecisionCache,
  setDecisionCache,
};
