# Warden browser extension

This is the official Warden MV3 extension. It supports Instagram and Reddit content scripts and routes inference to the local FastAPI backend.

## Run

From the repository root:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Load this folder as an unpacked extension:

```text
C:\Users\Abhid\Desktop\Warden\extension\warden-extension\warden-extension
```

For Chrome, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. For Firefox, use `about:debugging#/runtime/this-firefox` and load `manifest.json`.

## What it does

- Calls `/toxicity` for captions, post text, and comments.
- Calls `/image/nsfw` for sexual NSFW scoring on images and videos that can be read from the page.
- Calls `/semantic/image` when the user saves an image preference.
- Shows or blurs content according to the sensitivity settings.
- Warns before a toxic compose submission without rewriting the user's text.
- Appends moderation actions to the backend transparency ledger.
- Records immutable show-anyway overrides.
- Fails open when the backend or a remote image is unavailable.

The backend must be running locally. The extension does not contain model weights. Gore and violence classification are not claimed because the current local image model does not measure those categories.

## Settings

Use the popup for the master switch and sensitivity level. Open full settings to:

- Enable or disable Instagram and Reddit filtering.
- Control whether captions/comments are scanned.
- Add exact word filters.
- Save an image semantic preference such as `images of war, violence, or shirtless men`.
- Review local activity counters.

## Normalized post contract

Site adapters select DOM elements, but the shared filter engine converts them into one structure before semantic inference:

```json
{
  "post_id": "sha256-of-platform-url-and-text",
  "platform": "reddit",
  "url": "https://www.reddit.com/...",
  "author": "account_name",
  "title": "Border conflict escalates",
  "text": "Several countries deployed troops near the border.",
  "alt_text": "Military vehicles near a border",
  "images": [{"url": "https://...", "alt_text": "..."}]
}
```

`/toxicity` receives the text, `/semantic` receives the normalized post fields, and image bytes are sent to `/image/nsfw` and `/semantic/image`. Content scripts inspect the DOM; the MV3 service worker handles storage, messaging, and session state.
