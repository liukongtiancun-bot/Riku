---
name: Browser MP3 encoding
description: Use the maintained lamejs fork in a worker for browser-side MP3 output.
---

Browser-side MP3 output uses `@breezystack/lamejs` inside a Web Worker. The original `lamejs@1.2.1` can fail in Vite browser bundles with `MPEGMode is not defined`; the maintained fork preserves the familiar encoder API and works with browser bundling. MP3 inputs and effects stay on-device. The user approved temporarily uploading video inputs for server-side audio extraction, then deleting the source video.

**Why:** The old encoder failed after successful video extraction, so the UI never produced an MP3. Moving encoding into a worker also keeps the interface responsive for long tracks.

**How to apply:** Use the maintained fork in the worker for browser-side MP3 output. Keep audio-only processing on-device. For videos, disclose temporary upload and deletion clearly, cap uploads at 500 MB, and clean up the source object after extraction.