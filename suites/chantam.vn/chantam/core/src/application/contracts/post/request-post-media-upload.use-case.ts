import { IUseCase } from '@chantam/service.common-lib';
import {
  IPostMediaUploadRequest,
  IStorageUploadResult,
} from '@chantam/service.storage-lib';

export interface IRequestPostMediaUploadCommand extends IPostMediaUploadRequest {}

export interface IRequestPostMediaUploadUseCase extends IUseCase<
  IRequestPostMediaUploadCommand,
  IStorageUploadResult
> {}

export const IRequestPostMediaUploadUseCase = Symbol(
  'IRequestPostMediaUploadUseCase',
);
