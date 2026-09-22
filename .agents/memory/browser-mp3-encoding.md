---
name: Browser MP3 encoding
description: Client-side MP3 generation uses lamejs with a local ambient declaration.
---

Browser-side MP3 output is implemented with `lamejs`; the package registry used by this workspace does not provide a usable `@types/lamejs` package, so TypeScript needs a small local declaration.

**Why:** Keeping encoding in the browser preserves the app's existing privacy-first, no-upload processing flow.

**How to apply:** If the encoder dependency changes, preserve browser-only encoding and verify both the type declaration and the generated MP3 in a real browser.