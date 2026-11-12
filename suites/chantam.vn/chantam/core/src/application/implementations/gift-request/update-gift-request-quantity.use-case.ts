import {
  IUpdateGiftRequestQuantityCommand,
  IUpdateGiftRequestQuantityResult,
  IUpdateGiftRequestQuantityUseCase,
} from '@/application/contracts/gift-request';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { toGiftRequestDto } from './gift-request.mapper';

/**
 * Người xin GIẢM số lượng request đang chờ (12/11).
 *
 * Đường ra của request STANDBY vì `INSUFFICIENT_QUANTITY`: bài còn 2 mà người này xin 8 thì họ
 * chọn giảm xuống ≤ 2, rút, hoặc chờ hàng hoàn về. Giảm xong mà vừa số còn lại thì request về
 * PENDING và GIỮ chỗ cũ trong hàng — không phạt người chịu nhường. Không cho tăng: tăng là một
 * cam kết khác, đi đường rút rồi gửi lại.
 *
 * Kiểm và ghi trong một transaction dưới khoá dòng (repository), cùng thứ tự khoá với đường duyệt.
 */
@Injectable()
export class UpdateGiftRequestQuantityUseCase implements IUpdateGiftRequestQuantityUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
  ) {}

  public async handle(
    command: IUpdateGiftRequestQuantityCommand,
  ): Promise<IUpdateGiftRequestQuantityResult> {
    const updated = await this.giftRequestRepository.updateRequestedQuantity({
      postId: command.postId,
      requesterId: command.requesterId,
      requestedQuantity: command.requestedQuantity,
    });
    return { request: toGiftRequestDto(updated) };
  }
}
