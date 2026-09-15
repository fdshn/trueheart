import {
  IConfirmPasswordResetBodyDto,
  IConfirmPasswordResetResponseDto,
  IRequestPasswordResetBodyDto,
  IRequestPasswordResetResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestPasswordResetCommand extends IRequestPasswordResetBodyDto {}
export interface IRequestPasswordResetResult extends IRequestPasswordResetResponseDto {}

export interface IRequestPasswordResetUseCase extends IUseCase<
  IRequestPasswordResetCommand,
  IRequestPasswordResetResult
> {}

export const IRequestPasswordResetUseCase = Symbol(
  'IRequestPasswordResetUseCase',
);

export interface IConfirmPasswordResetCommand extends IConfirmPasswordResetBodyDto {}
export interface IConfirmPasswordResetResult extends IConfirmPasswordResetResponseDto {}

export interface IConfirmPasswordResetUseCase extends IUseCase<
  IConfirmPasswordResetCommand,
  IConfirmPasswordResetResult
> {}

export const IConfirmPasswordResetUseCase = Symbol(
  'IConfirmPasswordResetUseCase',
);
