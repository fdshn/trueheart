import {
  IGetGiftPostParamsDto,
  IGetGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Không có trường nào ngoài `giftPostId`, và đó là chủ đích.
 *
 * `GET /gift-posts/:id` là `@Public()` nên không có danh tính người gọi để suy ra bất kỳ
 * quy tắc riêng tư nào. Bản trước 01/10 có một `canViewExactLocation` không bao giờ
 * true được — đã bỏ, xem ghi chú trong `GetGiftPostUseCase`.
 */
export interface IGetGiftPostCommand extends IGetGiftPostParamsDto {}

export interface IGetGiftPostResult extends IGetGiftPostResponseDto {}

export interface IGetGiftPostUseCase extends IUseCase<
  IGetGiftPostCommand,
  IGetGiftPostResult
> {}

export const IGetGiftPostUseCase = Symbol('IGetGiftPostUseCase');
