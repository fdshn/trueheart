import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateGiftRequestCommand {
  postId: string;
  requesterId: string;
  message: string;
  /**
   * Bài Muốn Tặng mang ra, chỉ có khi lời tặng đi qua `OfferGiftUseCase`.
   *
   * Use case này KHÔNG tự kiểm nó — người gọi đã kiểm quyền sở hữu, loại bài và
   * trạng thái công khai. Đặt ở đây để đường tạo yêu cầu vẫn là MỘT đường duy
   * nhất: hạn mức yêu cầu đang mở, cổng hồ sơ, chống trùng và thông báo đều chỉ
   * được viết một lần.
   */
  offeringPostId?: string | null;
}

export interface ICreateGiftRequestResult {
  request: IGiftRequestDto;
}

export type ICreateGiftRequestUseCase = IUseCase<
  ICreateGiftRequestCommand,
  ICreateGiftRequestResult
>;

export const ICreateGiftRequestUseCase = Symbol('ICreateGiftRequestUseCase');
