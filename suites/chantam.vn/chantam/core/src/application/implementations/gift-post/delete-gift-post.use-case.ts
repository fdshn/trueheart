import {
  IDeleteGiftPostCommand,
  IDeleteGiftPostResult,
  IDeleteGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { GiftPostNotFoundException } from '@/domain/exceptions';
import { IGiftPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DeleteGiftPostUseCase implements IDeleteGiftPostUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
  ) {}

  public async handle(
    command: IDeleteGiftPostCommand,
  ): Promise<IDeleteGiftPostResult> {
    const existing = await this.giftPostRepository.findOneBy({
      globalId: command.giftPostId,
    });

    if (!existing || existing.deletedAt)
      throw new GiftPostNotFoundException(command.giftPostId);

    if (existing.giverId !== command.userId) throw new ForbiddenException();

    // Xoá mềm, không xoá thật: lịch sử giao dịch và đơn xin đồ vẫn phải resolve
    // được về bài đăng này (xem PostgresSoftDeletableEntity).
    const deletedAt = new Date();

    await this.giftPostRepository.update(
      { globalId: command.giftPostId },
      { deletedAt, status: GiftPostStatuses.CANCELLED },
    );

    return { giftPostId: command.giftPostId, deletedAt };
  }
}
