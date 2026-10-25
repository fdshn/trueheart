import {
  IGetOwnProfileResponseDto,
  IGetPublicProfileResponseDto,
  IRequestIntroVideoUploadDto,
  IUpdateOwnProfileBodyDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
import { IStorageUploadResult } from '@chantam/service.storage-lib';

export interface IGetOwnProfileCommand {
  userId: string;
}
export interface IUpdateOwnProfileCommand extends IUpdateOwnProfileBodyDto {
  userId: string;
}
export interface IGetPublicProfileCommand {
  username: string;
}
export interface IGetOwnProfileUseCase extends IUseCase<
  IGetOwnProfileCommand,
  IGetOwnProfileResponseDto
> {}
export interface IUpdateOwnProfileUseCase extends IUseCase<
  IUpdateOwnProfileCommand,
  IUpdateOwnProfileResponseDto
> {}
export interface IGetPublicProfileUseCase extends IUseCase<
  IGetPublicProfileCommand,
  IGetPublicProfileResponseDto
> {}
export const IGetOwnProfileUseCase = Symbol('IGetOwnProfileUseCase');
export const IUpdateOwnProfileUseCase = Symbol('IUpdateOwnProfileUseCase');
export const IGetPublicProfileUseCase = Symbol('IGetPublicProfileUseCase');

export interface IRequestIntroVideoUploadCommand extends IRequestIntroVideoUploadDto {
  userId: string;
}

/** Presigned PUT cho clip giới thiệu hoặc ảnh bìa của nó (PR #46 §3.3). */
export interface IRequestIntroVideoUploadUseCase extends IUseCase<
  IRequestIntroVideoUploadCommand,
  IStorageUploadResult
> {}

export const IRequestIntroVideoUploadUseCase = Symbol(
  'IRequestIntroVideoUploadUseCase',
);
