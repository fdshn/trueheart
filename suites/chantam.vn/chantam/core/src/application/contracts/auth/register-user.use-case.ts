import {
  IRegisterBodyDto,
  IRegisterResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRegisterUserCommand extends IRegisterBodyDto {
  /**
   * Địa chỉ IP của người gọi, do controller lấy từ request.
   *
   * KHÔNG nhận từ body: tin body thì ai cũng tự khai một IP khác mỗi lần gọi và
   * mọi cái trần theo nguồn gọi thành vô nghĩa.
   */
  clientIp: string;
}
export interface IRegisterUserResult extends IRegisterResponseDto {}

export interface IRegisterUserUseCase extends IUseCase<
  IRegisterUserCommand,
  IRegisterUserResult
> {}

export const IRegisterUserUseCase = Symbol('IRegisterUserUseCase');
