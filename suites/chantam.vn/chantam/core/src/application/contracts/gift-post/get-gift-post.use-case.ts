import {
  IGetGiftPostParamsDto,
  IGetGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetGiftPostCommand extends IGetGiftPostParamsDto {
  /**
   * `true` khi người gọi đã được duyệt nhận món đồ này và được phép thấy toạ độ
   * chính xác (đặc tả mục 1.3).
   *
   * Hiện luôn là `false` vì chưa có xác thực. Khi có `auth-lib`, giá trị này
   * được suy ra từ trạng thái đơn xin của người gọi, KHÔNG lấy từ client.
   */
  canViewExactLocation?: boolean;
}

export interface IGetGiftPostResult extends IGetGiftPostResponseDto {}

export interface IGetGiftPostUseCase extends IUseCase<
  IGetGiftPostCommand,
  IGetGiftPostResult
> {}

export const IGetGiftPostUseCase = Symbol('IGetGiftPostUseCase');
