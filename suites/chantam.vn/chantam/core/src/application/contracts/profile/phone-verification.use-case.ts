import {
  IConfirmPhoneVerificationBodyDto,
  IConfirmPhoneVerificationResponseDto,
  IRequestPhoneVerificationResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestPhoneVerificationCommand {
  userId: string;
}
export interface IRequestPhoneVerificationResult extends IRequestPhoneVerificationResponseDto {}
export interface IConfirmPhoneVerificationCommand extends IConfirmPhoneVerificationBodyDto {
  userId: string;
}
export interface IConfirmPhoneVerificationResult extends IConfirmPhoneVerificationResponseDto {}
export interface IRequestPhoneVerificationUseCase extends IUseCase<
  IRequestPhoneVerificationCommand,
  IRequestPhoneVerificationResult
> {}
export interface IConfirmPhoneVerificationUseCase extends IUseCase<
  IConfirmPhoneVerificationCommand,
  IConfirmPhoneVerificationResult
> {}
export const IRequestPhoneVerificationUseCase = Symbol(
  'IRequestPhoneVerificationUseCase',
);
export const IConfirmPhoneVerificationUseCase = Symbol(
  'IConfirmPhoneVerificationUseCase',
);
