/**
 * content-scripts/instagram.js
 * Instagram changes its DOM/class names often — these selectors target
 * stable structural tags rather than generated class names where possible.
 * Re-check them if Instagram ships a redesign and filtering stops working.
 */

(async function initInstagram() {
  console.info('[Warden] official extension 0.1.3 loaded on Instagram');
  const settings = await getSettings();
  if (!settings.platforms.instagram.enabled) return;

  WardenEngine.startWatching({
    mediaSelector: 'article img, article video',
    textSelector: settings.platforms.instagram.filterText
      ? 'article span[dir="auto"], [role="dialog"] span[dir="auto"], [role="dialog"] p' // captions + comment text
      : null,
    // Comments can be rendered in a dialog or in later list items. Captions
    // are kept on the post path so their semantic match blurs the post.
    commentSelector: 'article ul li:not(:first-child) span[dir="auto"]',
    commentAncestorSelector: 'article ul li:not(:first-child)',
    commentTargetSelector: 'article ul li:not(:first-child), [role="dialog"] li',
    isComment: (element) => {
      if (element.closest('[role="dialog"]')) return true;
      const listItem = element.closest('article ul li');
      if (!listItem) return false;
      return listItem !== listItem.parentElement?.firstElementChild;
    },
    postSelector: 'article',
    titleSelector: 'article h1,h2,h3,[role="heading"]',
    authorSelector: 'article a[href*="/"]',
  });
})();
