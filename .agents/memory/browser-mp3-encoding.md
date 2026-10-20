---
name: Browser MP3 encoding
description: Client-side MP3 generation uses lamejs with a local ambient declaration.
---

Browser-side MP3 output uses `lamejs`; the package registry used by this workspace does not provide a usable `@types/lamejs` package, so TypeScript needs a small local declaration. MP3 inputs stay on-device. The user approved temporarily uploading video inputs for server-side audio extraction, then deleting the source video.

**Why:** Browser-side encoding preserves the no-upload flow for audio files, while server-side extraction makes large video imports practical without retaining the original video.

**How to apply:** Keep audio-only processing on-device. For videos, disclose temporary upload and deletion clearly, cap uploads at 500 MB, and clean up the source object after extraction.