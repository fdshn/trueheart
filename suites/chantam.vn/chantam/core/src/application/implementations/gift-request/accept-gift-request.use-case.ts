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
      `/posts/${command.postId}/transactions/${command.requestId}/${Date.now()}`,
    );

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
      await manager.save(post);
    });

    return {
      requestId: command.requestId,
      postId: command.postId,
      status: GiftRequestStatuses.ACCEPTED,
      transactionId,
    };
  }
}
