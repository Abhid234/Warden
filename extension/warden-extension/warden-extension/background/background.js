/**
 * background/background.js
 */

importScripts('../lib/storage.js');

WardenBrowser.runtime.onInstalled.addListener(async () => {
  const existing = await WardenBrowser.storage.local.get('settings');
  if (!existing.settings) {
    await WardenBrowser.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

let badgeCount = 0;
let sessionIdPromise;
let decisionCachePromise;

WardenBrowser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'WARDEN_SESSION_ID') {
    if (!sessionIdPromise) {
      sessionIdPromise = WardenBrowser.storage.session.get('wardenSessionId').then((stored) => {
        const id = stored.wardenSessionId || crypto.randomUUID();
        return WardenBrowser.storage.session.set({ wardenSessionId: id }).then(() => id);
      });
    }
    sessionIdPromise.then((sessionId) => sendResponse({ sessionId }));
    return true;
  }
  if (message.type === 'WARDEN_CACHE_GET' || message.type === 'WARDEN_CACHE_SET') {
    if (!decisionCachePromise) {
      decisionCachePromise = WardenBrowser.storage.session.get('wardenDecisionCache').then((stored) => stored.wardenDecisionCache || {});
    }
    decisionCachePromise.then(async (cache) => {
      if (message.type === 'WARDEN_CACHE_SET') {
        cache[message.key] = message.value;
        await WardenBrowser.storage.session.set({ wardenDecisionCache: cache });
        sendResponse({ ok: true });
      } else {
        sendResponse({ value: cache[message.key] || null });
      }
    });
    return true;
  }
  if (message.type === 'CONTENT_BLURRED') {
    badgeCount += 1;
    WardenBrowser.action.setBadgeText({ text: String(badgeCount) });
    WardenBrowser.action.setBadgeBackgroundColor({ color: '#4F6F52' });
  }
  return false;
});

// Badge resets each browser session — stats persisted in storage.local
// (see lib/storage.js) are the durable record shown in the options page.
