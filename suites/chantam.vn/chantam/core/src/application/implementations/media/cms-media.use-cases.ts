import {
  IConfirmCmsMediaCommand,
  IConfirmCmsMediaUseCase,
  IListCmsMediaCommand,
  IListCmsMediaResult,
  IListCmsMediaUseCase,
  IRequestCmsMediaUploadCommand,
  IRequestCmsMediaUploadUseCase,
} from '@/application/contracts/media';
import {
  IAdminConfigRepository,
  IMediaAsset,
  IMediaAssetRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  IObjectStorage,
  IStorageUploadResult,
} from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';

/**
 * Ai soạn được nội dung có ảnh thì dùng được thư viện: bốn màn CMS cần ảnh có bốn mã
 * quyền khác nhau. Thêm một mã riêng là seed một dòng `admin_permissions` chưa chắc vai
 * nào được gán.
 */
const ContentManagePermissions = [
  'banner.manage',
  'blog.manage',
  'campaign.manage',
  'dharma.manage',
] as const;

async function assertContentEditor(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  for (const code of ContentManagePermissions)
    if (await permissions.hasPermission(actorUserId, code)) return;
  throw new ForbiddenException();
}

@Injectable()
export class RequestCmsMediaUploadUseCase implements IRequestCmsMediaUploadUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestCmsMediaUploadCommand,
  ): Promise<IStorageUploadResult> {
    await assertContentEditor(this.permissions, command.actorUserId);

    return withStorageValidation('upload', () =>
      this.storage.createCmsMediaUpload({
        userId: command.actorUserId,
        contentType: command.contentType,
        contentLength: command.contentLength,
      }),
    );
  }
}

@Injectable()
export class ConfirmCmsMediaUseCase implements IConfirmCmsMediaUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IMediaAssetRepository)
    private readonly assets: IMediaAssetRepository,
  ) {}

  public async handle(
    command: IConfirmCmsMediaCommand,
  ): Promise<{ asset: IMediaAsset }> {
    await assertContentEditor(this.permissions, command.actorUserId);

    // HeadObject kiểm tiền tố CỦA NGƯỜI GỌI, loại và cỡ — key của Admin khác hay của
    // người dùng thường không xác nhận được qua đường này.
    const confirmed = await withStorageValidation('media.key', () =>
      this.storage.confirmCmsMediaUpload(command.actorUserId, command.key),
    );

    return {
      asset: await this.assets.register({
        storageKey: command.key,
        publicUrl: confirmed.publicUrl,
        contentType: confirmed.contentType,
        fileName: command.fileName?.trim() || null,
        uploadedBy: command.actorUserId,
      }),
    };
  }
}

@Injectable()
export class ListCmsMediaUseCase implements IListCmsMediaUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IMediaAssetRepository)
    private readonly assets: IMediaAssetRepository,
  ) {}

  public async handle(
    command: IListCmsMediaCommand,
  ): Promise<IListCmsMediaResult> {
    await assertContentEditor(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.assets.list({
      keyword: command.keyword?.trim() || null,
      skip,
      take,
    });

    return {
      assets: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
