import {
  ILoginBodyDto,
  ILoginResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ILoginUserCommand extends ILoginBodyDto {}
export interface ILoginUserResult extends ILoginResponseDto {}

export interface ILoginUserUseCase extends IUseCase<
  ILoginUserCommand,
  ILoginUserResult
> {}

export const ILoginUserUseCase = Symbol('ILoginUserUseCase');
