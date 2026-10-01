import {
  IListMyGiftRequestsCommand,
  IListMyGiftRequestsResult,
  IListMyGiftRequestsUseCase,
  IRejectGiftRequestCommand,
  IRejectGiftRequestResult,
  IRejectGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  GiftRequestNotFoundException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { toGiftRequestDto } from './gift-request.mapper';
import { RequestLifecycleNotifier } from './request-lifecycle.notifier';

/**
 * Bài ở những trạng thái này thì không còn nhận yêu cầu nữa.
 *
 * Dùng để bật nhãn "đã đóng" trên từng dòng. Client tự suy từ `postStatus`
 * cũng được, nhưng như thế là bắt mỗi client cài lại đúng danh sách này, và
 * chỗ nào cài sót sẽ hiện nút "rút yêu cầu" cho một bài đã biến mất.
 */
const ClosedPostStatuses: readonly GiftPostStatuses[] = [
  GiftPostStatuses.EXPIRED,
  GiftPostStatuses.CANCELLED,
  GiftPostStatuses.REJECTED,
  GiftPostStatuses.COMPLETED,
  GiftPostStatuses.ARCHIVED,
];

@Injectable()
export class ListMyGiftRequestsUseCase implements IListMyGiftRequestsUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IListMyGiftRequestsCommand,
  ): Promise<IListMyGiftRequestsResult> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.giftRequestRepository.listByRequester({
      requesterId: command.requesterId,
      status: command.status,
      skip,
      take,
    });

    const base = this.config.storage.publicBaseUrl.replace(/\/$/, '');

    return {
      requests: items.map((row) => ({
        id: row.request.globalId,
        postId: row.request.postId,
        requesterId: row.request.requesterId,
        message: row.request.message,
        status: row.request.status,
        queueJoinedAt: row.request.queueJoinedAt,
        withdrawnAt: row.request.withdrawnAt ?? null,
        offeringPostId: row.request.offeringPostId ?? null,
        createdAt: row.request.createdAt,
        updatedAt: row.request.updatedAt,
        postTitle: row.postTitle,
        postStatus: row.postStatus,
        postThumbnailUrl: row.postThumbnailKey
          ? `${base}/${row.postThumbnailKey}`
          : null,
        postClosed: ClosedPostStatuses.includes(row.postStatus),
      })),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/**
 * Chủ bài chủ động từ chối một yêu cầu.
 *
 * Trước 28/09 không có đường nào làm việc này: `REJECTED` khai trong enum, lọc
 * ra khỏi bộ đếm, nhưng không ai ghi. Chủ bài thấy một yêu cầu rõ ràng không ổn
 * cũng không gạt ra được — và nếu hết đồng hồ mà chưa kịp chọn ai khác thì
 * auto-select có thể trao đúng cho người đó.
 */
@Injectable()
export class RejectGiftRequestUseCase implements IRejectGiftRequestUseCase {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    private readonly notifier: RequestLifecycleNotifier,
  ) {}

  public async handle(
    command: IRejectGiftRequestCommand,
  ): Promise<IRejectGiftRequestResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    // Câu ghi tự quyết bằng `WHERE status IN (PENDING, STANDBY)`. Yêu cầu đã
    // ACCEPTED không rơi vào đây, và đó là chủ ý: từ chối một lượt trao đang
    // sống là việc của `/transactions`, nơi tồn kho và phòng chat phải dọn theo.
    const rejected = await this.giftRequestRepository.rejectIfOpen({
      postId: command.postId,
      requestId: command.requestId,
    });
    if (!rejected) throw new GiftRequestNotFoundException(command.requestId);

    await this.notifier.announceRejected({
      requesterId: rejected.requesterId,
      postTitle: post.title,
      requestId: rejected.globalId,
    });

    return { request: toGiftRequestDto(rejected) };
  }
}
