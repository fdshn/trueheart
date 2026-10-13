# Media chiến dịch từ thiện: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho chiến dịch từ thiện có 1–5 ảnh hoặc video upload lên R2 theo luồng "upload trước, tạo sau", ảnh bìa là một trong số đó, và người tạo được thay cả bộ media khi hồ sơ đang chờ duyệt.

**Architecture:**
- Có bảng mới `campaign_media`, được ghi trong cùng transaction với `campaigns`.
- `storage-lib` có thêm cặp `createCampaignMediaUpload` / `confirmCampaignMediaUpload`.
- Luật media (số lượng, trùng key, phải có ảnh, bìa là ảnh) là hàm thuần trong `core-lib`, dùng chung cho đường tạo và đường thay.
- Repository trả `media[]` qua một subquery `json_agg` trong danh sách cột chung `Columns`, nên mọi đường đọc chiến dịch tự có media mà không gây N+1.

**Tech Stack:** NestJS 11 + Fastify, TypeORM 0.3 (raw SQL qua `manager.query`), PostgreSQL 16 + PostGIS, AWS SDK v3 S3 (R2), Jest, class-validator.

**Spec:** `docs/superpowers/specs/2026-10-12-charity-campaign-media-design.md`

## Global Constraints

- 1–5 media mỗi chiến dịch (`MaxCharityMediaPerCampaign = 5`), ít nhất 1 `IMAGE`; ảnh bìa bắt buộc là `IMAGE` và phải là một key trong `media`.
- Ảnh: `image/jpeg`, `image/png`, `image/webp`, tối đa 5 MB. Video: `video/mp4`, `video/quicktime`, `video/webm`, tối đa 25 MB. Đúng như media bài đăng.
- Key upload có dạng `users/<userId>/campaign-media/<uuid>.<ext>`.
- Chỉ người tạo (`created_by`) được thay media, và chỉ khi `approval_status = 'PENDING_APPROVAL'`.
- Body tạo **bỏ** `bannerUrl`; `banner_url` do server ghi bằng `publicUrl` của ảnh bìa.
- Mã lỗi: `CHARITY_MEDIA_INVALID = 0x13_1d` (400), `CHARITY_MEDIA_NOT_EDITABLE = 0x13_1e` (409). Người không phải người tạo nhận `CHARITY_NOT_ORGANIZER`, lỗi đã có sẵn.
- `campaign_media.storage_key` **phải** có trong `LiveKeySources` của job dọn rác.
- Không `throw new Error` trong luồng nghiệp vụ. Token DI là Symbol. Body bọc dưới khoá resource. Access modifier ghi rõ (xem `INVARIANTS.md`).
- Sau khi sửa `core-lib` hoặc `storage-lib` phải `npm run build` lại lib đó. Output build của `storage-lib` **được git track**, nên commit cả file build; output của `core-lib` thì không.
- Trước khi kết thúc: `npm run lint:check` và `npm run format:check` ở thư mục gốc. Chạy bản `:check`, không chạy bản tự sửa.

## Review Focus

1. **Client gửi key chưa từng upload** (PUT lỗi hoặc URL hết hạn): phải trả 400 nói rõ, không được 500. Test nằm ở Task 2 (`verifyObject` gặp 404) và Task 5 (lỗi storage chuyển thành 400).
2. **Gửi một key đang thuộc chiến dịch khác:** phải trả `CHARITY_MEDIA_INVALID`, không được 500 vì `UQ_campaign_media_storage_key`. Test nằm ở Task 7 (DB thật).
3. **Admin duyệt chen giữa lúc người tạo đang thay media:** lượt thay phải thua với `CHARITY_MEDIA_NOT_EDITABLE`, không được ghi media vào hồ sơ đã duyệt. Repository khoá `FOR UPDATE` và kiểm lại trạng thái; test ở Task 7.
4. **Gửi lại đúng các key đang có, chỉ đổi thứ tự hoặc ảnh bìa:** phải thành công. DELETE chạy trước INSERT trong cùng transaction nên `UNIQUE(storage_key)` không chặn; test ở Task 7.
5. **Chiến dịch cũ không có dòng media nào:** mọi đường đọc trả `media: []` và giữ nguyên `bannerUrl` cũ. Test ở Task 7.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `suites/chantam.vn/chantam/core-lib/src/consts/error-codes.ts` | Thêm 2 mã lỗi |
| `suites/chantam.vn/chantam/core-lib/src/consts/error-catalog.ts` | Thêm 2 mục lỗi |
| `suites/chantam.vn/chantam/core-lib/src/models/charity-campaign.ts` | Thêm luật media thuần; bỏ `bannerUrl` khỏi `charityCampaignGaps` |
| `suites/chantam.vn/chantam/core-lib/src/models/charity-campaign.spec.ts` | Test luật media |
| `system/storage-lib/src/contracts/object-storage.ts` | Thêm `ICampaignMediaConfirmation` và 2 method |
| `system/storage-lib/src/internal/storage.service.ts` | Hiện thực 2 method; HeadObject 404 thành `StorageValidationError` |
| `system/storage-lib/src/internal/storage.service.spec.ts` | Test |
| `suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations/1800500000000-CreateCampaignMedia.ts` | Bảng mới và nới CHECK banner |
| `.../migrations/index.ts` | Export migration |
| `suites/chantam.vn/chantam/core/src/application/implementations/media/sweep-orphan-media.use-case.ts` (+ spec) | Thêm nguồn key mới |
| `suites/chantam.vn/chantam/core/src/domain/ports/repository/charity-campaign.repository.ts` | Kiểu media; `create` nhận media; thêm `replaceMedia` |
| `suites/chantam.vn/chantam/core/src/infrastructure/repository/charity-campaign.repository.ts` | SQL |
| `suites/chantam.vn/chantam/core/src/domain/exceptions/charity-campaign.exception.ts` | 2 exception |
| `suites/chantam.vn/chantam/core/src/application/contracts/charity-campaign/charity-campaign.contract.ts` | Đổi input tạo; 2 contract mới |
| `suites/chantam.vn/chantam/core/src/application/implementations/charity-campaign/charity-campaign.use-cases.ts` (+ spec) | `confirmCharityMedia`, sửa use case tạo, 2 use case mới |
| `.../charity-campaign/charity-campaign.module.ts` | Đăng ký use case mới |
| `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/charity-campaign/charity-campaign.dto.ts` | DTO |
| `suites/chantam.vn/chantam/core/src/infrastructure/controller/api/charity-campaign/charity-campaign.controller.ts` | 2 endpoint |
| `suites/chantam.vn/chantam/core/test/fake-campaign-media-storage.ts` | Storage giả cho các script DB |
| `suites/chantam.vn/chantam/core/test/charity-campaign.check.ts`, `test/charity-contribution.check.ts` | Đổi input; thêm nhóm kiểm media |
| `suites/chantam.vn/chantam/core/src/infrastructure/persistence/seeds/full/charity.ts` | Seed `campaign_media` |
| `docs/API.md`, `suites/chantam.vn/chantam/core/README.md`, `system/storage-lib/README.md`, `docs/API-ERRORS.md` | Tài liệu |

Các đường dẫn bên dưới viết tắt `core/` = `suites/chantam.vn/chantam/core/`, `core-lib/` = `suites/chantam.vn/chantam/core-lib/`.

---

### Task 1: Luật media thuần và mã lỗi trong `core-lib`

**Files:**
- Modify: `core-lib/src/consts/error-codes.ts` (sau `CHARITY_BENEFICIARY_CONSENT_REQUIRED = 0x13_1c,`)
- Modify: `core-lib/src/consts/error-catalog.ts` (sau mục `CHARITY_BENEFICIARY_CONSENT_REQUIRED`)
- Modify: `core-lib/src/models/charity-campaign.ts:228-290`
- Test: `core-lib/src/models/charity-campaign.spec.ts`

**Interfaces:**
- Produces: `CharityMediaTypes`, `type CharityMediaType = 'IMAGE' | 'VIDEO'`, `MaxCharityMediaPerCampaign = 5`, `charityMediaShapeGaps({ keys, coverKey }): string[]`, `charityMediaTypeGaps({ items: { key, mediaType }[], coverKey }): string[]`, `CoreErrors.CHARITY_MEDIA_INVALID` (message `(detail?: string)`), `CoreErrors.CHARITY_MEDIA_NOT_EDITABLE`. `charityCampaignGaps` không còn tham số `bannerUrl`.

- [ ] **Step 1: Viết test lỗi trước**

Trong `core-lib/src/models/charity-campaign.spec.ts`:
- Thêm vào import: `charityMediaShapeGaps`, `charityMediaTypeGaps`, `MaxCharityMediaPerCampaign`.
- Xoá `bannerUrl` khỏi `validInput()`.
- Xoá test `charityCampaignGaps(validInput({ bannerUrl: 'http://x.vn/a.jpg' }))` (quanh dòng 110), vì luật đó không còn.

Thêm vào cuối file:

```ts
describe('charityMediaShapeGaps', () => {
  const key = (n: number) => `users/u1/campaign-media/${n}.webp`;

  it('một key làm bìa là hợp lệ', () => {
    expect(charityMediaShapeGaps({ keys: [key(1)], coverKey: key(1) })).toEqual([]);
  });

  it('đủ 5 key là hợp lệ, 6 thì không', () => {
    const five = [1, 2, 3, 4, 5].map(key);
    expect(charityMediaShapeGaps({ keys: five, coverKey: key(3) })).toEqual([]);
    expect(
      charityMediaShapeGaps({ keys: [...five, key(6)], coverKey: key(1) })[0],
    ).toContain(`${MaxCharityMediaPerCampaign}`);
  });

  it('rỗng thì báo thiếu', () => {
    expect(charityMediaShapeGaps({ keys: [], coverKey: key(1) })).toEqual(
      expect.arrayContaining([expect.stringContaining('từ 1 tới')]),
    );
  });

  it('key trùng thì báo trùng', () => {
    expect(
      charityMediaShapeGaps({ keys: [key(1), key(1)], coverKey: key(1) }),
    ).toEqual([expect.stringContaining('trùng')]);
  });

  it('coverKey không nằm trong media thì báo', () => {
    expect(
      charityMediaShapeGaps({ keys: [key(1)], coverKey: key(2) }),
    ).toEqual([expect.stringContaining('coverKey')]);
  });
});

describe('charityMediaTypeGaps', () => {
  it('ảnh bìa + video là hợp lệ', () => {
    expect(
      charityMediaTypeGaps({
        items: [
          { key: 'a', mediaType: 'IMAGE' },
          { key: 'b', mediaType: 'VIDEO' },
        ],
        coverKey: 'a',
      }),
    ).toEqual([]);
  });

  it('toàn video thì báo thiếu ảnh và báo bìa là video', () => {
    const gaps = charityMediaTypeGaps({
      items: [{ key: 'v', mediaType: 'VIDEO' }],
      coverKey: 'v',
    });
    expect(gaps).toEqual([
      expect.stringContaining('ít nhất một ảnh'),
      expect.stringContaining('ảnh bìa'),
    ]);
  });

  it('có ảnh nhưng bìa là video thì báo', () => {
    expect(
      charityMediaTypeGaps({
        items: [
          { key: 'a', mediaType: 'IMAGE' },
          { key: 'v', mediaType: 'VIDEO' },
        ],
        coverKey: 'v',
      }),
    ).toEqual([expect.stringContaining('ảnh bìa')]);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó lỗi**

Run: `cd suites/chantam.vn/chantam/core-lib && npx jest src/models/charity-campaign.spec.ts`
Expected: FAIL, vì `charityMediaShapeGaps is not a function` và lỗi kiểu ở `validInput` khi thiếu `bannerUrl`.

- [ ] **Step 3: Hiện thực**

Trong `core-lib/src/models/charity-campaign.ts`, xoá `readonly bannerUrl: unknown;` khỏi kiểu input của `charityCampaignGaps` và xoá hai dòng:

```ts
  if (!isCharityUrl(input.bannerUrl))
    gaps.push('bannerUrl phải là một đường dẫn https');
