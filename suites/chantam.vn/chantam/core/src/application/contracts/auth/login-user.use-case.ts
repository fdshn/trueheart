import {
  ILoginBodyDto,
  ILoginResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ILoginUserCommand extends ILoginBodyDto {
  /**
   * Địa chỉ IP của người gọi, do controller lấy từ request.
   *
   * KHÔNG nhận từ body: tin body thì ai cũng tự khai một IP khác mỗi lần gọi và
   * mọi cái trần theo nguồn gọi thành vô nghĩa.
   */
  clientIp: string;
}
export interface ILoginUserResult extends ILoginResponseDto {}

export interface ILoginUserUseCase extends IUseCase<
  ILoginUserCommand,
  ILoginUserResult
> {}

export const ILoginUserUseCase = Symbol('ILoginUserUseCase');
