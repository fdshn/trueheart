import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { StorageValidationError } from '@chantam/service.storage-lib';
import {
  ConfirmCmsMediaUseCase,
  ListCmsMediaUseCase,
  RequestCmsMediaUploadUseCase,
} from './cms-media.use-cases';

const AdminId = '10000000-0000-4000-8000-000000000001';
const Key = `users/${AdminId}/cms-media/a.webp`;

function makeDeps(granted: string[] = ['blog.manage']) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_id: string, code: string) =>
        granted.includes(code),
      ),
    },
    storage: {
      createCmsMediaUpload: jest.fn(async () => ({
        key: Key,
        uploadUrl: 'https://r2.test/put',
        expiresInSeconds: 300,
        publicUrl: `https://cdn.test/${Key}`,
      })),
      confirmCmsMediaUpload: jest.fn(async () => ({
        contentType: 'image/webp',
        publicUrl: `https://cdn.test/${Key}`,
      })),
    },
    assets: {
      register: jest.fn(async (params: Record<string, unknown>) => ({
        globalId: 'asset-1',
        ...params,
      })),
      list: jest.fn(async () => ({ items: [], total: 3 })),
    },
  };
}

describe('CMS media library (CMS A2)', () => {
  it('không có quyền soạn nội dung nào thì 403, không chạm R2', async () => {
    const deps = makeDeps(['report.read']);
    await expect(
      new RequestCmsMediaUploadUseCase(
        deps.permissions as never,
        deps.storage as never,
      ).handle({
        actorUserId: AdminId,
        contentType: 'image/webp',
        contentLength: 10,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.storage.createCmsMediaUpload).not.toHaveBeenCalled();
  });

  it.each(['banner.manage', 'blog.manage', 'campaign.manage', 'dharma.manage'])(
    'một mình %s là đủ',
    async (code) => {
      const deps = makeDeps([code]);
      await expect(
        new RequestCmsMediaUploadUseCase(
          deps.permissions as never,
          deps.storage as never,
        ).handle({
          actorUserId: AdminId,
          contentType: 'image/webp',
          contentLength: 10,
        }),
      ).resolves.toMatchObject({ key: Key });
    },
  );

  it('lỗi chính sách của R2 thành 400, không phải 500', async () => {
    const deps = makeDeps();
    deps.storage.createCmsMediaUpload.mockRejectedValueOnce(
      new StorageValidationError('chỉ nhận ảnh'),
    );
    await expect(
      new RequestCmsMediaUploadUseCase(
        deps.permissions as never,
        deps.storage as never,
      ).handle({
        actorUserId: AdminId,
        contentType: 'video/mp4',
        contentLength: 10,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('xác nhận theo tiền tố CỦA NGƯỜI GỌI rồi mới ghi vào thư viện', async () => {
    const deps = makeDeps();
    const result = await new ConfirmCmsMediaUseCase(
      deps.permissions as never,
      deps.storage as never,
      deps.assets as never,
    ).handle({
      actorUserId: AdminId,
      key: Key,
      fileName: '  bia-vu-lan.webp ',
    });

    expect(deps.storage.confirmCmsMediaUpload).toHaveBeenCalledWith(
      AdminId,
      Key,
    );
    expect(deps.assets.register).toHaveBeenCalledWith({
      storageKey: Key,
      publicUrl: `https://cdn.test/${Key}`,
      contentType: 'image/webp',
      fileName: 'bia-vu-lan.webp',
      uploadedBy: AdminId,
    });
    expect(result.asset).toMatchObject({ globalId: 'asset-1' });
  });

  it('key không xác nhận được thì KHÔNG ghi gì vào thư viện', async () => {
    const deps = makeDeps();
    deps.storage.confirmCmsMediaUpload.mockRejectedValueOnce(
      new StorageValidationError('không thuộc chủ thể hiện tại'),
    );
    await expect(
      new ConfirmCmsMediaUseCase(
        deps.permissions as never,
        deps.storage as never,
        deps.assets as never,
      ).handle({ actorUserId: AdminId, key: 'users/other/cms-media/x.webp' }),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.assets.register).not.toHaveBeenCalled();
  });

  it('danh sách phân trang, keyword trắng thành không lọc', async () => {
    const deps = makeDeps();
    const result = await new ListCmsMediaUseCase(
      deps.permissions as never,
      deps.assets as never,
    ).handle({ actorUserId: AdminId, keyword: '  ', page: 2, pageSize: 10 });

    expect(deps.assets.list).toHaveBeenCalledWith({
      keyword: null,
      skip: 10,
      take: 10,
    });
    expect(result.meta).toMatchObject({ page: 2, total: 3 });
  });
});
