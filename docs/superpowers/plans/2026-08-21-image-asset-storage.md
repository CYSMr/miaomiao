# Image Asset Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move chat and sticker images out of repeated Base64 strings into a deduplicated IndexedDB Blob store without changing rendering, AI vision, or backup compatibility.

**Architecture:** Add an `imageAssets` Dexie table keyed by SHA-256 and keep `{assetId, mimeType}` references in messages and sticker records. Resolve references to object URLs for rendering and temporary data URLs for API payloads and gzip backup export.

**Tech Stack:** Browser IndexedDB/Dexie 3, Web Crypto, Canvas/WebP, existing streaming JSON gzip backup.

## Global Constraints

- Static images: maximum 512 px, WebP quality 0.8.
- Animated GIF bytes are preserved.
- Old Base64 records and old backups remain readable.
- Push state remains excluded from backups.
- Push implementation only to `test`.

---

### Task 1: Asset store and codecs

**Files:**
- Modify: `scripts.js:381-590`
- Test: `tests/image-assets.cjs`

**Interfaces:**
- Produces: `storeImageAsset(source): Promise<{assetId,mimeType,size}>`, `resolveImageSource(value, mode): Promise<string>`, `migrateImageValue(value): Promise<{value,originalSize,storedSize,migrated}>`.

- [ ] Add a failing browser test that stores the same data URL twice and expects one `imageAssets` row and the same `assetId`.
- [ ] Upgrade Dexie to version 22 with `imageAssets: '&id, mimeType, size, createdAt'`.
- [ ] Implement SHA-256 hashing, data URL/Blob conversion, static WebP compression, GIF preservation, asset insertion, and resolution helpers.
- [ ] Run `NODE_PATH=/root/.ductor/workspace/.playwright/node_modules node tests/image-assets.cjs` and require PASS.

### Task 2: Rendering, new uploads, and AI requests

**Files:**
- Modify: `scripts.js:130-220,6800-6970,13570-14170,16440-16490`
- Test: `tests/image-assets.cjs`

**Interfaces:**
- Consumes: Task 1 asset helpers.
- Produces: render-safe temporary object URLs and API-safe temporary data URLs.

- [ ] Add failing assertions that an asset reference resolves to a usable image URL and to an `image_url` data URL.
- [ ] Make new sticker uploads call `storeImageAsset`; save the reference and name, not Base64.
- [ ] Resolve sticker and `just_image` sources before assigning `img.src`; retain Base64/HTTP fallback.
- [ ] Resolve asset references in outgoing multimodal messages before `callApi` converts OpenAI or Gemini payloads.
- [ ] Run the focused asset test and require PASS.

### Task 3: One-click migration UI

**Files:**
- Modify: `index.html:771-800`
- Modify: `scripts.js:14188-14320,16190-16225,19935-19945`
- Test: `tests/image-assets.cjs`

**Interfaces:**
- Produces: `migrateAllStoredImages(onProgress): Promise<{processed,deduplicated,originalSize,storedSize,failed}>`.

- [ ] Add a failing test with duplicate Base64 images in chat history and both sticker libraries.
- [ ] Replace the old optimization toggle and separate sticker compressor with one `压缩并整理图片` button.
- [ ] Traverse all nested chat message image fields plus both sticker arrays; store assets first, then persist compact references.
- [ ] Show progress on the button and a completion summary; preserve original values for individual failures.
- [ ] Remove export-time description stripping and the obsolete optimization state behavior.
- [ ] Run the focused test and require PASS.

### Task 4: Complete backup round trip

**Files:**
- Modify: `scripts.js:20580-20650,21060-21110`
- Modify: `tests/full-backup.cjs`

**Interfaces:**
- Consumes: `db.imageAssets` rows.
- Produces: backup entry `__imageAssets` as `{id,mimeType,size,createdAt,dataUrl}[]`.

- [ ] Add a failing backup assertion that an asset Blob is exported, deleted, restored, and resolves to identical bytes.
- [ ] Yield image assets from `createFullBackupEntries`, converting each Blob only during export.
- [ ] Restore `__imageAssets` before kvStore references and keep current device Push values untouched.
- [ ] Run `tests/image-assets.cjs`, `tests/full-backup.cjs`, and `tests/export-and-voice-cache.cjs`; require PASS.
- [ ] Run `git diff --check`, commit the implementation, and push `HEAD:test` only.
