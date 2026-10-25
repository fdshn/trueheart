import {
  IRequestIntroVideoUploadCommand,
  IRequestIntroVideoUploadUseCase,
} from '@/application/contracts/profile';
import {
  IObjectStorage,
  IStorageUploadResult,
} from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';

/**
 * Presigned PUT cho clip giới thiệu (`VIDEO`) hoặc ảnh bìa của nó (`THUMBNAIL`).
 *
 * Máy chủ không nhận file và không nhận URL tuỳ ý: client PUT lên storage rồi gửi `key` trong
 * `PATCH /profile/me`, nơi key được HeadObject xác nhận đúng chủ, đúng loại, đúng trần.
 * Ảnh bìa do client tạo — server không transcode video.
 */
@Injectable()
export class RequestIntroVideoUploadUseCase implements IRequestIntroVideoUploadUseCase {
  public constructor(
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestIntroVideoUploadCommand,
  ): Promise<IStorageUploadResult> {
    const request = {
      userId: command.userId,
      contentType: command.contentType,
      contentLength: command.contentLength,
    };
    return withStorageValidation('upload', () =>
      command.kind === 'VIDEO'
        ? this.storage.createIntroVideoUpload(request)
        : this.storage.createIntroThumbnailUpload(request),
    );
  }
}
