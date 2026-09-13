/**
 * content-scripts/reddit.js
 * Covers both old.reddit.com-style and modern shreddit DOM where possible.
 * Re-check selectors if Reddit changes its front-end.
 */

(async function initReddit() {
  console.info('[Warden] official extension 0.1.3 loaded on Reddit');
  const settings = await getSettings();
  if (!settings.platforms.reddit.enabled) return;

  WardenEngine.startWatching({
    mediaSelector: 'img, video',
    textSelector: settings.platforms.reddit.filterText
      ? 'h1, h3, p, div[slot="text-body"]' // post titles, self-text, comments
      : null,
    commentSelector: 'shreddit-comment p, shreddit-comment [slot="comment"], [data-testid="comment"] p, [data-testid="comment"]',
    commentAncestorSelector: 'shreddit-comment,[data-testid="comment"]',
    postSelector: 'shreddit-post,article,[data-testid="post-container"]',
    titleSelector: 'h1,h3,[slot="title"]',
    authorSelector: '[data-testid="post_author_link"],[slot="author-name"],a[href*="/user/"]',
  });
})();
