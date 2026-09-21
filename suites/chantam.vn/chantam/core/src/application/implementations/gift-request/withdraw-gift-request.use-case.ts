import {
  IWithdrawGiftRequestCommand,
  IWithdrawGiftRequestResult,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { GiftRequestNotFoundException } from '@/domain/exceptions';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { toGiftRequestDto } from './gift-request.mapper';

@Injectable()
export class WithdrawGiftRequestUseCase implements IWithdrawGiftRequestUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
  ) {}

  public async handle(
    command: IWithdrawGiftRequestCommand,
  ): Promise<IWithdrawGiftRequestResult> {
    // Để database tự quyết bằng `WHERE status = 'PENDING'`, không đọc-rồi-ghi:
    // một lượt duyệt commit xen vào giữa sẽ bị câu ghi ở đây đè mất, để lại
    // giao dịch đang sống gắn với yêu cầu mang trạng thái WITHDRAWN.
    const withdrawn = await this.giftRequestRepository.withdrawIfPending(
      command.postId,
      command.requesterId,
    );

    if (!withdrawn) throw new GiftRequestNotFoundException(command.postId);

    return { request: toGiftRequestDto(withdrawn) };
  }
}
