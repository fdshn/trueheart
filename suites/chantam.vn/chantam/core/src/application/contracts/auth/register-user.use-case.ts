import {
  IRegisterBodyDto,
  IRegisterResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRegisterUserCommand extends IRegisterBodyDto {}
export interface IRegisterUserResult extends IRegisterResponseDto {}

export interface IRegisterUserUseCase extends IUseCase<
  IRegisterUserCommand,
  IRegisterUserResult
> {}

export const IRegisterUserUseCase = Symbol('IRegisterUserUseCase');
