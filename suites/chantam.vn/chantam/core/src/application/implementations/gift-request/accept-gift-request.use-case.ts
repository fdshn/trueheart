import {
  IAcceptGiftRequestCommand,
  IAcceptGiftRequestResult,
  IAcceptGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  GiftRequestNotFoundException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftRequestEntity } from '@/infrastructure/entity';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AcceptGiftRequestUseCase implements IAcceptGiftRequestUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
  ) {}

  public async handle(
    command: IAcceptGiftRequestCommand,
  ): Promise<IAcceptGiftRequestResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });

    if (!post || post.deletedAt) {
      throw new PostNotFoundException(command.postId);
    }

    if (post.authorId !== command.userId) {
      throw new ForbiddenException(
        'Chỉ người đăng bài mới có quyền duyệt người xin nhận',
      );
    }

    if (post.status !== GiftPostStatuses.PUBLISHED) {
      throw new PostInvalidStateException();
    }

    const targetRequest = await this.giftRequestRepository.findOneBy({
      globalId: command.requestId,
    } as never);

    if (
      !targetRequest ||
      targetRequest.postId !== command.postId ||
      targetRequest.status !== GiftRequestStatuses.PENDING
    ) {
      throw new GiftRequestNotFoundException(command.requestId);
    }

    const transactionId = makeGlobalId(
      `/transactions/${command.postId}/${targetRequest.requesterId}/${Date.now()}`,
    );
    let finalTransactionId = transactionId;

    await this.giftRequestRepository.manager.transaction(async (manager) => {
      targetRequest.status = GiftRequestStatuses.ACCEPTED;
      await manager.save(targetRequest);

      await manager
        .createQueryBuilder()
        .update(GiftRequestEntity)
        .set({ status: GiftRequestStatuses.REJECTED as never })
        .where('post_id = :postId', { postId: command.postId })
        .andWhere('global_id != :requestId', { requestId: command.requestId })
        .andWhere('status = :status', { status: GiftRequestStatuses.PENDING })
        .execute();

      post.status = 'DELIVERING' as never;
      if (Number(post.remainingQuantity) > 0) {
        post.remainingQuantity = Number(post.remainingQuantity) - 1;
      }
      await manager.save(post);

      if (typeof manager.query === 'function') {
        const existingTx = await manager.query<{ global_id: string }[]>(
          `SELECT global_id FROM gift_transactions WHERE post_id = $1 AND receiver_id = $2 AND status IN ('REQUESTED', 'ACCEPTED', 'DELIVERING')`,
          [command.postId, targetRequest.requesterId],
        );

        if (existingTx && existingTx.length > 0) {
          finalTransactionId = existingTx[0].global_id;
          await manager.query(
            `UPDATE gift_transactions SET status = 'ACCEPTED', accepted_at = now() WHERE global_id = $1`,
            [finalTransactionId],
          );
        } else {
          await manager.query(
            `
              INSERT INTO gift_transactions
                (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
              VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())
            `,
            [transactionId, command.postId, command.userId, targetRequest.requesterId],
          );
        }
      }
    });

    return {
      requestId: command.requestId,
      postId: command.postId,
      status: GiftRequestStatuses.ACCEPTED,
      transactionId: finalTransactionId,
    };
  }
}
