# Warden Quick Context

## Resume here

Warden is a local-model wellbeing layer for browser feeds. The backend is
FastAPI and the maintained browser extension is the nested folder below:

```text
extension/warden-extension/warden-extension/
```

The root-level editor tabs named `extension/popup.js`, `extension/content.js`,
and similar files are stale references to the deleted prototype. Do not load
those files. The packaged copy is `extension/warden-extension.zip`.

## Run the backend

From the repository root:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend uses local model checkpoints. The main routes are:

- `GET /health`
- `POST /toxicity`
- `POST /prepost`
- `POST /semantic`
- `POST /image/nsfw`
- `POST /semantic/image`
- `POST /ledger/event`
- `GET /ledger/summary`
- `POST /ledger/override`

## Load the extension

In Chrome, open `chrome://extensions`, remove old Warden entries, enable
Developer mode, and choose **Load unpacked**. Select:

```text
C:\Users\Abhid\Desktop\Warden\extension\warden-extension\warden-extension
```

The current extension version is `0.1.3`. After refreshing Instagram or Reddit,
the page console should contain a message beginning with:

```text
[Warden] official extension 0.1.3 loaded
```

The backend must be running for model decisions. If it is unavailable, the
extension fails open and leaves content visible.

## Current behavior

- Toxic text is detected with the fine-tuned local Toxic-BERT model.
- NSFW images are detected with the local Falconsai classifier.
- Text semantic matching uses MiniLM and the configured preference.
- Image semantic matching uses local CLIP and the current `0.25` cutoff.
- Instagram and Reddit content is normalized into structured post data before
  semantic requests.
- Comments use separate cache identities and are blurred at comment scope,
  rather than blurring the entire post.
- Comment text matches never fall back to the enclosing article; if a
  site-specific comment container is not recognized, only the matched text
  element is blurred.
- Version `0.1.3` keeps post-level text/semantic decisions scoped to the whole
  post, while recognized comments remain comment-scoped. Image NSFW blur is
  also post-scoped.
- Clicking a blur reveals it permanently for that render, removes the overlay,
  and preserves the reveal in the session decision cache.
- Image NSFW and image semantic inference run in parallel.
- DOM rescans are debounced and the session cache repairs blur after feed
  virtualization/recycling.
- Pre-post toxicity only warns: `This comment may be toxic. Please rethink it
  before posting.` It does not rewrite or submit replacement text.
- The append-only moderation ledger records decisions and user overrides.

## Files to inspect first

- `app/main.py` — FastAPI routes.
- `app/inference.py` — local model loading and inference.
- `app/ledger.py` — append-only ledger.
- `extension/warden-extension/warden-extension/content-scripts/filter-engine.js` — scanning, caching, decisions, blur/reveal behavior.
- `extension/warden-extension/warden-extension/content-scripts/instagram.js` — Instagram selectors.
- `extension/warden-extension/warden-extension/content-scripts/reddit.js` — Reddit selectors.
- `extension/warden-extension/warden-extension/lib/classifier.js` — backend requests and cache messages.
- `extension/warden-extension/warden-extension/background/background.js` — session cache and badge.
- `HANDOFF.md` — full project history, decisions, limitations, and next steps.

## Known limitations

- Instagram and Reddit DOM selectors are heuristic and may need adjustment when
  either site changes its markup.
- Cross-origin images may fail canvas extraction; those cases fail open.
- The NSFW model should not be described as a gore or violence detector.
- The `0.25` semantic cutoff is a working threshold, not a measured final
  calibration.
- The official extension still needs live smoke testing for comments,
  virtualization, semantic triggers, and ledger overrides.
