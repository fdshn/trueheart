import {
  IStorageUploadRequest,
  IStorageUploadResult,
} from '@chantam/service.storage-lib';

export interface IRequestAvatarUploadCommand extends IStorageUploadRequest {}
export interface IRequestAvatarUploadUseCase {
  handle(command: IRequestAvatarUploadCommand): Promise<IStorageUploadResult>;
}
export const IRequestAvatarUploadUseCase = Symbol(
  'IRequestAvatarUploadUseCase',
);
