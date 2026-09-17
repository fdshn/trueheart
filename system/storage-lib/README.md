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
- Only JPEG, PNG and WebP, max 5 MB.
- `confirmAvatarUpload()` checks prefix plus `HeadObject` before an avatar URL is attached.
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
