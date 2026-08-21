# Image asset storage

## Goal

Keep real chat images visible to the UI and AI while preventing repeated Base64 strings from inflating IndexedDB and backups.

## Design

- Store image payloads once in an IndexedDB asset store, addressed by a stable content hash.
- Messages and both sticker libraries keep compact asset references instead of embedded Base64.
- New static images are resized to at most 512 px and encoded as WebP at quality 0.8. Animated GIFs keep their original bytes so animation is not lost.
- Rendering resolves references to temporary object URLs. API requests resolve them to the provider's existing inline-image representation only for the duration of the request.
- Replace the old image-optimization toggle with a one-click migration button covering chat histories and both sticker libraries. Migration writes assets before replacing references and reports counts and saved space.
- Existing Base64 and remote URL records continue to render. Old backups remain importable.
- Full backup serializes asset blobs into the existing gzip JSON format and restores them on import. Device Push state remains excluded as before.

## Verification

- Migrate duplicate static images and confirm one stored asset is referenced everywhere.
- Confirm GIF bytes are preserved.
- Confirm resolved images still reach the API payload.
- Round-trip a backup containing asset references and blobs.
- Verify the feature on `test` only.
