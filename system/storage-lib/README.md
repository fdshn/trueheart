# `@chantam/service.storage-lib`

S3-compatible direct upload contract. Core/mobile never receives file bytes through the API:

```text
JWT user → request presigned PUT → client uploads R2/MinIO → submit object key
→ HeadObject verifies ownership/type/size → profile attaches public URL
```

`IObjectStorage` is provider-neutral. `StorageModule` currently uses AWS S3 SDK, therefore works
with Cloudflare R2, AWS S3, Backblaze B2 S3 API, Wasabi and MinIO by configuration.

## Security policy

- Avatar key is owner-scoped: `users/<userId>/avatars/<uuid>.<ext>`.
- Post-media key is owner-and-post-scoped: `users/<userId>/posts/<postId>/media/<uuid>.<ext>`.
- Charity-campaign media key is owner-scoped: `users/<userId>/campaign-media/<uuid>.<ext>`. It takes
  images (JPEG, PNG, WebP, max 5 MB) and video (MP4, QuickTime, WebM, max 25 MB).
- Avatar: only JPEG, PNG and WebP, max 5 MB. Post media and charity-campaign media: those images
  (max 5 MB) plus MP4, QuickTime and WebM video (max 25 MB).
- `confirmAvatarUpload()` checks prefix plus `HeadObject` before an avatar URL is attached.
- `confirmPostMediaUpload()` checks user/post prefix plus `HeadObject` before media is attached.
- `createCampaignMediaUpload()` / `confirmCampaignMediaUpload()` do the same for campaign media;
  confirm returns `{ mediaType, publicUrl }`, with the type taken from the real object's content type.
- `HeadObject` 404 (object never uploaded) now throws `StorageValidationError` — a client input
  error. The HTTP status decides; the error name is only a fallback when there is no status, so a
  storage outage (e.g. 503) still surfaces as a system error.
- Credentials live only in environment variables; never commit R2 keys.

## Config

```env
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=chantam-media
STORAGE_ACCESS_KEY_ID=<R2 access key>
STORAGE_SECRET_ACCESS_KEY=<R2 secret>
STORAGE_PUBLIC_BASE_URL=https://media.example.com
```

Use distinct bucket/key/public domain per staging and production. Local development uses MinIO.
