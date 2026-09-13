/**
 * content-scripts/filter-engine.js
 * Site-agnostic logic: decide whether a score should be blurred, and
 * apply/remove the blur overlay on the page. instagram.js and reddit.js
 * each just point this engine at the right CSS selectors for that site.
 */

const WardenEngine = (() => {
  const ledgerElements = new Map();
  const decisionCache = new Map();
  // Base sensitivity of each pill level, before the master dial adjusts it.
  // Lower threshold = triggers more easily.
  const BASE_THRESHOLD = { 1: 0.55, 2: 0.35 }; // 0 (Show) never triggers

  // The master "Sensitivity" dial nudges every category's threshold at once.
  // Index 0 (Off) is handled separately — filtering is skipped entirely.
  const SENSITIVITY_OFFSET = [null, 0.15, 0, -0.15, -0.3];

  function decideCategory(score, pillLevel, sensitivityLevel) {
    if (pillLevel === 0) return false; // "Show" — never blur this category
    const threshold = clamp(
      BASE_THRESHOLD[pillLevel] - SENSITIVITY_OFFSET[sensitivityLevel],
      0.05,
      0.95
    );
    return score >= threshold;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // scores: { nsfw, gore, violence, semantic } from the backend adapter.
  // returns: { shouldBlur, strength, matchedCategory } | { shouldBlur: false }
  function decideImage(scores, settings) {
    if (!settings.masterEnabled || settings.sensitivityLevel === 0) {
      return { shouldBlur: false };
    }
    const { categories, sensitivityLevel } = settings;
    const checks = [
      ['nsfw', scores.nsfw || 0, categories.nsfw],
    ];

    let matched = null;
    let strongest = 0;
    for (const [name, score, pillLevel] of checks) {
      if (decideCategory(score, pillLevel, sensitivityLevel)) {
        if (pillLevel >= strongest) {
          strongest = pillLevel;
          matched = name;
        }
      }
    }
    // Semantic image matching uses the calibrated 0.25 cutoff directly.
    // Passing it through the strong category threshold would incorrectly
    // require 0.35 at Standard sensitivity.
    if ((scores.semantic || 0) >= 0.25) {
      matched = 'semantic';
      strongest = 2;
    }
    if (!matched) return { shouldBlur: false };
    return { shouldBlur: true, strength: strongest === 2 ? 'strong' : 'light', matchedCategory: matched };
  }

  // For text: word-filter match (deterministic) OR model score, whichever fires first.
  function decideText(text, textScores, settings) {
    if (!settings.masterEnabled || settings.sensitivityLevel === 0) {
      return { shouldBlur: false };
    }
    const lower = text.toLowerCase();
    for (const phrase of settings.wordFilters || []) {
      if (phrase && lower.includes(phrase.toLowerCase())) {
        return { shouldBlur: true, strength: 'strong', matchedCategory: 'comments' };
      }
    }
    if (textScores.semantic?.action === 'hide' || textScores.semantic?.similarity >= 0.25) {
      return { shouldBlur: true, strength: 'strong', matchedCategory: 'semantic' };
    }
    const pillLevel = settings.categories.comments;
    const score = textScores.toxicity || 0;
    if (decideCategory(score, pillLevel, settings.sensitivityLevel)) {
      return { shouldBlur: true, strength: pillLevel === 2 ? 'strong' : 'light', matchedCategory: 'comments' };
    }
    return { shouldBlur: false };
  }

  /* ---------- DOM application ---------- */

  function blurPx(strength, blurStrengthSetting) {
    const base = strength === 'strong' ? 5.5 : 2.5;
    return Math.round(base * (blurStrengthSetting / 4) * 10) / 10;
  }

  // Wraps a media element with an overlay + reveal control. Idempotent.
  function applyImageBlur(mediaEl, decision, settings, eventId = null, scope = 'post') {
    const post = scope === 'comment'
      ? mediaEl
      : (mediaEl.closest('article, shreddit-post, [data-testid="post-container"]') || mediaEl);
    if (post.dataset.wardenRevealed === 'true') return;
    const alreadyBlurred = post.dataset.wardenBlurred === 'true';
    post.dataset.wardenBlurred = 'true';
    if (eventId) ledgerElements.set(eventId, post);

    const px = blurPx(decision.strength, settings.blurStrength);
    post.style.position = post.style.position || 'relative';
    if (post === mediaEl) post.style.setProperty('filter', `blur(${px}px)`, 'important');
    for (const child of post.querySelectorAll('*')) {
      if (!child.classList.contains('warden-post-overlay')) {
        const desiredFilter = `blur(${px}px)`;
        if (child.style.filter !== desiredFilter) child.style.setProperty('filter', desiredFilter, 'important');
        child.style.setProperty('transition', 'none', 'important');
      }
    }

    if (!settings.clickToReveal || (alreadyBlurred && post.querySelector('.warden-post-overlay'))) return;

    const badge = document.createElement('div');
    badge.className = 'warden-post-overlay';
    badge.textContent = `Blurred (${decision.matchedCategory}) — click to view`;
    Object.assign(badge.style, {
      position: 'absolute', inset: '0', display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '12px',
      color: '#fff', fontSize: '13px', fontFamily: 'sans-serif',
      background: 'rgba(20,24,22,0.25)', cursor: 'pointer', zIndex: '2',
    });
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Reveal is one-way for this render. A user who chose to view the
      // content should be able to interact with it without re-blurring.
      post.dataset.wardenRevealed = 'true';
      const cached = decisionCache.get(post.dataset.wardenCacheKey);
      if (cached) {
        cached.revealed = true;
        decisionCache.set(post.dataset.wardenCacheKey, cached);
        WardenClassifier.setDecisionCache(post.dataset.wardenCacheKey, cached);
      }
      if (post === mediaEl) post.style.removeProperty('filter');
      for (const child of post.querySelectorAll('*')) {
        if (!child.classList.contains('warden-post-overlay')) child.style.removeProperty('filter');
      }
      if (eventId) WardenClassifier.overrideLedgerEvent(eventId);
      badge.remove();
    });
    post.appendChild(badge);
  }

  function wrapElement(el) {
    const wrapper = document.createElement('div');
    wrapper.dataset.wardenWrap = 'true';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    return wrapper;
  }

  function applyTextBlur(textEl, decision, settings, eventId = null, scope = 'post') {
    return applyImageBlur(textEl, decision, settings, eventId, scope);
  }

  /* ---------- scanning ---------- */

  // config: { mediaSelector, textSelector }
  // Both selectors are CSS strings scoped to a single site. Either can be
  // omitted if that site script only wants to handle images or only text.
  function startWatching(config) {
    scan(config); // catch anything already on the page
    installComposeGuard();
    let scanTimer = null;
    const scheduleScan = () => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan(config);
      }, 120);
    };
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    // Some feed implementations recycle nodes without emitting useful child-list changes.
    setInterval(() => scan(config), 2500);
  }

  function extractPost(element, config) {
    const root = element.closest(config.postSelector || 'article') || element;
    const text = (root.innerText || '').trim().slice(0, 20000);
    const imageElements = [...root.querySelectorAll('img[src], video[src]')];
    const titleElement = root.querySelector(config.titleSelector || 'h1,h2,h3,[role="heading"]');
    const authorElement = root.querySelector(config.authorSelector || '[rel="author"],[data-testid*="author"],[class*="author"],[class*="user"]');
    const firstImage = imageElements[0];
    return {
      post_id: null,
      platform: currentPlatform(),
      url: location.href,
      author: authorElement?.innerText?.trim() || '',
      title: titleElement?.innerText?.trim() || '',
      text,
      alt_text: firstImage?.alt || '',
      images: imageElements.slice(0, 8).map((image) => ({
        url: image.currentSrc || image.src || '',
        alt_text: image.alt || '',
      })),
    };
  }

  function isCommentElement(element, config) {
    if (typeof config.isComment === 'function') return config.isComment(element);
    return Boolean(config.commentSelector && (
      element.matches(config.commentSelector) ||
      element.closest(config.commentAncestorSelector || 'shreddit-comment,[data-testid="comment"],article ul li')
    ));
  }

  function installComposeGuard() {
    if (document.documentElement.dataset.wardenComposeGuard) return;
    document.documentElement.dataset.wardenComposeGuard = 'true';
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.wardenAllowOnce === 'true') {
        delete form.dataset.wardenAllowOnce;
        return;
      }
      const editor = form.querySelector('textarea,[contenteditable="true"],input[type="text"]');
      const text = editor?.value || editor?.innerText || '';
      if (!text.trim()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (form.dataset.wardenChecking === 'true') return;
      form.dataset.wardenChecking = 'true';
      WardenClassifier.classifyText(text).then(async (result) => {
        if (result.toxicity < 0.40) {
          form.dataset.wardenAllowOnce = 'true';
          delete form.dataset.wardenChecking;
          form.requestSubmit();
          return;
        }
        const warning = document.createElement('div');
        warning.textContent = result.result?.message || 'This comment may be toxic. Please rethink it before posting.';
        Object.assign(warning.style, {
          background: '#ffe1e1', border: '1px solid #b00020', borderRadius: '5px',
          color: '#5c0010', font: '13px/1.4 system-ui, sans-serif', padding: '8px',
        });
        form.prepend(warning);
        form.dataset.wardenAllowOnce = 'true';
        await WardenClassifier.postLedgerEvent({
          post_id: await postHash(text),
          source: 'prepost',
          action: 'warned',
          scores: result.result?.categories || { toxic: result.toxicity },
          threshold_used: 0.40,
          trigger_detail: result.result?.trigger_detail || { type: 'span', value: text },
        });
        delete form.dataset.wardenChecking;
      }).catch(() => {
        form.dataset.wardenAllowOnce = 'true';
        delete form.dataset.wardenChecking;
        form.requestSubmit();
      });
    }, true);
  }

  async function scan(config) {
    const settings = await getSettings();
    if (!settings.masterEnabled) return;

    if (config.mediaSelector) {
      const media = document.querySelectorAll(config.mediaSelector);
      for (const el of media) {
        if (el.dataset.wardenSeen === 'true') {
          restoreCachedMedia(el, settings);
          continue;
        }
        el.dataset.wardenSeen = 'true';
        processMedia(el, settings);
      }
    }
    if (config.textSelector) {
      const texts = document.querySelectorAll(`${config.textSelector}:not([data-warden-seen])`);
      for (const el of texts) {
        el.dataset.wardenSeen = 'true';
        processText(el, settings, config);
      }
    }
  }

  async function restoreCachedMedia(el, settings) {
    const cacheKey = `image|${currentPlatform()}|${el.currentSrc || el.src || location.href}|${settings.semanticPreference || ''}|${settings.sensitivityLevel}`;
    let cached = decisionCache.get(cacheKey);
    if (!cached) {
      cached = await WardenClassifier.getDecisionCache(cacheKey);
      if (cached) decisionCache.set(cacheKey, cached);
    }
    const post = el.closest('article, shreddit-post, [data-testid="post-container"]') || el;
    post.dataset.wardenCacheKey = cacheKey;
    if (cached?.decision?.shouldBlur && !cached.revealed && post.dataset.wardenRevealed !== 'true') {
      applyImageBlur(el, cached.decision, settings, cached.eventId);
    }
  }

  function currentPlatform() {
    return location.hostname.includes('instagram') ? 'instagram' : 'reddit';
  }

  WardenBrowser.runtime.onMessage.addListener((message) => {
    if (message.type !== 'WARDEN_SHOW_ANYWAY') return;
    const element = ledgerElements.get(message.eventId);
    if (!element) return;
    element.style.filter = 'none';
    if (element.children?.length) {
      for (const child of element.children) {
        if (!child.classList.contains('warden-post-overlay')) child.style.filter = 'none';
      }
    }
    element.dataset.wardenRevealed = 'true';
  });

  async function processMedia(el, settings) {
    // Wait for the element to actually have pixels before classifying.
    if (el.tagName === 'IMG' && !el.complete) {
      await new Promise((resolve) => el.addEventListener('load', resolve, { once: true }));
    }
    const cacheKey = `image|${currentPlatform()}|${el.currentSrc || el.src || location.href}|${settings.semanticPreference || ''}|${settings.sensitivityLevel}`;
    const cached = decisionCache.get(cacheKey);
    if (cached) {
      const post = el.closest('article, shreddit-post, [data-testid="post-container"]') || el;
      post.dataset.wardenCacheKey = cacheKey;
      if (cached.decision.shouldBlur && !cached.revealed && post.dataset.wardenRevealed !== 'true') {
        applyImageBlur(el, cached.decision, settings, cached.eventId);
      }
      return;
    }
    const [imageResult, semanticResult] = await Promise.all([
      WardenClassifier.classifyImage(el),
      WardenClassifier.classifyImageSemantics(el, settings.semanticPreference),
    ]);
    const scores = { nsfw: imageResult.nsfw, semantic: semanticResult.semantic };
    const decision = decideImage(scores, settings);
    incrementStats(decision.shouldBlur ? decision.matchedCategory : null, currentPlatform());
    const postId = await postHash(el.currentSrc || el.src || location.href);
    let nsfwEventId = null;
    let semanticEventId = null;
    if (imageResult.result) {
      nsfwEventId = await WardenClassifier.postLedgerEvent({
        post_id: postId,
        source: 'nsfw_image',
        action: decision.shouldBlur && decision.matchedCategory === 'nsfw' ? 'blurred' : 'shown',
        scores: { nsfw_score: imageResult.nsfw },
        threshold_used: 0.50,
        trigger_detail: imageResult.result.trigger_detail,
      });
    }
    if (semanticResult.result) {
      semanticEventId = await WardenClassifier.postLedgerEvent({
        post_id: postId,
        source: 'semantic',
        action: decision.shouldBlur && decision.matchedCategory === 'semantic' ? 'hidden' : 'shown',
        scores: { similarity_score: semanticResult.semantic },
        threshold_used: 0.25,
        trigger_detail: semanticResult.result.trigger_detail,
      });
    }
    if (decision.shouldBlur) {
      applyImageBlur(el, decision, settings, semanticEventId || nsfwEventId);
      WardenBrowser.runtime.sendMessage({ type: 'CONTENT_BLURRED', category: decision.matchedCategory });
    }
    decisionCache.set(cacheKey, { decision, eventId: semanticEventId || nsfwEventId, revealed: false });
    WardenClassifier.setDecisionCache(cacheKey, { decision, eventId: semanticEventId || nsfwEventId, revealed: false });
    const post = el.closest('article, shreddit-post, [data-testid="post-container"]') || el;
    post.dataset.wardenCacheKey = cacheKey;
  }

  async function processText(el, settings, config) {
    const text = el.innerText || '';
    if (!text.trim()) return;
    const post = extractPost(el, config);
    const isComment = isCommentElement(el, config);
    // Comments need independent identities. Otherwise every comment in one
    // post shares the post cache key and one comment can decide all of them.
    const contentForId = isComment ? text : post.text;
    const postId = await postHash(JSON.stringify({ platform: post.platform, url: post.url, text: contentForId }));
    post.post_id = postId;
    const cacheKey = `text|${postId}|${settings.semanticPreference || ''}|${settings.sensitivityLevel}`;
    let cached = decisionCache.get(cacheKey);
    if (!cached) {
      cached = await WardenClassifier.getDecisionCache(cacheKey);
      if (cached) decisionCache.set(cacheKey, cached);
    }
    if (cached) {
      const post = el.closest(config.postSelector || 'article') || el;
      post.dataset.wardenCacheKey = cacheKey;
      if (cached.decision.shouldBlur && !cached.revealed && post.dataset.wardenRevealed !== 'true') {
        const isComment = isCommentElement(el, config);
        const blurTarget = el;
        if (blurTarget.dataset.wardenRevealed === 'true') return;
        blurTarget.dataset.wardenCacheKey = cacheKey;
        applyTextBlur(
          blurTarget,
          cached.decision,
          settings,
          cached.eventId,
          isComment ? 'comment' : 'post'
        );
      }
      return;
    }
    // For a comment, semantic matching should evaluate the comment itself,
    // not the entire post plus every sibling comment.
    const semanticPost = isComment ? { ...post, title: '', text, images: [] } : post;
    const textScores = await WardenClassifier.classifyText(text, semanticPost, settings.semanticPreference);
    const decision = decideText(text, textScores, settings);
    incrementStats(decision.shouldBlur ? 'comments' : null, currentPlatform());
    let toxicityEventId = null;
    if (textScores.result) {
      toxicityEventId = await WardenClassifier.postLedgerEvent({
        post_id: postId,
        source: 'toxicity',
        action: decision.shouldBlur ? 'blurred' : 'shown',
        scores: textScores.result.categories || { toxic: textScores.toxicity },
        threshold_used: 0.40,
        trigger_detail: textScores.result.trigger_detail || { type: 'span', value: text },
      });
    }
    if (textScores.semantic) {
      const semanticEventId = await WardenClassifier.postLedgerEvent({
        post_id: postId,
        source: 'semantic',
        action: textScores.semantic.action === 'hide' ? 'hidden' : 'shown',
        scores: { similarity_score: textScores.semantic.similarity },
        threshold_used: 0.25,
        trigger_detail: textScores.semantic.trigger_detail || { type: 'embedding_match', value: settings.semanticPreference },
      });
      if (decision.shouldBlur && decision.matchedCategory === 'semantic') toxicityEventId = semanticEventId;
    }
    if (decision.shouldBlur) {
      const blurTarget = el;
      blurTarget.dataset.wardenCacheKey = cacheKey;
      applyTextBlur(
        blurTarget,
        decision,
        settings,
        toxicityEventId,
        isComment ? 'comment' : 'post'
      );
    }
    if (decision.shouldBlur) {
      WardenBrowser.runtime.sendMessage({ type: 'CONTENT_BLURRED', category: 'comments' });
    }
    decisionCache.set(cacheKey, { decision, eventId: toxicityEventId, revealed: false });
    WardenClassifier.setDecisionCache(cacheKey, { decision, eventId: toxicityEventId, revealed: false });
    const postRoot = el.closest(config.postSelector || 'article') || el;
    postRoot.dataset.wardenCacheKey = cacheKey;
  }

  async function postHash(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  return { decideImage, decideText, applyImageBlur, applyTextBlur, startWatching };
})();
