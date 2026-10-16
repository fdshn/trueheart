import { IMediaAsset } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';
import { IStorageUploadResult } from '@chantam/service.storage-lib';

/**
 * Thư viện ảnh chung của CMS (CMS A2).
 *
 * Ba bước như mọi đường tải khác: xin URL → PUT lên R2 → xác nhận. Khác ở chỗ ảnh xác
 * nhận xong vào THƯ VIỆN chứ không gắn vào một bản ghi cụ thể — Admin dán `publicUrl`
 * vào ô ảnh nào cũng được, và chọn lại được ở lần sau.
 */
export interface IRequestCmsMediaUploadCommand {
  readonly actorUserId: string;
  readonly contentType: string;
  readonly contentLength: number;
}

export interface IRequestCmsMediaUploadUseCase extends IUseCase<
  IRequestCmsMediaUploadCommand,
  IStorageUploadResult
> {}

export const IRequestCmsMediaUploadUseCase = Symbol(
  'IRequestCmsMediaUploadUseCase',
);

export interface IConfirmCmsMediaCommand {
  readonly actorUserId: string;
  readonly key: string;
  readonly fileName?: string;
}

export interface IConfirmCmsMediaUseCase extends IUseCase<
  IConfirmCmsMediaCommand,
  { readonly asset: IMediaAsset }
> {}

export const IConfirmCmsMediaUseCase = Symbol('IConfirmCmsMediaUseCase');

export interface IListCmsMediaCommand {
  readonly actorUserId: string;
  readonly keyword?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface IListCmsMediaResult {
  readonly assets: IMediaAsset[];
  readonly meta: PaginationMetaDto;
}

export interface IListCmsMediaUseCase extends IUseCase<
  IListCmsMediaCommand,
  IListCmsMediaResult
> {}

export const IListCmsMediaUseCase = Symbol('IListCmsMediaUseCase');
