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
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

@Injectable()
export class AcceptGiftRequestUseCase implements IAcceptGiftRequestUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
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
      throw new ForbiddenException();
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

    const { transactionId: finalTransactionId } =
      await this.giftRequestRepository.acceptRequest({
        requestId: command.requestId,
        postId: command.postId,
        giverId: command.userId,
        transactionId,
      });

    // SAU khi lượt trao đã ghi. Người xin đang chờ biết mình có được chọn không.
    await this.acceptedNotifier.announce({
      receiverId: targetRequest.requesterId,
      giverId: command.userId,
      postId: command.postId,
      transactionId: finalTransactionId,
      // Chủ bài tự bấm, nên KHÔNG báo lại cho họ — xem `notifyGiverIfPassive`.
      trigger: 'MANUAL',
    });

    return {
      requestId: command.requestId,
      postId: command.postId,
      status: GiftRequestStatuses.ACCEPTED,
      transactionId: finalTransactionId,
    };
  }
}
