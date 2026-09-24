import {
  IRequestCharityTransferCommand,
  IRequestCharityTransferResult,
  IRequestCharityTransferUseCase,
  IReviewCharityTransferCommand,
  IReviewCharityTransferResult,
  IReviewCharityTransferUseCase,
} from '@/application/contracts/post';
import {
  PostCharityTransferInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  CharityTransferOutcome,
  IAdminConfigRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { CharityTransferStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/** Dịch kết quả repository sang exception, dùng chung cho cả hai chiều. */
function unwrap(outcome: CharityTransferOutcome, postId: string) {
  if (outcome.status === 'RECORDED') return { post: outcome.post };
  if (outcome.status === 'INVALID_STATE')
    throw new PostCharityTransferInvalidStateException();
  // Bài của người khác cũng trả NOT_FOUND: phân biệt là cho người lạ dò được
  // id nào có thật.
  throw new PostNotFoundException(postId);
}

/**
 * Chủ bài xin chuyển vật phẩm về điểm từ thiện trước khi bài hết hạn (F23).
 */
@Injectable()
export class RequestCharityTransferUseCase implements IRequestCharityTransferUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(
    command: IRequestCharityTransferCommand,
  ): Promise<IRequestCharityTransferResult> {
    return unwrap(
      await this.postRepository.requestCharityTransfer({
        postId: command.postId,
        authorId: command.userId,
        note: command.transfer.note ?? null,
      }),
      command.postId,
    );
  }
}

/**
 * Admin duyệt hoặc từ chối yêu cầu chuyển về điểm từ thiện (F23).
 *
 * Duyệt thì bài sang `ARCHIVED` — Kho Từ Thiện Chung. Từ chối thì bài giữ
 * nguyên trạng thái cũ và chủ bài vẫn dùng bài bình thường.
 */
@Injectable()
export class ReviewCharityTransferUseCase implements IReviewCharityTransferUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IReviewCharityTransferCommand,
  ): Promise<IReviewCharityTransferResult> {
    // Dùng chung `post.moderate` với duyệt bài: đây cũng là một quyết định
    // kiểm duyệt trên bài. Hai đường dùng hai nguồn quyền khác nhau là mời một
    // lỗ hổng — gỡ quyền ở một chỗ mà chỗ kia vẫn mở.
    if (!(await this.admin.hasPermission(command.userId, 'post.moderate')))
      throw new ForbiddenException();

    return unwrap(
      await this.postRepository.reviewCharityTransfer({
        postId: command.postId,
        approve: command.transfer.status === CharityTransferStatuses.APPROVED,
      }),
      command.postId,
    );
  }
}
