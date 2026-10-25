import {
  IAcceptGiftRequestCommand,
  IAcceptGiftRequestResult,
  IAcceptGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  GiftRequestNotFoundException,
  PostInvalidStateException,
  PostNotFoundException,
  SelectRequesterNotAllowedException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

/**
 * Mã capability cho quyền CHỌN TAY người nhận (CHỐT-10).
 *
 * Tới 10/10 capability này đã seed đủ năm bậc mà **không chỗ nào đọc**, nên mọi chủ
 * bài đều chọn tay được — kể cả Người xem. Nó nằm trong `DeclaredButUnread` của
 * `test:entitlement-inventory` với đúng lý do đó.
 *
 * Đọc `allowed` chứ KHÔNG đọc `limit`: CHỐT-10 cấp hoặc không cấp **quyền**, và không
 * nói con số nào. `1799500000000` vì thế đặt `limit_value` về 0 và
 * `CapabilityKindByCode` khai nó là `GATE`.
 *
 * Kiểm bằng Rank **hiện tại từ database** — `getCapability` tra bậc từ bảng `users`,
 * không đọc Rank trong token. Đặc tả nói thẳng điều đó, và nó có lý: token sống tới
 * hạn refresh, nên một người vừa tụt hạng vẫn mang Rank cũ trong tay.
 */
const SelectRequesterCapability = 'SELECT_REQUESTER';

import { assertClassifiedTransactionsAllowed } from '../shared/classified-guard';
@Injectable()
export class AcceptGiftRequestUseCase implements IAcceptGiftRequestUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
    @Optional()
    @Inject(IAdminConfigRepository)
    private readonly adminConfig?: IAdminConfigRepository,
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

    // Duyệt yêu cầu là tạo lượt trao — Rao vặt không tạo lượt trao mới, kể cả từ yêu cầu
    // còn tồn từ trước (PR #46 §8).
    await assertClassifiedTransactionsAllowed(post, this.adminConfig);

    if (post.status !== GiftPostStatuses.PUBLISHED) {
      throw new PostInvalidStateException();
    }

    // Quyền chọn tay kiểm TRƯỚC khi đọc yêu cầu: không có quyền thì việc yêu cầu đó
    // có tồn tại hay không cũng không còn liên quan, và trả `GiftRequestNotFound`
    // trước `Forbidden` là tiết lộ có/không một id.
    const selectCapability = await this.entitlementRepository.getCapability(
      command.userId,
      SelectRequesterCapability,
    );
    if (!selectCapability?.allowed) {
      throw new SelectRequesterNotAllowedException();
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
        actorUserId: command.userId,
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
