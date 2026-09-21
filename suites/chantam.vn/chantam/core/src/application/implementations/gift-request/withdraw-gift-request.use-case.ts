import {
  IWithdrawGiftRequestCommand,
  IWithdrawGiftRequestResult,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { GiftRequestNotFoundException } from '@/domain/exceptions';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
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
    const existing = await this.giftRequestRepository.findByPostAndRequester(
      command.postId,
      command.requesterId,
    );

    if (!existing || existing.status !== GiftRequestStatuses.PENDING) {
      throw new GiftRequestNotFoundException(command.postId);
    }

    existing.status = GiftRequestStatuses.WITHDRAWN;
    existing.withdrawnAt = new Date();

    await this.giftRequestRepository.save(existing);
    return { request: toGiftRequestDto(existing) };
  }
}