```

Giữ nguyên `isCharityUrl`, vì nó là export công khai và có test riêng. Thêm ngay sau `charityCampaignGaps`:

```ts
export const CharityMediaTypes = ['IMAGE', 'VIDEO'] as const;

export type CharityMediaType = (typeof CharityMediaTypes)[number];

/** Trần số ảnh/video của một hoạt động. Ảnh bìa nằm TRONG số này, không tính riêng. */
export const MaxCharityMediaPerCampaign = 5;

/**
 * Phép kiểm HÌNH DẠNG bộ media, chạy TRƯỚC khi hỏi kho lưu trữ.
 *
 * Tách khỏi phép kiểm loại vì hai thứ cần hai lượt khác nhau: hình dạng chỉ cần mảng
 * key client gửi, còn loại (ảnh hay video) chỉ biết sau HeadObject. Kiểm hình dạng
 * trước để một mảng 50 key rác không thành 50 lượt gọi R2.
 */
export function charityMediaShapeGaps(input: {
  readonly keys: readonly string[];
  readonly coverKey: string;
}): string[] {
  const gaps: string[] = [];

  if (input.keys.length < 1 || input.keys.length > MaxCharityMediaPerCampaign)
    gaps.push(
      `media phải có từ 1 tới ${MaxCharityMediaPerCampaign} phần tử`,
    );
  if (new Set(input.keys).size !== input.keys.length)
    gaps.push('media không được có key trùng nhau');
  if (!input.keys.includes(input.coverKey))
    gaps.push('coverKey phải là một key trong media');

  return gaps;
}

/**
 * Phép kiểm LOẠI, chạy sau khi kho lưu trữ đã xác nhận từng key.
 *
 * Bìa phải là ảnh vì `banner_url` được hiện trong thẻ danh sách và Map Discovery —
 * những chỗ chỉ dựng `<img>`, không dựng trình phát video.
 */
export function charityMediaTypeGaps(input: {
  readonly items: readonly {
    readonly key: string;
    readonly mediaType: CharityMediaType;
  }[];
  readonly coverKey: string;
}): string[] {
  const gaps: string[] = [];

  if (!input.items.some((item) => item.mediaType === 'IMAGE'))
    gaps.push('media phải có ít nhất một ảnh');
  const cover = input.items.find((item) => item.key === input.coverKey);
  if (cover && cover.mediaType !== 'IMAGE')
    gaps.push('ảnh bìa phải là ảnh, không phải video');

  return gaps;
}
```

Trong `core-lib/src/consts/error-codes.ts`, thêm sau `CHARITY_BENEFICIARY_CONSENT_REQUIRED = 0x13_1c,`:

```ts
  /** Bộ media gửi lên sai: số lượng, trùng key, không có ảnh, bìa sai, hoặc key đã thuộc hoạt động khác. */
  CHARITY_MEDIA_INVALID = 0x13_1d,
  /** Chỉ sửa media khi hồ sơ còn chờ duyệt. */
  CHARITY_MEDIA_NOT_EDITABLE = 0x13_1e,
```

Trong `core-lib/src/consts/error-catalog.ts`, thêm sau mục `CHARITY_BENEFICIARY_CONSENT_REQUIRED`:

```ts
  CHARITY_MEDIA_INVALID: {
    code: ErrorCodes.CHARITY_MEDIA_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    // Trả nguyên danh sách lỗi: người tạo sửa được cả bộ trong một lượt thay vì
    // gửi lại năm lần để lần lượt biết từng chỗ sai.
    message: (detail?: string) => detail ?? 'Bộ ảnh/video gửi lên không hợp lệ',
  },

  CHARITY_MEDIA_NOT_EDITABLE: {
    code: ErrorCodes.CHARITY_MEDIA_NOT_EDITABLE,
    httpStatus: HttpStatus.CONFLICT,
    // Sau khi duyệt thì khoá: Admin duyệt bộ ảnh nào thì công khai đúng bộ ảnh đó.
    message: () => 'Chỉ sửa ảnh/video được khi hồ sơ còn đang chờ duyệt',
  },
```

- [ ] **Step 4: Chạy test để thấy nó qua**

Run: `cd suites/chantam.vn/chantam/core-lib && npx jest src/models/charity-campaign.spec.ts`
Expected: PASS.

- [ ] **Step 5: Build `core-lib`**

Run: `cd suites/chantam.vn/chantam/core-lib && npm run build`
Expected: exit 0. `defineErrorCatalog` chặn ngay lúc nạp nếu mã trùng, nên build qua và test qua nghĩa là mã không trùng.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core-lib/src
git commit -m "feat(f65b): luật media chiến dịch và hai mã lỗi CHARITY_MEDIA_*"
```

> Từ đây tới hết Task 5, `core` sẽ **không type-check được** vì `charityCampaignGaps` đã bỏ `bannerUrl`. Đó là dự kiến. Task 5 sửa `prepareWrite`. Đừng chạy `npm run build` của `core` trước Task 5; chỉ chạy jest theo từng file.

---

### Task 2: `storage-lib`: upload và xác nhận media chiến dịch, HeadObject 404 thành 400

**Files:**
- Modify: `system/storage-lib/src/contracts/object-storage.ts`
- Modify: `system/storage-lib/src/internal/storage.service.ts`
- Test: `system/storage-lib/src/internal/storage.service.spec.ts`

**Interfaces:**
- Produces:
  - `interface ICampaignMediaConfirmation { mediaType: 'IMAGE' | 'VIDEO'; publicUrl: string }`
  - `IObjectStorage.createCampaignMediaUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>`
  - `IObjectStorage.confirmCampaignMediaUpload(userId: string, key: string): Promise<ICampaignMediaConfirmation>`
  - `assertCampaignMediaUploadPolicy(request: IStorageUploadRequest): void` (export từ `internal`)

- [ ] **Step 1: Viết test lỗi trước**

Trong `storage.service.spec.ts`, thêm `assertCampaignMediaUploadPolicy` vào import. Thêm vào cuối file:

```ts
describe('assertCampaignMediaUploadPolicy', () => {
  const base = { userId: '11111111-1111-1111-1111-111111111111' };

  it('nhận ảnh 5MB và video 25MB', () => {
    expect(() =>
      assertCampaignMediaUploadPolicy({ ...base, contentType: 'image/png', contentLength: 5 * 1024 * 1024 }),
    ).not.toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({ ...base, contentType: 'video/webm', contentLength: 25 * 1024 * 1024 }),
    ).not.toThrow();
  });

  it('từ chối PDF, ảnh > 5MB, video > 25MB', () => {
    expect(() =>
      assertCampaignMediaUploadPolicy({ ...base, contentType: 'application/pdf', contentLength: 10 }),
    ).toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({ ...base, contentType: 'image/jpeg', contentLength: 5 * 1024 * 1024 + 1 }),
    ).toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({ ...base, contentType: 'video/mp4', contentLength: 25 * 1024 * 1024 + 1 }),
    ).toThrow();
  });
});

describe('StorageService.createCampaignMediaUpload', () => {
  it('sinh key dưới users/<userId>/campaign-media/ và ký ContentLength', async () => {
    let capturedCommand: any = null;
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as { getSignedUrl: jest.Mock };
    getSignedUrl.mockImplementation((_client: unknown, cmd: any) => {
      capturedCommand = cmd;
      return Promise.resolve('https://mock-storage.local/upload-url');
    });
    const storage = new StorageService(
      {} as never,
      { bucket: 'chantam-test', publicBaseUrl: 'https://cdn.chantam.test/', uploadExpiresInSeconds: 300 } as never,
    );

    const result = await storage.createCampaignMediaUpload({
      userId: '11111111-1111-1111-1111-111111111111',
      contentType: 'video/quicktime',
      contentLength: 1000,
    });

    expect(result.key).toMatch(
      /^users\/11111111-1111-1111-1111-111111111111\/campaign-media\/[0-9a-f-]{36}\.mov$/,
    );
    expect(result.publicUrl).toBe(`https://cdn.chantam.test/${result.key}`);
    expect(capturedCommand?.input?.ContentLength).toBe(1000);
  });
});

