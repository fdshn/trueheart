import {
  IConfirmEmailVerificationBodyDto,
  IConfirmEmailVerificationResponseDto,
  IRequestEmailVerificationResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestEmailVerificationCommand {
  userId: string;
}

export interface IRequestEmailVerificationResult extends IRequestEmailVerificationResponseDto {}

export interface IConfirmEmailVerificationCommand extends IConfirmEmailVerificationBodyDto {
  userId: string;
}

export interface IConfirmEmailVerificationResult extends IConfirmEmailVerificationResponseDto {}

export interface IRequestEmailVerificationUseCase extends IUseCase<
  IRequestEmailVerificationCommand,
  IRequestEmailVerificationResult
> {}

export interface IConfirmEmailVerificationUseCase extends IUseCase<
  IConfirmEmailVerificationCommand,
  IConfirmEmailVerificationResult
> {}

export const IRequestEmailVerificationUseCase = Symbol(
  'IRequestEmailVerificationUseCase',
);
export const IConfirmEmailVerificationUseCase = Symbol(
  'IConfirmEmailVerificationUseCase',
);
