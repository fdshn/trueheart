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

/**
 * Âm thanh CMS (bản tụng kinh, bài giảng Phật pháp): cùng ba bước, tiền tố riêng
 * `users/<adminId>/cms-audio/`, mp3/m4a/aac tối đa 50 MB. Không vào thư viện ảnh — URL đi
 * thẳng vào `audioUrl` của nội dung Phật pháp, và chính nội dung đó giữ tệp khỏi job dọn rác.
 * Chỉ `dharma.manage`.
 */
export interface IRequestCmsAudioUploadUseCase extends IUseCase<
  IRequestCmsMediaUploadCommand,
  IStorageUploadResult
> {}
export const IRequestCmsAudioUploadUseCase = Symbol(
  'IRequestCmsAudioUploadUseCase',
);

export interface ICmsAudio {
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly contentType: string;
}
export interface IConfirmCmsAudioUseCase extends IUseCase<
  { readonly actorUserId: string; readonly key: string },
  { readonly audio: ICmsAudio }
> {}
export const IConfirmCmsAudioUseCase = Symbol('IConfirmCmsAudioUseCase');