describe('StorageService.confirmCampaignMediaUpload', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const client = { send: jest.fn() };
  const storage = new StorageService(
    client as never,
    { bucket: 'chantam-test', publicBaseUrl: 'https://cdn.chantam.test' } as never,
  );

  beforeEach(() => client.send.mockReset());

  it('từ chối key của người khác TRƯỚC HeadObject', async () => {
    await expect(
      storage.confirmCampaignMediaUpload(userId, 'users/someone-else/campaign-media/a.webp'),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('từ chối key của chính mình nhưng sai namespace (media bài đăng)', async () => {
    await expect(
      storage.confirmCampaignMediaUpload(userId, `users/${userId}/posts/p1/media/a.webp`),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('ảnh hợp lệ trả IMAGE kèm publicUrl', async () => {
    client.send.mockResolvedValueOnce({ ContentType: 'image/webp', ContentLength: 1000 });
    const key = `users/${userId}/campaign-media/a.webp`;

    await expect(storage.confirmCampaignMediaUpload(userId, key)).resolves.toEqual({
      mediaType: 'IMAGE',
      publicUrl: `https://cdn.chantam.test/${key}`,
    });
  });

  it('video hợp lệ trả VIDEO', async () => {
    client.send.mockResolvedValueOnce({ ContentType: 'video/mp4', ContentLength: 20 * 1024 * 1024 });

    await expect(
      storage.confirmCampaignMediaUpload(userId, `users/${userId}/campaign-media/a.mp4`),
    ).resolves.toMatchObject({ mediaType: 'VIDEO' });
  });

  it('object không tồn tại thì StorageValidationError, không phải lỗi SDK thô', async () => {
    client.send.mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }),
    );

    await expect(
      storage.confirmCampaignMediaUpload(userId, `users/${userId}/campaign-media/missing.webp`),
    ).rejects.toMatchObject({ name: 'StorageValidationError' });
  });

  it('lỗi mạng khác vẫn ném nguyên dạng', async () => {
    client.send.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { name: 'TimeoutError', $metadata: { httpStatusCode: 503 } }),
    );

    await expect(
      storage.confirmCampaignMediaUpload(userId, `users/${userId}/campaign-media/a.webp`),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó lỗi**

Run: `cd system/storage-lib && npx jest src/internal/storage.service.spec.ts`
Expected: FAIL, vì `assertCampaignMediaUploadPolicy` chưa có và `storage.createCampaignMediaUpload is not a function`.

- [ ] **Step 3: Hiện thực contract**

Trong `src/contracts/object-storage.ts`, thêm sau `IChatMediaUploadRequest`:

```ts
/** Kết quả xác nhận media chiến dịch: loại suy từ content type THẬT của object. */
export interface ICampaignMediaConfirmation {
  mediaType: 'IMAGE' | 'VIDEO';
  publicUrl: string;
}
```

Thêm vào `IObjectStorage`, ngay trước `deleteObjects`:

```ts
  /**
   * Ảnh/video của một hoạt động từ thiện.
   *
   * Khoá theo NGƯỜI chứ không theo hoạt động: hoạt động chưa tồn tại lúc xin đường
   * tải — nó được tạo cùng lúc với media, giống bình luận và chat.
   */
  createCampaignMediaUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  /** HeadObject kiểm chủ sở hữu, loại và dung lượng; trả loại để bên gọi kiểm ảnh bìa. */
  confirmCampaignMediaUpload(
    userId: string,
    key: string,
  ): Promise<ICampaignMediaConfirmation>;
```

- [ ] **Step 4: Hiện thực service**

Trong `src/internal/storage.service.ts`:

(a) Thêm `campaignMedia: 'Phương tiện hoạt động từ thiện',` vào `MediaLabels`.

(b) Thay toàn bộ `assertPostMediaUploadPolicy` bằng phiên bản dùng chung. Câu chữ lỗi của bài đăng giữ nguyên:

```ts
/** Media nhận cả ảnh lẫn video, mỗi loại một hạn mức. */
const MixedMediaLabels = {
  postMedia: { any: 'Phương tiện bài đăng', image: 'Ảnh bài đăng', video: 'Video bài đăng' },
  campaignMedia: {
    any: 'Phương tiện hoạt động từ thiện',
    image: 'Ảnh hoạt động từ thiện',
    video: 'Video hoạt động từ thiện',
  },
} as const;

type MixedMediaKind = keyof typeof MixedMediaLabels;

function assertMixedMediaPolicy(
  kind: MixedMediaKind,
  request: IStorageUploadRequest,
): void {
  const labels = MixedMediaLabels[kind];
  const isImage = AllowedImageContentTypes.has(request.contentType);
  const isVideo = AllowedVideoContentTypes.has(request.contentType);

  if (!isImage && !isVideo)
    throw new StorageValidationError(
      `${labels.any} chỉ nhận ảnh (image/jpeg, image/png, image/webp) hoặc video (video/mp4, video/quicktime, video/webm).`,
    );

  if (!Number.isInteger(request.contentLength))
    throw new StorageValidationError(`${labels.any} phải khai kích thước thật.`);

  const limit = isImage
    ? MediaSizeLimits.postMediaImage
    : MediaSizeLimits.postMediaVideo;
  const label = isImage ? labels.image : labels.video;

  if (request.contentLength < 1 || request.contentLength > limit)
    throw new StorageValidationError(
      `${label} phải lớn hơn 0 và không quá ${Math.round(limit / Megabyte)} MB.`,
    );
}

export function assertPostMediaUploadPolicy(
  request: IPostMediaUploadRequest,
): void {
  assertMixedMediaPolicy('postMedia', request);
}

export function assertCampaignMediaUploadPolicy(
  request: IStorageUploadRequest,
): void {
  assertMixedMediaPolicy('campaignMedia', request);
}
```

Đổi chữ ký `assertUploadPolicy` thành `kind: Exclude<MediaKind, MixedMediaKind>`.

(c) Thêm hàm đọc lỗi 404, đặt cạnh các hàm assert:

```ts
/**
 * HeadObject trên key không có object. SDK v3 ném `NotFound` (S3) hoặc `NoSuchKey`
 * (vài bản tương thích), kèm `$metadata.httpStatusCode = 404`.
 */
function isMissingObject(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate?.name === 'NotFound' ||
    candidate?.name === 'NoSuchKey' ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}
```

(d) Trong `verifyObject`:
- Đổi kiểu trả về thành `Promise<string>`.
- Thay lượt `send` bằng:

```ts
    // Key không có object là lỗi CỦA CLIENT (tải hỏng, URL hết hạn, gửi nhầm key),
    // không phải sự cố hệ thống. Để lỗi SDK lọt ra là bộ lọc ngoại lệ trả 500.
    const object = await this.client
      .send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }))
      .catch((error: unknown) => {
        if (isMissingObject(error))
          throw new StorageValidationError(
            `Không tìm thấy object ${label.toLowerCase()} — hãy tải lên xong rồi mới gửi key.`,
          );
        throw error;
      });
```

- Đổi `if (kind === 'postMedia') {` thành `if (kind === 'postMedia' || kind === 'campaignMedia') {`.
- Đổi `if (!badType && !badSize) return;` thành `if (!badType && !badSize) return object.ContentType ?? '';`.

Các method `confirm*` đang có đều `await this.verifyObject(...)` rồi bỏ giá trị trả về, nên đổi kiểu không ảnh hưởng gì tới chúng.

(e) Thêm hai method, đặt sau `createPostMediaUpload`:

```ts
  public async createCampaignMediaUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertCampaignMediaUploadPolicy(request);

    const extension = getMediaExtension(request.contentType);
    const key = `users/${request.userId}/campaign-media/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
        // KÝ LUÔN kích thước — xem `createPostMediaUpload`.
        ContentLength: request.contentLength,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      key,
      uploadUrl,
      expiresInSeconds,
      publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
    };
  }

  public async confirmCampaignMediaUpload(
    userId: string,
    key: string,
  ): Promise<ICampaignMediaConfirmation> {
    const contentType = await this.verifyObject(
      'campaignMedia',
      `users/${userId}/campaign-media/`,
      key,
    );

    return {
      mediaType: AllowedVideoContentTypes.has(contentType) ? 'VIDEO' : 'IMAGE',
      publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
    };
  }
```

Thêm `ICampaignMediaConfirmation` vào khối import từ `../contracts` ở đầu file.

- [ ] **Step 5: Chạy test để thấy nó qua**

Run: `cd system/storage-lib && npx jest`
Expected: PASS toàn bộ, kể cả các test cũ của post media.

- [ ] **Step 6: Build `storage-lib`**

Run: `cd system/storage-lib && npm run build`
Expected: exit 0, và các file `contracts/*.d.ts`, `internal/*.js` ở gốc package thay đổi.

- [ ] **Step 7: Commit (gồm cả output build, vì được track)**

```bash
git add system/storage-lib
git commit -m "feat(storage): upload media chiến dịch; HeadObject 404 thành lỗi nhập liệu"
```

---

### Task 3: Migration `campaign_media` và nguồn key cho job dọn rác

Hai việc đi chung một task: bảng mới mà quên đăng ký với job dọn rác là xoá sạch ảnh sau 24 giờ.

**Files:**
- Create: `core/src/infrastructure/persistence/migrations/1800500000000-CreateCampaignMedia.ts`
- Modify: `core/src/infrastructure/persistence/migrations/index.ts`
- Modify: `core/src/application/implementations/media/sweep-orphan-media.use-case.ts:34-64`
- Test: `core/src/application/implementations/media/sweep-orphan-media.use-case.spec.ts`

**Interfaces:**
- Produces: bảng `campaign_media(id, campaign_id, storage_key, public_url, media_type, sort_order, is_cover, created_at)`; ràng buộc `UQ_campaign_media_storage_key`, `UQ_campaign_media_order`, index `UQ_campaign_media_one_cover`, `CHK_campaign_media_cover_is_image`; `CHK_campaigns_banner_url` nới thành `~ '^https?://'`.

- [ ] **Step 1: Viết test lỗi trước**

Thêm vào `sweep-orphan-media.use-case.spec.ts`, trong `describe`:

```ts
  it('KHÔNG xoá media của hoạt động từ thiện', async () => {
    // Thiếu `campaign_media` trong LiveKeySources là toàn bộ ảnh chiến dịch bị xoá
    // sau 24 giờ — đúng lỗi mà danh sách này sinh ra để chặn.
    const deps = makeDeps({
      rows: {
        campaign_media: [{ value: 'users/u1/campaign-media/a.webp' }],
      },
      objects: [
        { key: 'users/u1/campaign-media/a.webp', lastModified: old, size: 10 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: false });

    expect(result.orphans).toBe(0);
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Chạy test để thấy nó lỗi**

Run: `cd suites/chantam.vn/chantam/core && npx jest src/application/implementations/media/sweep-orphan-media.use-case.spec.ts`
Expected: FAIL ở test mới với `orphans` = 1.

- [ ] **Step 3: Hiện thực**

Trong `sweep-orphan-media.use-case.ts`, thêm vào `LiveKeySources` ngay sau mục `post_media`:

```ts
  {
    label: 'campaign_media',
    sql: 'SELECT storage_key AS value FROM campaign_media',
  },
```

Tạo file `1800500000000-CreateCampaignMedia.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh/video của hoạt động từ thiện — tối đa 5, ảnh bìa là một trong số đó.
 *
 * Xem `docs/superpowers/specs/2026-10-12-charity-campaign-media-design.md`.
 *
 * ## `public_url` lưu cạnh `storage_key`
 *
 * `storage_key` cho job dọn rác và cho ràng buộc "một object chỉ thuộc một hoạt
 * động". `public_url` để repository trả URL mà không phải biết `publicBaseUrl` —
 * cùng cách `campaigns.banner_url` vẫn lưu.
 *
 * ## Luật nào database giữ, luật nào không
 *
 * Bìa là ảnh, tối đa một bìa, thứ tự 0..4, không trùng object: database giữ.
 * "ĐÚNG một bìa" và "ít nhất một ảnh" thì không ép được bằng ràng buộc trên từng dòng —
 * `charityMediaShapeGaps`/`charityMediaTypeGaps` ở core-lib giữ, và lượt thay cả bộ
 * nằm trong một transaction nên không có trạng thái dở dang nào lộ ra ngoài.
 *
 * ## Nới `CHK_campaigns_banner_url`
 *
 * CHECK cũ đòi `https://` để chặn client gửi URL `http` gây mixed-content. Giờ server
 * dựng URL từ `STORAGE_PUBLIC_BASE_URL`, và dev đặt nó là `http://localhost:19000/...` —
 * giữ CHECK cũ thì mọi lượt tạo hoạt động ở dev hỏng.
 */
export class CreateCampaignMedia1800500000000 implements MigrationInterface {
  name = 'CreateCampaignMedia1800500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaign_media" (
        "id" BIGSERIAL NOT NULL,
        "campaign_id" uuid NOT NULL,
        "storage_key" varchar(500) NOT NULL,
        "public_url" text NOT NULL,
        "media_type" varchar(10) NOT NULL,
        "sort_order" int NOT NULL,
        "is_cover" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_media" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_media_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "UQ_campaign_media_order" UNIQUE ("campaign_id", "sort_order"),
        CONSTRAINT "FK_campaign_media_campaign"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_campaign_media_type" CHECK ("media_type" IN ('IMAGE', 'VIDEO')),
        CONSTRAINT "CHK_campaign_media_sort_order" CHECK ("sort_order" BETWEEN 0 AND 4),
        CONSTRAINT "CHK_campaign_media_cover_is_image"
          CHECK (NOT "is_cover" OR "media_type" = 'IMAGE'),
        CONSTRAINT "CHK_campaign_media_public_url" CHECK ("public_url" ~ '^https?://')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_campaign_media_one_cover"
        ON "campaign_media" ("campaign_id") WHERE "is_cover"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "CHK_campaigns_banner_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "CHK_campaigns_banner_url" CHECK ("banner_url" ~ '^https?://')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_media"`);
    await queryRunner.query(`
      ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "CHK_campaigns_banner_url"
    `);
    // NOT VALID: dòng `http://` ghi ở dev trong lúc migration này còn chạy sẽ làm
    // ADD CONSTRAINT thường ném, và một lượt revert hỏng giữa chừng tệ hơn một CHECK
    // chỉ canh dòng mới.
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD CONSTRAINT "CHK_campaigns_banner_url" CHECK ("banner_url" LIKE 'https://%') NOT VALID
    `);
  }
}
```

Thêm vào cuối `migrations/index.ts`:

```ts
export * from './1800500000000-CreateCampaignMedia';
```

- [ ] **Step 4: Chạy test để thấy nó qua**

Run: `cd suites/chantam.vn/chantam/core && npx jest src/application/implementations/media`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations suites/chantam.vn/chantam/core/src/application/implementations/media
git commit -m "feat(f65b): bảng campaign_media và đăng ký với job dọn rác"
```

(SQL của migration được chạy thật ở Task 7.)

---

### Task 4: Repository: đọc `media[]`, ghi media khi tạo, `replaceMedia`

**Files:**
- Modify: `core/src/domain/ports/repository/charity-campaign.repository.ts`
- Modify: `core/src/infrastructure/repository/charity-campaign.repository.ts`
- Modify: `core/src/domain/exceptions/charity-campaign.exception.ts`
- Test: `core/src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts` (chỉ sửa fixture)

**Interfaces:**
- Consumes: `CharityMediaType` (Task 1), `CoreErrors.CHARITY_MEDIA_*` (Task 1), bảng `campaign_media` (Task 3).
- Produces:
  - `interface ICharityCampaignMedia { url: string; type: CharityMediaType; sortOrder: number; isCover: boolean }`
  - `interface ICharityCampaignMediaParams { storageKey: string; publicUrl: string; mediaType: CharityMediaType; sortOrder: number; isCover: boolean }`
  - `ICharityCampaign.media: readonly ICharityCampaignMedia[]`
  - `ICreateCharityCampaignParams.media: readonly ICharityCampaignMediaParams[]` (vẫn giữ `bannerUrl`)
  - `ICharityCampaignRepository.replaceMedia(params: { campaignId: string; actorUserId: string; media: readonly ICharityCampaignMediaParams[]; bannerUrl: string }): Promise<ICharityCampaign>`
  - `CharityMediaInvalidException`, `CharityMediaNotEditableException`

- [ ] **Step 1: Exception**

Thêm vào cuối `charity-campaign.exception.ts`:

```ts
/** Bộ media sai hình dạng/loại, hoặc có key đã thuộc hoạt động khác. Nhận chi tiết lỗi. */
export class CharityMediaInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_MEDIA_INVALID,
) {}

/** Hồ sơ đã qua bước duyệt — media khoá lại (spec D4). */
export class CharityMediaNotEditableException extends ExceptionFrom(
  CoreErrors.CHARITY_MEDIA_NOT_EDITABLE,
) {}
```

Kiểm tra `core/src/domain/exceptions/index.ts` đã có `export * from './charity-campaign.exception'`. Nếu đã có thì không cần sửa gì.

- [ ] **Step 2: Port**

Trong `charity-campaign.repository.ts` (port), thêm `CharityMediaType` vào import từ `@chantam.vn/chantam.core-lib/models`. Thêm trước `export interface ICharityCampaign {`:

```ts
/** Một ảnh/video của hoạt động như API trả ra. Không lộ storage key. */
export interface ICharityCampaignMedia {
  readonly url: string;
  readonly type: CharityMediaType;
  readonly sortOrder: number;
  readonly isCover: boolean;
}

/** Một dòng `campaign_media` sẵn sàng ghi — đã qua HeadObject và luật bộ media. */
export interface ICharityCampaignMediaParams {
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly mediaType: CharityMediaType;
  readonly sortOrder: number;
  readonly isCover: boolean;
}
```

Thêm vào cuối `ICharityCampaign`:

```ts
  /**
   * Ảnh/video theo thứ tự hiển thị. Rỗng với hoạt động tạo trước khi có media —
   * những hoạt động đó vẫn có `bannerUrl` cũ.
   */
  readonly media: readonly ICharityCampaignMedia[];
```

Thêm vào cuối `ICreateCharityCampaignParams`:

```ts
  /** Ghi TRONG CÙNG transaction với hoạt động — hồ sơ vào hàng chờ duyệt luôn đủ ảnh. */
  readonly media: readonly ICharityCampaignMediaParams[];
```

Thêm vào `ICharityCampaignRepository`, ngay sau `create(...)`:

```ts
  /**
   * Thay CẢ BỘ media và `banner_url` của một hồ sơ còn chờ duyệt.
   *
   * Kiểm người tạo và trạng thái DƯỚI KHOÁ dòng: Admin duyệt chen giữa thì lượt thay
   * phải thua, không được ghi media vào một hồ sơ đã công khai.
   *
   * @throws CharityCampaignNotFoundException, CharityNotOrganizerException,
   *   CharityMediaNotEditableException, CharityMediaInvalidException (key đã thuộc hoạt động khác)
   */
  replaceMedia(params: {
    campaignId: string;
    actorUserId: string;
    media: readonly ICharityCampaignMediaParams[];
    bannerUrl: string;
  }): Promise<ICharityCampaign>;
```

- [ ] **Step 3: Repository impl**

Trong `core/src/infrastructure/repository/charity-campaign.repository.ts`:

(a) Import thêm:
- `CharityMediaInvalidException`, `CharityMediaNotEditableException` từ `@/domain/exceptions`. Kiểm tra `CharityCampaignNotFoundException` và `CharityNotOrganizerException` đã có trong khối import đó; nếu thiếu thì thêm.
- `ICharityCampaignMedia`, `ICharityCampaignMediaParams` từ `@/domain/ports/repository`.
- `import { isUniqueViolation } from './unique-violation';`

(b) Trong interface `IRow` (khai báo quanh dòng 60), thêm `media: ICharityCampaignMedia[] | null;`.

(c) Nối vào cuối chuỗi `Columns`, sau dòng `participant_count`, phải có dấu phẩy ngăn cách:

```ts
       ...AND participation.status = 'REGISTERED') AS participant_count,
       COALESCE(
         (SELECT json_agg(json_build_object(
                   'url', media.public_url,
                   'type', media.media_type,
                   'sortOrder', media.sort_order,
                   'isCover', media.is_cover
                 ) ORDER BY media.sort_order)
            FROM campaign_media media
           WHERE media.campaign_id = campaigns.global_id),
         '[]'::json
       ) AS media`;
```

(d) Trong `toCampaign`, thêm `media: row.media ?? [],` ngay sau `participantCount`.

(e) Thêm hàm trên file, đặt cạnh `phaseFilter`:

```ts
/**
 * Key đã thuộc hoạt động khác. So theo TÊN ràng buộc: `23505` ở bảng này còn có thể
 * là `UQ_campaign_media_order`, và lỗi đó là lỗi của mã chứ không của người dùng.
 */
function isMediaKeyTaken(error: unknown): boolean {
  const candidate = error as {
    constraint?: string;
    driverError?: { constraint?: string };
  };
  return (
    isUniqueViolation(error) &&
    (candidate?.constraint ?? candidate?.driverError?.constraint) ===
      'UQ_campaign_media_storage_key'
  );
}
```

(f) Thay method `create` bằng:

```ts
  public async create(
    params: ICreateCharityCampaignParams,
  ): Promise<ICharityCampaign> {
    // Hoạt động, bảng nhu cầu và media ghi trong MỘT transaction (F65b §3). Hai lượt
    // ghi rời sẽ để lại một kêu gọi công khai không nói cần gì hoặc không có ảnh, nếu
    // lượt sau hỏng — và với quyền public-ngay thì nó công khai thật.
    try {
      return await this.manager.transaction(async (manager) => {
        const campaign = await this.insertCampaign(manager, params);
        if (params.needs.length > 0)
          await this.insertNeeds(manager, campaign.globalId, params.needs);
        if (params.beneficiary)
          await this.writeBeneficiary(
            manager,
            campaign.globalId,
            params.createdBy,
            params.beneficiary,
          );
        if (params.media.length === 0) return campaign;

        await this.insertMedia(manager, campaign.globalId, params.media);
        // Đọc lại: `media` trong `Columns` là subquery, và lượt INSERT hoạt động ở
        // trên chạy TRƯỚC khi có dòng media nào.
        return this.readCampaign(manager, campaign.globalId);
      });
    } catch (error) {
      if (isMediaKeyTaken(error))
        throw new CharityMediaInvalidException(
          'Một key trong media đã thuộc hoạt động khác — hãy tải lên ảnh mới',
        );
      throw error;
    }
  }
```

(g) Thêm các method, đặt sau `insertNeeds`:

```ts
  private async insertMedia(
    manager: EntityManager,
    campaignId: string,
    media: readonly ICharityCampaignMediaParams[],
  ): Promise<void> {
    await manager.query(
      `INSERT INTO campaign_media
         (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
       SELECT $1, item.storage_key, item.public_url, item.media_type,
              item.sort_order, item.is_cover
       FROM UNNEST($2::text[], $3::text[], $4::text[], $5::int[], $6::boolean[])
         AS item(storage_key, public_url, media_type, sort_order, is_cover)`,
      [
        campaignId,
        media.map((item) => item.storageKey),
        media.map((item) => item.publicUrl),
        media.map((item) => item.mediaType),
        media.map((item) => item.sortOrder),
        media.map((item) => item.isCover),
      ],
    );
  }

  private async readCampaign(
    manager: EntityManager,
    campaignId: string,
  ): Promise<ICharityCampaign> {
    const [row] = await manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns WHERE campaigns.global_id = $1`,
      [campaignId],
    );
    return toCampaign(row);
  }

  public async replaceMedia(params: {
    campaignId: string;
    actorUserId: string;
    media: readonly ICharityCampaignMediaParams[];
    bannerUrl: string;
  }): Promise<ICharityCampaign> {
    try {
      return await this.manager.transaction(async (manager) => {
        const [locked] = await manager.query<
          { created_by: string | null; approval_status: string }[]
        >(
          `SELECT created_by, approval_status FROM campaigns
            WHERE global_id = $1 AND deleted_at IS NULL
            FOR UPDATE`,
          [params.campaignId],
        );
        if (!locked) throw new CharityCampaignNotFoundException();
        if (locked.created_by !== params.actorUserId)
          throw new CharityNotOrganizerException();
        if (locked.approval_status !== 'PENDING_APPROVAL')
          throw new CharityMediaNotEditableException();

        // DELETE trước INSERT trong cùng transaction: gửi lại đúng các key đang có
        // (chỉ đổi thứ tự hoặc bìa) thì `UQ_campaign_media_storage_key` không chặn.
        await manager.query(`DELETE FROM campaign_media WHERE campaign_id = $1`, [
          params.campaignId,
        ]);
        await this.insertMedia(manager, params.campaignId, params.media);
        await manager.query(
          `UPDATE campaigns SET banner_url = $2, updated_at = now() WHERE global_id = $1`,
          [params.campaignId, params.bannerUrl],
        );
        return this.readCampaign(manager, params.campaignId);
      });
    } catch (error) {
      if (isMediaKeyTaken(error))
        throw new CharityMediaInvalidException(
          'Một key trong media đã thuộc hoạt động khác — hãy tải lên ảnh mới',
        );
      throw error;
    }
  }
```

Hai câu DELETE/UPDATE ở trên không đọc kết quả trả về, nên không vướng bẫy `[rows, affected]` của TypeORM.

- [ ] **Step 4: Sửa fixture trong spec của use case**

Trong `charity-campaign.use-cases.spec.ts`:
- Hàm `campaign()`: thêm `media: [],` trước `...overrides`.
- `makeRepository()`: thêm `replaceMedia: jest.fn(),`.

- [ ] **Step 5: Type-check phần repository**

Run: `cd suites/chantam.vn/chantam/core && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "charity-campaign\.repository|ports/repository/charity" || echo "repository OK"`
Expected: `repository OK`. Lỗi ở `charity-campaign.use-cases.ts` và controller vẫn còn, Task 5 và Task 6 sẽ sửa.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/domain suites/chantam.vn/chantam/core/src/infrastructure/repository/charity-campaign.repository.ts suites/chantam.vn/chantam/core/src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts
git commit -m "feat(f65b): repository đọc/ghi media chiến dịch, thay cả bộ dưới khoá dòng"
```

---

### Task 5: Use case: tạo kèm media, xin URL upload, thay media

**Files:**
- Modify: `core/src/application/contracts/charity-campaign/charity-campaign.contract.ts`
- Modify: `core/src/application/implementations/charity-campaign/charity-campaign.use-cases.ts`
- Modify: `core/src/application/implementations/charity-campaign/charity-campaign.module.ts`
- Test: `core/src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`charityMediaShapeGaps`, `charityMediaTypeGaps`), Task 2 (`IObjectStorage.createCampaignMediaUpload`, `confirmCampaignMediaUpload`), Task 4 (`replaceMedia`, `ICharityCampaignMediaParams`, các exception).
- Produces:
  - `ICharityCampaignWriteInput`: **bỏ** `bannerUrl`, **thêm** `readonly media: readonly string[]; readonly coverKey: string;`
  - `IRequestCharityMediaUploadCommand { userId: string; contentType: string; contentLength: number }`, `IRequestCharityMediaUploadUseCase` (Symbol) trả `IStorageUploadResult`
  - `IReplaceCharityMediaCommand { campaignId: string; actorUserId: string; media: readonly string[]; coverKey: string }`, `IReplaceCharityMediaUseCase` (Symbol) trả `ICharityCampaignView`
  - Constructor `CreateCharityCampaignUseCase(repository, entitlements, admin, storage: IObjectStorage)`: storage là tham số **thứ tư**

- [ ] **Step 1: Viết test lỗi trước**

Trong `charity-campaign.use-cases.spec.ts`:

(a) Thêm `CharityMediaInvalidException`, `CharityMediaNotEditableException`, `CharityNotOrganizerException` vào import từ `@/domain/exceptions` (bỏ qua cái nào đã có). Thêm `RequestCharityMediaUploadUseCase`, `ReplaceCharityMediaUseCase` vào import từ `./charity-campaign.use-cases`. Thêm `import { StorageValidationError } from '@chantam/service.storage-lib';` và `import { ValidationFailedException } from '@chantam/service.common-lib/exception';` nếu chưa có.

(b) Thêm helper ngay sau `makeAdmin`:

```ts
const MediaKey = 'users/actor/campaign-media/a.webp';

/** Kho lưu trữ giả: key đuôi .mp4 là video, còn lại là ảnh. */
function makeStorage() {
  return {
    createCampaignMediaUpload: jest.fn(),
    confirmCampaignMediaUpload: jest.fn(async (_userId: string, key: string) => ({
      mediaType: key.endsWith('.mp4') ? ('VIDEO' as const) : ('IMAGE' as const),
      publicUrl: `https://cdn.chantam.test/${key}`,
    })),
  } as unknown as jest.Mocked<IObjectStorage> & {
    confirmCampaignMediaUpload: jest.Mock;
    createCampaignMediaUpload: jest.Mock;
  };
}
```

Kèm `import { IObjectStorage } from '@chantam/service.storage-lib';`.

(c) Hàm `writeInput()` của spec: thay `bannerUrl: 'https://cdn.chantam.vn/a.jpg',` bằng:

```ts
    media: [MediaKey],
    coverKey: MediaKey,
```

Đổi luôn test đang gọi `writeInput({ title: 'x', bannerUrl: 'http://x', description: 'a' })` thành `writeInput({ title: 'x', description: 'a' })`.

(d) Mọi lời gọi `new CreateCharityCampaignUseCase(` trong file (19 chỗ) được thêm tham số thứ tư `makeStorage()` ngay sau tham số `admin`. Ví dụ:

```ts
    await new CreateCharityCampaignUseCase(
      repository,
      entitlements,
      admin,
      makeStorage(),
    ).handle(...)
```

Sau khi sửa, kiểm lại bằng: `grep -c "makeStorage()" src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts` phải ≥ 19.

(e) Thêm các test mới vào cuối file:

```ts
describe('CreateCharityCampaignUseCase · media (spec 12/10)', () => {
  const create = (
    repository: ReturnType<typeof makeRepository>,
    storage: ReturnType<typeof makeStorage>,
    overrides: Record<string, unknown> = {},
  ) =>
    new CreateCharityCampaignUseCase(
      repository,
      makeEntitlements(true),
      makeAdmin(true),
      storage,
    ).handle({ ...writeInput(overrides), actorUserId: ActorId, asAdmin: false });

  it('xác nhận TỪNG key với đúng người gọi, rồi ghi media + banner từ ảnh bìa', async () => {
    const repository = makeRepository();
    repository.create.mockResolvedValue(campaign());
    const storage = makeStorage();
    const video = 'users/actor/campaign-media/b.mp4';

    await create(repository, storage, { media: [video, MediaKey], coverKey: MediaKey });

    expect(storage.confirmCampaignMediaUpload.mock.calls).toEqual([
      [ActorId, video],
      [ActorId, MediaKey],
    ]);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerUrl: `https://cdn.chantam.test/${MediaKey}`,
        media: [
          expect.objectContaining({ storageKey: video, mediaType: 'VIDEO', sortOrder: 0, isCover: false }),
          expect.objectContaining({ storageKey: MediaKey, mediaType: 'IMAGE', sortOrder: 1, isCover: true }),
        ],
      }),
    );
  });

  it('hình dạng sai thì KHÔNG gọi kho lưu trữ', async () => {
    const storage = makeStorage();

    await expect(
      create(makeRepository(), storage, { media: [MediaKey, MediaKey], coverKey: MediaKey }),
    ).rejects.toThrow(CharityMediaInvalidException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('bìa là video thì CharityMediaInvalidException và không ghi gì', async () => {
    const repository = makeRepository();
    const video = 'users/actor/campaign-media/b.mp4';

    await expect(
      create(repository, makeStorage(), { media: [MediaKey, video], coverKey: video }),
    ).rejects.toThrow(CharityMediaInvalidException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('lỗi chính sách kho lưu trữ thành ValidationFailedException (400), không lọt 500', async () => {
    const storage = makeStorage();
    storage.confirmCampaignMediaUpload.mockRejectedValueOnce(
      new StorageValidationError('Không tìm thấy object'),
    );

    await expect(create(makeRepository(), storage)).rejects.toThrow(ValidationFailedException);
  });

  it('không đủ quyền tạo thì KHÔNG gọi kho lưu trữ', async () => {
    const storage = makeStorage();

    await expect(
      new CreateCharityCampaignUseCase(
        makeRepository(),
        makeEntitlements(null),
        makeAdmin(true),
        storage,
      ).handle({ ...writeInput(), actorUserId: ActorId, asAdmin: false }),
    ).rejects.toThrow(CharityCampaignCreateNotAllowedException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });
});

describe('RequestCharityMediaUploadUseCase', () => {
  it('xin URL dưới namespace của chính người gọi', async () => {
    const storage = makeStorage();
    storage.createCampaignMediaUpload.mockResolvedValue({ key: 'k' });

    await new RequestCharityMediaUploadUseCase(storage).handle({
      userId: ActorId,
      contentType: 'image/webp',
      contentLength: 10,
    });

    expect(storage.createCampaignMediaUpload).toHaveBeenCalledWith({
      userId: ActorId,
      contentType: 'image/webp',
      contentLength: 10,
    });
  });

  it('lỗi chính sách thành ValidationFailedException', async () => {
    const storage = makeStorage();
    storage.createCampaignMediaUpload.mockRejectedValue(new StorageValidationError('PDF'));

    await expect(
      new RequestCharityMediaUploadUseCase(storage).handle({
        userId: ActorId,
        contentType: 'application/pdf',
        contentLength: 10,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});

describe('ReplaceCharityMediaUseCase', () => {
  const pending = () =>
    campaign({ approvalStatus: 'PENDING_APPROVAL', approvedAt: null, approvedBy: null, createdBy: ActorId });
  const command = { campaignId: 'campaign-1', actorUserId: ActorId, media: [MediaKey], coverKey: MediaKey };

  it('người tạo + chờ duyệt: xác nhận key rồi gọi replaceMedia', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(pending());
    repository.replaceMedia.mockResolvedValue(pending());

    await new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(command);

    expect(repository.replaceMedia).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      actorUserId: ActorId,
      bannerUrl: `https://cdn.chantam.test/${MediaKey}`,
      media: [expect.objectContaining({ storageKey: MediaKey, isCover: true, sortOrder: 0 })],
    });
  });

  it('không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);

    await expect(
      new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(command),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });

  it('không phải người tạo (kể cả coordinator) thì NotOrganizer, không gọi kho lưu trữ', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue({ ...pending(), createdBy: 'someone-else' });
    repository.isCampaignManager.mockResolvedValue(true);
    const storage = makeStorage();

    await expect(
      new ReplaceCharityMediaUseCase(repository, storage).handle(command),
    ).rejects.toThrow(CharityNotOrganizerException);
    expect(storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)('hồ sơ %s thì NotEditable', async (status) => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue({ ...pending(), approvalStatus: status });

    await expect(
      new ReplaceCharityMediaUseCase(repository, makeStorage()).handle(command),
    ).rejects.toThrow(CharityMediaNotEditableException);
    expect(repository.replaceMedia).not.toHaveBeenCalled();
  });
});
```

Nếu `CharityCampaignNotFoundException` chưa có trong import thì thêm vào.

- [ ] **Step 2: Chạy test để thấy nó lỗi**

Run: `cd suites/chantam.vn/chantam/core && npx jest src/application/implementations/charity-campaign/charity-campaign.use-cases.spec.ts`
Expected: FAIL, vì `RequestCharityMediaUploadUseCase` / `ReplaceCharityMediaUseCase` chưa tồn tại và `media` chưa được truyền xuống.

- [ ] **Step 3: Contract**

Trong `charity-campaign.contract.ts`:
- Thêm `import { IStorageUploadResult } from '@chantam/service.storage-lib';`.
- Trong `ICharityCampaignWriteInput`, thay `readonly bannerUrl: string;` bằng:

```ts
  /**
   * 1–5 key lấy từ `POST /charity-campaigns/media/upload`. Thứ tự trong mảng là thứ tự
   * hiển thị. KHÔNG nhận URL: URL là thứ server dựng sau khi HeadObject xác nhận key.
   */
  readonly media: readonly string[];
  /** Một key trong `media`, phải là ảnh. Server ghi `banner_url` từ nó. */
  readonly coverKey: string;
```

Thêm vào cuối file:

```ts
export interface IRequestCharityMediaUploadCommand {
  readonly userId: string;
  readonly contentType: string;
  readonly contentLength: number;
}

export type IRequestCharityMediaUploadResult = IStorageUploadResult;

export interface IRequestCharityMediaUploadUseCase extends IUseCase<
  IRequestCharityMediaUploadCommand,
  IRequestCharityMediaUploadResult
> {}

export const IRequestCharityMediaUploadUseCase = Symbol(
  'IRequestCharityMediaUploadUseCase',
);

export interface IReplaceCharityMediaCommand {
  readonly campaignId: string;
  readonly actorUserId: string;
  readonly media: readonly string[];
  readonly coverKey: string;
}

export interface IReplaceCharityMediaUseCase extends IUseCase<
  IReplaceCharityMediaCommand,
  ICharityCampaignView
> {}

export const IReplaceCharityMediaUseCase = Symbol('IReplaceCharityMediaUseCase');
```

- [ ] **Step 4: Use case**

Trong `charity-campaign.use-cases.ts`:

(a) Import:
- Thêm `IRequestCharityMediaUploadCommand`, `IRequestCharityMediaUploadUseCase`, `IReplaceCharityMediaCommand`, `IReplaceCharityMediaUseCase` vào khối import contract.
- Thêm `CharityMediaInvalidException`, `CharityMediaNotEditableException` vào khối import `@/domain/exceptions`, và kiểm tra `CharityNotOrganizerException`, `CharityCampaignNotFoundException` đã có.
- Thêm `ICharityCampaignMediaParams` vào import `@/domain/ports/repository`.
- Thêm `charityMediaShapeGaps`, `charityMediaTypeGaps` vào import `@chantam.vn/chantam.core-lib/models`.
- Thêm `import { IObjectStorage, IStorageUploadResult } from '@chantam/service.storage-lib';` và `import { withStorageValidation } from '../shared/storage-error';`.

(b) Trong `prepareWrite`:
- Xoá `bannerUrl: string;` khỏi kiểu trả về.
- Xoá `bannerUrl: input.bannerUrl,` ở **cả hai** chỗ (lời gọi `charityCampaignGaps` và object trả về).

(c) Thêm hàm, đặt ngay sau `prepareWrite`:

```ts
/**
 * Xác nhận bộ media và dựng các dòng sẵn sàng ghi.
 *
 * Dùng chung cho đường tạo và đường thay, để hai đường không thể lệch luật. Hình dạng
 * kiểm TRƯỚC khi hỏi R2; loại (ảnh hay video) chỉ biết SAU HeadObject — lấy từ content
 * type thật của object chứ không tin lời khai lúc xin URL.
 */
async function confirmCharityMedia(
  storage: IObjectStorage,
  userId: string,
  keys: readonly string[],
  coverKey: string,
): Promise<{ media: ICharityCampaignMediaParams[]; bannerUrl: string }> {
  const shapeGaps = charityMediaShapeGaps({ keys, coverKey });
  if (shapeGaps.length > 0)
    throw new CharityMediaInvalidException(shapeGaps.join('; '));

  // Tuần tự như luồng bình luận: tối đa 5 lượt, và một key hỏng giữa chừng thì
  // dừng ngay thay vì bắn nốt các lượt còn lại.
  const confirmed: { key: string; mediaType: 'IMAGE' | 'VIDEO'; publicUrl: string }[] = [];
  for (const key of keys)
    confirmed.push({
      key,
      ...(await withStorageValidation('media', () =>
        storage.confirmCampaignMediaUpload(userId, key),
      )),
    });

  const typeGaps = charityMediaTypeGaps({ items: confirmed, coverKey });
  if (typeGaps.length > 0)
    throw new CharityMediaInvalidException(typeGaps.join('; '));

  const media = confirmed.map((item, index) => ({
    storageKey: item.key,
    publicUrl: item.publicUrl,
    mediaType: item.mediaType,
    // Thứ tự do SERVER đặt theo thứ tự client gửi, như bảng nhu cầu.
    sortOrder: index,
    isCover: item.key === coverKey,
  }));

  // `charityMediaShapeGaps` đã bảo đảm `coverKey` nằm trong `keys`.
  return { media, bannerUrl: media[keys.indexOf(coverKey)].publicUrl };
}
```

(d) Trong `CreateCharityCampaignUseCase`:
- Thêm vào constructor, sau `admin`:

```ts
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
```

- Trong `handle`, ngay sau `const prepared = await prepareWrite(this.repository, command);`, thêm:

```ts
    // SAU quyền và nội dung: người không được tạo, hoặc gửi hồ sơ thiếu, không tốn
    // lượt gọi R2 nào.
    const { media, bannerUrl } = await confirmCharityMedia(
      this.storage,
      command.actorUserId,
      command.media,
      command.coverKey,
    );
```

- Trong object truyền vào `this.repository.create({ ...prepared, ... })`, thêm `bannerUrl,` và `media,`.

(e) Thêm hai class, đặt ngay sau `CreateCharityCampaignUseCase`:

```ts
/**
 * Xin URL tải lên cho media hoạt động.
 *
 * KHÔNG kiểm quyền tạo hoạt động ở đây: xin URL không tạo ra gì, và quyền vẫn bị kiểm
 * ở lượt tạo. Object không bao giờ được gắn thì job dọn rác xoá sau 24 giờ.
 */
@Injectable()
export class RequestCharityMediaUploadUseCase implements IRequestCharityMediaUploadUseCase {
  public constructor(
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestCharityMediaUploadCommand,
  ): Promise<IStorageUploadResult> {
    return withStorageValidation('upload', () =>
      this.storage.createCampaignMediaUpload({
        userId: command.userId,
        contentType: command.contentType,
        contentLength: command.contentLength,
      }),
    );
  }
}

/**
 * Thay cả bộ media của hồ sơ CHỜ DUYỆT (spec D4, D5).
 *
 * Kiểm người tạo và trạng thái TRƯỚC khi gọi R2 để trả lỗi rõ cho người gọi sai; rồi
 * repository kiểm LẠI dưới khoá dòng, vì Admin có thể duyệt chen giữa hai lượt.
 * Coordinator không sửa được: §2 cho họ điều phối, không cho đổi nội dung đã gửi duyệt.
 */
@Injectable()
export class ReplaceCharityMediaUseCase implements IReplaceCharityMediaUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IReplaceCharityMediaCommand,
  ): Promise<ICharityCampaignView> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    if (campaign.createdBy !== command.actorUserId)
      throw new CharityNotOrganizerException();
    if (campaign.approvalStatus !== 'PENDING_APPROVAL')
      throw new CharityMediaNotEditableException();

    const { media, bannerUrl } = await confirmCharityMedia(
      this.storage,
      command.actorUserId,
      command.media,
      command.coverKey,
    );

    return toView(
      await this.repository.replaceMedia({
        campaignId: command.campaignId,
        actorUserId: command.actorUserId,
        media,
        bannerUrl,
      }),
      null,
    );
  }
}
```

(f) Trong `charity-campaign.module.ts`, thêm 2 interface vào import contract, thêm 2 class vào import `./charity-campaign.use-cases`, và thêm vào `providers`:

```ts
    {
      provide: IRequestCharityMediaUploadUseCase,
      useClass: RequestCharityMediaUploadUseCase,
    },
    {
      provide: IReplaceCharityMediaUseCase,
      useClass: ReplaceCharityMediaUseCase,
    },
```

Nếu module có `exports`, thêm 2 Symbol vào `exports` theo đúng cách các use case khác đang làm.

- [ ] **Step 5: Chạy test để thấy nó qua**

Run: `cd suites/chantam.vn/chantam/core && npx jest src/application/implementations/charity-campaign`
Expected: PASS toàn bộ, gồm các test cũ và các test mới.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/application
git commit -m "feat(f65b): tạo chiến dịch kèm media, xin URL upload, thay media khi chờ duyệt"
```

---

### Task 6: DTO và controller

**Files:**
- Modify: `core/src/infrastructure/controller/dto/charity-campaign/charity-campaign.dto.ts`
- Modify: `core/src/infrastructure/controller/api/charity-campaign/charity-campaign.controller.ts`

**Interfaces:**
- Consumes: `IRequestCharityMediaUploadUseCase`, `IReplaceCharityMediaUseCase` (Task 5), `MaxCharityMediaPerCampaign`, `CharityMediaTypes` (Task 1).
- Produces:
  - `POST /charity-campaigns/media/upload`: body `{ upload: { contentType, contentLength } }`, trả `{ upload: { key, uploadUrl, expiresInSeconds, publicUrl } }`.
  - `PUT /charity-campaigns/:id/media`: body `{ media: { keys: string[], coverKey } }`, trả `{ campaign }`.
  - Body tạo: `campaign.media: string[]`, `campaign.coverKey`.
  - Response: `campaign.media[]`.

- [ ] **Step 1: DTO**

Trong `charity-campaign.dto.ts`:
- Thêm `CharityMediaTypes`, `MaxCharityMediaPerCampaign` vào import core-lib.
- Thêm `IsIn` vào import class-validator nếu chưa có; `ArrayMinSize`, `ArrayMaxSize` đã có sẵn.
- Xoá `IsUrl` khỏi import nếu sau khi sửa không còn chỗ nào dùng.

Trong `WriteCharityCampaignDto`, thay khối `bannerUrl` (decorator `@ApiProperty({ example: 'https://cdn.chantam.vn/campaigns/vu-lan-2026.jpg', ...})`, `@IsUrl(...)` và `bannerUrl: string;`) bằng:

```ts
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MaxCharityMediaPerCampaign,
    example: ['users/<userId>/campaign-media/2f0c….webp'],
    description:
      'Key lấy từ `POST /charity-campaigns/media/upload` sau khi PUT lên R2 thành công. ' +
      `1–${MaxCharityMediaPerCampaign} ảnh/video, ít nhất một ảnh. Thứ tự trong mảng là thứ tự hiển thị. ` +
      'KHÔNG nhận URL.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxCharityMediaPerCampaign)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  media: string[];

  @ApiProperty({
    description:
      'Một key trong `media`, phải là ảnh. Server ghi `bannerUrl` từ ảnh này — client không gửi URL bìa.',
  })
  @IsString()
  @Length(1, 500)
  coverKey: string;
```

Thêm các class sau, đặt ngay sau `WriteCharityCampaignBodyDto`:

```ts
const CharityMediaContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

export class RequestCharityMediaUploadDto {
  @ApiProperty({ enum: CharityMediaContentTypes, example: 'image/webp' })
  @IsIn(CharityMediaContentTypes)
  contentType: string;

  @ApiProperty({
    minimum: 1,
    example: 512_000,
    description: 'Tối đa 5 MB cho ảnh, 25 MB cho video. Được ký vào URL — PUT lệch một byte là hỏng chữ ký.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentLength: number;
}

export class RequestCharityMediaUploadBodyDto {
  @ApiProperty({ type: () => RequestCharityMediaUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestCharityMediaUploadDto)
  upload: RequestCharityMediaUploadDto;
}

export class CharityMediaUploadDto {
  @ApiProperty() key: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty({ example: 300 }) expiresInSeconds: number;
  @ApiProperty() publicUrl: string;
}

export class RequestCharityMediaUploadResponseDto {
  @ApiProperty({ type: () => CharityMediaUploadDto })
  upload: CharityMediaUploadDto;
}

export class ReplaceCharityMediaDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: MaxCharityMediaPerCampaign })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxCharityMediaPerCampaign)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  keys: string[];

  @ApiProperty({ description: 'Một key trong `keys`, phải là ảnh.' })
  @IsString()
  @Length(1, 500)
  coverKey: string;
}

export class ReplaceCharityMediaBodyDto {
  @ApiProperty({ type: () => ReplaceCharityMediaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReplaceCharityMediaDto)
  media: ReplaceCharityMediaDto;
}

export class CharityCampaignMediaDto {
  @ApiProperty() url: string;
  @ApiProperty({ enum: CharityMediaTypes }) type: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isCover: boolean;
}
```

Trong `CharityCampaignResponseDto`, thêm sau `participantCount`:

```ts
  @ApiProperty({
    type: () => [CharityCampaignMediaDto],
    description:
      'Ảnh/video theo thứ tự hiển thị. Rỗng với hoạt động tạo trước khi có media — khi đó chỉ có `bannerUrl`.',
  })
  media: CharityCampaignMediaDto[];
```

Đổi mô tả của `bannerUrl` trong response thành `@ApiProperty({ description: 'URL ảnh bìa — do server ghi từ media được chọn làm bìa.' }) bannerUrl: string;`.

`CharityCampaignMediaDto` phải được khai báo **trước** `CharityCampaignResponseDto` trong file. Nếu thứ tự hiện tại không như vậy, chuyển class này lên.

- [ ] **Step 2: Controller**

Trong `CharityCampaignController`:
- Import `IRequestCharityMediaUploadUseCase`, `IReplaceCharityMediaUseCase` từ contract.
- Import `CharityMediaInvalidException`, `CharityMediaNotEditableException` từ `@/domain/exceptions`. Kiểm tra `CharityNotOrganizerException`, `CharityCampaignNotFoundException` đã có.
- Import 4 DTO mới.
- Import `Put` từ `@nestjs/common` nếu chưa có (endpoint beneficiary đã dùng `@Put`, nhiều khả năng có sẵn).

Thêm vào constructor:

```ts
    @Inject(IRequestCharityMediaUploadUseCase)
    private readonly mediaUploadUseCase: IRequestCharityMediaUploadUseCase,
    @Inject(IReplaceCharityMediaUseCase)
    private readonly replaceMediaUseCase: IReplaceCharityMediaUseCase,
```

Ở `create`, cập nhật mô tả Swagger và lỗi:
- Nối thêm vào `description`: `'\n\n**Media:** gửi `media` (1–5 key từ `POST /charity-campaigns/media/upload`) và `coverKey`. Không còn nhận `bannerUrl`.'`.
- Thêm `CharityMediaInvalidException` vào `@ApiErrorResponses(...)`.

Làm tương tự cho `create` của `AdminCharityCampaignController`.

Thêm endpoint xin URL ngay **sau** `create` của `CharityCampaignController` và **trước** `@Post(':id/contributions')`. Route tĩnh phải đứng trước route có tham số, nếu không `route-order-guard` sẽ báo:

```ts
  @Post('media/upload')
  @ApiOperation({
    summary: 'Xin URL tải ảnh/video cho hoạt động từ thiện',
    description:
      'Bước 1 của luồng "tải trước, tạo sau": xin URL, PUT file lên R2, rồi gửi `key` trong ' +
      '`POST /charity-campaigns` hoặc `PUT /charity-campaigns/:id/media`. Ảnh JPEG/PNG/WebP ' +
      'tối đa 5 MB; video MP4/QuickTime/WebM tối đa 25 MB. URL hết hạn sau `expiresInSeconds`. ' +
      'Object không được gắn vào hoạt động nào bị dọn sau 24 giờ.',
  })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['upload: Phương tiện hoạt động từ thiện chỉ nhận ảnh (image/jpeg, image/png, image/webp) hoặc video (video/mp4, video/quicktime, video/webm).'],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCharityMediaUploadResponseDto),
  })
  public async requestCharityMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestCharityMediaUploadBodyDto,
  ) {
    const upload = await this.mediaUploadUseCase.handle({
      userId: principal.userId,
      contentType: body.upload.contentType,
      contentLength: body.upload.contentLength,
    });

    return ResponseDto.create().succeed().attach({ upload }).build();
  }
```

Thêm endpoint thay media ngay sau `@Put(':id/beneficiary')`:

```ts
  @Put(':id/media')
  @ApiOperation({
    summary: 'Thay cả bộ ảnh/video của hồ sơ đang chờ duyệt',
    description:
      'Gửi LẠI toàn bộ danh sách: key giữ nguyên thì gửi lại, key bỏ đi thì không gửi. ' +
      'Đổi thứ tự hoặc đổi ảnh bìa cũng đi đường này.\n\n' +
      'Chỉ người TẠO, chỉ khi `approvalStatus = PENDING_APPROVAL`. Đã duyệt thì khoá — ' +
      'Admin duyệt bộ ảnh nào thì công khai đúng bộ đó. Coordinator không gọi được.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityNotOrganizerException,
    CharityMediaNotEditableException,
    CharityMediaInvalidException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityCampaignWrapperResponseDto),
  })
  public async replaceCharityMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: CharityCampaignIdParamDto,
    @Body() body: ReplaceCharityMediaBodyDto,
  ) {
    const campaign = await this.replaceMediaUseCase.handle({
      campaignId: param.id,
      actorUserId: principal.userId,
      media: body.media.keys,
      coverKey: body.media.coverKey,
    });

    return ResponseDto.create().succeed().attach({ campaign }).build();
  }
```

Hai controller tạo (thành viên và Admin) đang truyền `...body.campaign`, nên `media` và `coverKey` tự đi xuống use case, không cần sửa thêm.

- [ ] **Step 3: Type-check, lint, toàn bộ unit test của core**

Run:
- `cd suites/chantam.vn/chantam/core && npx tsc --noEmit -p tsconfig.json`
- `npx jest`

Expected: tsc không có lỗi; jest PASS. Nếu có test route-order hoặc srs-endpoint chạy trong jest thì cũng phải PASS.

- [ ] **Step 4: Commit**

```bash
git add suites/chantam.vn/chantam/core/src/infrastructure/controller
git commit -m "feat(f65b): endpoint upload và thay media chiến dịch; body tạo bỏ bannerUrl"
```

---

### Task 7: Kiểm trên Postgres thật: migration, ràng buộc, luồng thay

Unit test mock `query`, nên SQL sai vẫn lọt qua. Task này chạy schema thật.

**Files:**
- Create: `core/test/fake-campaign-media-storage.ts`
- Modify: `core/test/charity-campaign.check.ts`
- Modify: `core/test/charity-contribution.check.ts`

**Interfaces:**
- Consumes: mọi thứ từ Task 3 tới Task 5.

- [ ] **Step 1: Bật Docker và Postgres**

Run (PowerShell): `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`. Chờ Docker sẵn sàng (`docker info` thành công), rồi chạy `docker compose up -d` ở thư mục gốc repo.
Expected: container Postgres (PostGIS) ở trạng thái `running`.

- [ ] **Step 2: Storage giả dùng chung cho script**

Tạo `core/test/fake-campaign-media-storage.ts`:

```ts
import { IObjectStorage } from '@chantam/service.storage-lib';
import { randomUUID } from 'node:crypto';

/**
 * Kho lưu trữ giả cho các script DB thật: script đo SQL và ràng buộc, không đo R2.
 * Key đuôi `.mp4` là video, còn lại là ảnh. Vẫn kiểm tiền tố người dùng như bản thật.
 */
export function fakeCampaignMediaStorage(): IObjectStorage {
  return {
    confirmCampaignMediaUpload: async (userId: string, key: string) => {
      if (!key.startsWith(`users/${userId}/campaign-media/`))
        throw new Error(`key ${key} không thuộc ${userId}`);
      return {
        mediaType: key.endsWith('.mp4') ? 'VIDEO' : 'IMAGE',
        publicUrl: `https://cdn.chantam.test/${key}`,
      };
    },
  } as unknown as IObjectStorage;
}

/** Một key ảnh mới tinh dưới namespace của người dùng. */
export function freshMediaKey(userId: string, extension = 'webp'): string {
  return `users/${userId}/campaign-media/${randomUUID()}.${extension}`;
}
```

- [ ] **Step 3: Sửa input của hai script cho hợp body mới**

Cả hai script đều tạo nhiều hoạt động bằng những người tạo khác nhau. Key bắt buộc phải nằm dưới namespace của **đúng** `actorUserId`, mà `writeInput()` / `baseInput()` lại không biết ai là người tạo. Vì vậy gắn key ở nơi gọi, qua một hàm bọc:

Trong `core/test/charity-campaign.check.ts`:
- Import `fakeCampaignMediaStorage`, `freshMediaKey` từ `./fake-campaign-media-storage`.
- Xoá dòng `bannerUrl: ...` trong `writeInput`.
- Thêm `fakeCampaignMediaStorage()` làm tham số thứ tư của `new CreateCharityCampaignUseCase(`.
- Ngay sau khi dựng `createUseCase`, bọc lại:

```ts
    // Mỗi lượt tạo một key MỚI dưới namespace của đúng người tạo — key là UNIQUE
    // toàn bảng, và bản thật từ chối key nằm ngoài namespace của người gọi.
    const withMedia = <T extends { actorUserId: string }>(command: T) => {
      const key = freshMediaKey(command.actorUserId);
      return { media: [key], coverKey: key, ...command };
    };
```

- Thay mọi `createUseCase.handle({` thành `createUseCase.handle(withMedia({`, và đóng thêm một ngoặc `)` tương ứng. Lời gọi nào tự truyền `media` thì giữ nguyên, vì phần tự truyền nằm sau spread nên được ưu tiên.

Trong `core/test/charity-contribution.check.ts`: làm tương tự (import, xoá `bannerUrl` trong `baseInput`, thêm tham số thứ tư, thêm `withMedia`, bọc mọi `create.handle({`).

Run: `cd suites/chantam.vn/chantam/core && npx tsc --noEmit -p tsconfig.json`
Expected: không có lỗi. Nếu `tsconfig.json` không bao gồm `test/`, dùng `npx tsc --noEmit test/charity-campaign.check.ts` với cờ của dự án, hoặc chuyển thẳng sang Step 5 để ts-node báo lỗi.

- [ ] **Step 4: Thêm nhóm kiểm media vào `charity-campaign.check.ts`**

Chèn ngay trước `} finally {` cuối `main()`:

```ts
    console.log('\n20. Media chiến dịch — ràng buộc thật và luồng thay cả bộ');

    const { ReplaceCharityMediaUseCase } = await import(
      '../src/application/implementations/charity-campaign/charity-campaign.use-cases'
    );
    const replaceMedia = new ReplaceCharityMediaUseCase(
      repository,
      fakeCampaignMediaStorage(),
    );

    const imageA = freshMediaKey(OrganizerId);
    const videoB = freshMediaKey(OrganizerId, 'mp4');
    const mediaCampaign = await createUseCase.handle({
      ...writeInput({
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'SELF',
        title: 'Kiểm media chiến dịch',
        media: [videoB, imageA],
        coverKey: imageA,
      }),
      actorUserId: OrganizerId,
      asAdmin: false,
    });
    check(
      'tạo kèm media: media theo đúng thứ tự, bìa là ảnh, bannerUrl lấy từ bìa',
      mediaCampaign.media.length === 2 &&
        mediaCampaign.media[0].type === 'VIDEO' &&
        mediaCampaign.media[1].isCover &&
        mediaCampaign.bannerUrl === mediaCampaign.media[1].url,
      JSON.stringify(mediaCampaign.media),
    );
    check(
      'hồ sơ Vàng vào chờ duyệt (điều kiện cho các phép thay bên dưới)',
      mediaCampaign.approvalStatus === 'PENDING_APPROVAL',
      mediaCampaign.approvalStatus,
    );

    // Review Focus 4: gửi lại đúng các key đang có, chỉ đổi thứ tự và bìa.
    const reordered = await replaceMedia.handle({
      campaignId: mediaCampaign.globalId,
      actorUserId: OrganizerId,
      media: [imageA, videoB],
      coverKey: imageA,
    });
    check(
      'thay cả bộ bằng CHÍNH các key cũ (đổi thứ tự) không vướng UNIQUE(storage_key)',
      reordered.media[0].isCover && reordered.media[1].type === 'VIDEO',
      JSON.stringify(reordered.media),
    );

    // Review Focus 2: key của hoạt động khác.
    const other = await createUseCase.handle(
      withMedia({ ...writeInput({ title: 'Hoạt động khác giữ key' }), actorUserId: OrganizerId, asAdmin: false }),
    );
    const otherKey = (
      await dataSource.query<{ storage_key: string }[]>(
        `SELECT storage_key FROM campaign_media WHERE campaign_id = $1`,
        [other.globalId],
      )
    )[0].storage_key;
    await expectThrow(
      'key đã thuộc hoạt động khác → CharityMediaInvalidException, không phải 500',
      () =>
        replaceMedia.handle({
          campaignId: mediaCampaign.globalId,
          actorUserId: OrganizerId,
          media: [otherKey],
          coverKey: otherKey,
        }),
      'CharityMediaInvalidException',
    );

    const memberKey = freshMediaKey(MemberId);
    await expectThrow(
      'người khác (không phải người tạo) không thay được',
      () =>
        replaceMedia.handle({
          campaignId: mediaCampaign.globalId,
          actorUserId: MemberId,
          media: [memberKey],
          coverKey: memberKey,
        }),
      'CharityNotOrganizerException',
    );

    // Review Focus 3: Admin duyệt chen giữa — repository kiểm lại dưới khoá dòng.
    await dataSource.query(
      `UPDATE campaigns SET approval_status = 'APPROVED', approved_at = now(), approved_by = $2
        WHERE global_id = $1`,
      [mediaCampaign.globalId, AdminId],
    );
    await expectThrow(
      'repository.replaceMedia trên hồ sơ đã duyệt → NotEditable (kiểm dưới khoá, không chỉ ở use case)',
      () =>
        repository.replaceMedia({
          campaignId: mediaCampaign.globalId,
          actorUserId: OrganizerId,
          media: [],
          bannerUrl: 'https://cdn.chantam.test/x.webp',
        }),
      'CharityMediaNotEditableException',
    );

    // Ràng buộc database — lớp cuối khi code sai.
    await expectReject(
      'CHECK: bìa là video bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-video-cover', 'https://x/v.mp4', 'VIDEO', 3, true)`,
          [other.globalId],
        ),
      'CHK_campaign_media_cover_is_image',
    );
    await expectReject(
      'UNIQUE: hai bìa trong một hoạt động bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-second-cover', 'https://x/b.webp', 'IMAGE', 3, true)`,
          [other.globalId],
        ),
      'UQ_campaign_media_one_cover',
    );
    await expectReject(
      'CHECK: sort_order ngoài 0..4 bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-order-5', 'https://x/c.webp', 'IMAGE', 5, false)`,
          [other.globalId],
        ),
      'CHK_campaign_media_sort_order',
    );

    // Review Focus 5: hoạt động cũ không có media.
    await dataSource.query(`DELETE FROM campaign_media WHERE campaign_id = $1`, [
      other.globalId,
    ]);
    const legacy = await repository.findByGlobalId(other.globalId);
    check(
      'hoạt động không có dòng media nào: media = [] và bannerUrl giữ nguyên',
      Array.isArray(legacy?.media) &&
        legacy?.media.length === 0 &&
        legacy?.bannerUrl === other.bannerUrl,
      JSON.stringify(legacy?.media),
    );

    check(
      'banner_url http:// (storage dev) được nhận sau khi nới CHECK',
      (
        await dataSource.query<{ ok: boolean }[]>(
          `UPDATE campaigns SET banner_url = 'http://localhost:19000/a.webp'
            WHERE global_id = $1 RETURNING true AS ok`,
          [other.globalId],
        )
      ).length >= 1,
    );
```

Lưu ý thêm:
- Đánh lại số thứ tự nhóm `20.` nếu nhóm cuối hiện có đã mang số khác; xem bằng `grep -n "console.log('\\\\n" test/charity-campaign.check.ts | tail -1`.
- `import()` động ở trên chỉ để đoạn chèn tự đủ. Nếu muốn, có thể thêm `ReplaceCharityMediaUseCase` vào khối import tĩnh ở đầu file.
- `UPDATE ... RETURNING` qua `dataSource.query` bị TypeORM bọc thành `[rows, affected]`, nên `.length >= 1` đúng với cả hai dạng. Phép kiểm này chỉ cần biết câu lệnh không ném lỗi.

- [ ] **Step 5: Chạy hai script**

Run: `cd suites/chantam.vn/chantam/core && npm run test:charity && npm run test:charity-contribution`
Expected: cả hai in `OK` cho mọi dòng và exit 0. Nếu dòng nào `FAIL` thì sửa code ở task tương ứng, không sửa kỳ vọng của script.

- [ ] **Step 6: Commit**

```bash
git add suites/chantam.vn/chantam/core/test/fake-campaign-media-storage.ts suites/chantam.vn/chantam/core/test/charity-campaign.check.ts suites/chantam.vn/chantam/core/test/charity-contribution.check.ts
git commit -m "test(f65b): kiểm media chiến dịch trên Postgres thật"
```

---

### Task 8: Seed, tài liệu, lint

**Files:**
- Modify: `core/src/infrastructure/persistence/seeds/full/charity.ts`
- Modify: `docs/API.md` (bảng quanh dòng 1771 và phần mô tả F65b)
- Modify: `core/README.md`, `system/storage-lib/README.md`
- Regenerate: `docs/API-ERRORS.md`

- [ ] **Step 1: Seed `campaign_media`**

> `seeds/full/` và `seed-full-data.cli.ts` có thể **vẫn đang là thay đổi chưa commit của người dùng** (lúc lập plan chúng còn là untracked). Chạy `git status --short suites/chantam.vn/chantam/core/src/infrastructure/persistence/seeds` trước. Nếu còn `??`, vẫn sửa file nhưng **không stage** nó, và báo lại cho người dùng ở cuối.

Trong `seedCharity` (`full/charity.ts`), ngay sau vòng lặp `for (const item of Campaigns)` chèn `campaigns`, thêm:

```ts
  // Một ảnh bìa cho mỗi hoạt động, trỏ đúng `Banner` đã ghi vào `banner_url`. Key nằm
  // NGOÀI `users/` nên job dọn rác không quét tới — seed không có object R2 thật.
  for (const item of Campaigns)
    await ctx.q(
      `
        INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
        VALUES ($1, $2, $3, 'IMAGE', 0, true)
        ON CONFLICT (storage_key) DO NOTHING
      `,
      [campaign(item.n), `seed/campaign-media/${item.n}.png`, Banner],
    );
```

Run: `cd suites/chantam.vn/chantam/core && npm run test:seed-full`
Expected: PASS, gồm cả "mọi bảng có dòng" (đã có `campaign_media`) và "chạy lại không thêm dòng".

- [ ] **Step 2: Tài liệu**

Trong `docs/API.md`, bảng endpoint F65b (quanh dòng 1771):
- Thêm hai dòng:
  - `| \`POST\` | \`/charity-campaigns/media/upload\` | Bearer | ✅ **Đã chạy.** Xin URL tải ảnh/video (ảnh 5 MB, video 25 MB); key dùng trong lượt tạo hoặc thay media |`
  - `| \`PUT\` | \`/charity-campaigns/:id/media\` | Người tạo | ✅ **Đã chạy.** Thay cả bộ 1–5 media + ảnh bìa, chỉ khi hồ sơ chờ duyệt |`
- Ngay dưới bảng, thêm một gạch đầu dòng: "`POST /charity-campaigns` và `POST /admin/charity-campaigns` **không còn nhận `bannerUrl`**; gửi `media` (1–5 key) và `coverKey`. Response có thêm `media[]`; `bannerUrl` do server ghi từ ảnh bìa."

Trong `core/README.md`: thêm hai endpoint vào bảng API theo đúng định dạng các dòng `/api/v1/...` đang có.

Trong `system/storage-lib/README.md`: thêm `createCampaignMediaUpload` / `confirmCampaignMediaUpload` vào danh sách method, và ghi rằng HeadObject 404 giờ thành `StorageValidationError`.

- [ ] **Step 3: Sinh lại tài liệu lỗi**

Run (ở gốc repo): `npm run docs:errors && npm run docs:errors:check`
Expected: `docs/API-ERRORS.md` có `CHARITY_MEDIA_INVALID` và `CHARITY_MEDIA_NOT_EDITABLE`; lệnh check exit 0.

- [ ] **Step 4: Lint, format, test toàn repo**

Run (ở gốc repo): `npm run lint:check && npm run format:check && npm run test`
Expected: cả ba exit 0. Nếu format báo lỗi ở file đã sửa trong plan này, chạy `npx prettier --write <file>` **chỉ cho file đó**, rồi chạy lại.

- [ ] **Step 5: Commit**

```bash
git add docs/API.md docs/API-ERRORS.md suites/chantam.vn/chantam/core/README.md system/storage-lib/README.md
# Chỉ thêm seeds/full/charity.ts nếu nó ĐÃ được track trước đó (xem Step 1)
git commit -m "docs(f65b): tài liệu media chiến dịch; seed campaign_media"
```

---

## Self-Review (đã chạy khi viết plan)

- **Spec coverage:**
  - D1 → Task 5 (confirm trước, ghi một transaction ở Task 4).
  - D2 và D3 → Task 1 và Task 5.
  - D4 → Task 4 (dưới khoá) và Task 5 (kiểm trước).
  - D5 → Task 4, Task 5, Task 6.
  - D6 → Task 6.
  - Bảng và CHECK → Task 3.
  - Job dọn rác → Task 3.
  - Lỗi mới và lỗi 404 → Task 1 và Task 2.
  - Response `media` → Task 4 và Task 6.
  - Tài liệu → Task 8.
  - Kiểm DB thật → Task 7.
- **Lệch so với spec ban đầu, đã cập nhật lại vào spec:**
  - Thêm cột `public_url`.
  - Nới `CHK_campaigns_banner_url`.
  - Đặt tên lỗi theo nhóm `CHARITY_*`.
  - Dùng `CHARITY_NOT_ORGANIZER` cho người không phải người tạo.
  - HeadObject 404 thành 400.
- **Kiểu nhất quán:**
  - `CharityMediaType` ở Task 1 được dùng ở Task 4.
  - `ICharityCampaignMediaParams` khai ở Task 4, dùng ở Task 5 và Task 7.
  - `confirmCampaignMediaUpload(userId, key)` khai ở Task 2, dùng ở Task 5 và Task 7.
  - `replaceMedia({ campaignId, actorUserId, media, bannerUrl })` khai ở Task 4, dùng ở Task 5 và Task 7.
