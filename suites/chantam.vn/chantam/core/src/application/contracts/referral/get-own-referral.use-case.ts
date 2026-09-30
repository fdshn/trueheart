import { IGetOwnReferralResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnReferralCommand {
  userId: string;
}

/**
 * Dùng thẳng DTO của `core-lib` thay vì khai lại một bản sao ở đây.
 *
 * Bản sao cũ đứng im khi bản thật thêm trường: 30/09 thêm `invitees` vào DTO và chỗ
 * này vẫn biên dịch được, chỉ đổ ở controller — tức hai hình dạng cùng tên cùng lúc.
 */
export interface IGetOwnReferralResult extends IGetOwnReferralResponseDto {}

export interface IGetOwnReferralUseCase extends IUseCase<
  IGetOwnReferralCommand,
  IGetOwnReferralResult
> {}

export const IGetOwnReferralUseCase = Symbol('IGetOwnReferralUseCase');
