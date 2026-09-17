import {
  IGetOwnProfileResponseDto,
  IGetPublicProfileResponseDto,
  IUpdateOwnProfileBodyDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

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
