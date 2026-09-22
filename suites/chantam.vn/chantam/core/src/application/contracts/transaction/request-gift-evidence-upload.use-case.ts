import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestGiftEvidenceUploadCommand {
  /** Người gọi, luôn lấy từ token đã xác thực. Phải là một trong hai bên. */
  userId: string;
  transactionId: string;
  contentType: string;
  contentLength: number;
}

export interface IRequestGiftEvidenceUploadResult {
  upload: {
    key: string;
    uploadUrl: string;
    expiresInSeconds: number;
    publicUrl: string;
  };
}

export interface IRequestGiftEvidenceUploadUseCase extends IUseCase<
  IRequestGiftEvidenceUploadCommand,
  IRequestGiftEvidenceUploadResult
> {}

export const IRequestGiftEvidenceUploadUseCase = Symbol(
  'IRequestGiftEvidenceUploadUseCase',
);
