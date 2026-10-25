import {
  IResolvePostShareCommand,
  IResolvePostShareResult,
  IResolvePostShareUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostShareCodePattern,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Mở bài từ mã chia sẻ (PR #46 §4).
 *
 * Cùng ngưỡng xem với `GET /posts/:postId` (`findPublicByShareCode` dựa trên
 * `findPublicByGlobalId`), cộng một luật: bài Admin gỡ (`REJECTED`) không mở qua mã, kể cả với
 * chính chủ — link đã rải ra ngoài không được dẫn về một bài đã gỡ.
 *
 * KHÔNG tăng `share_count`: mở link là lượt XEM của người nhận link, không phải lượt chia sẻ.
 * Lượt chia sẻ vẫn ghi qua `POST /posts/:subjectId/shares`.
 */
@Injectable()
export class ResolvePostShareUseCase implements IResolvePostShareUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
  ) {}

  public async handle(
    command: IResolvePostShareCommand,
  ): Promise<IResolvePostShareResult> {
    // Gõ tay hay qua bàn phím di động hay ra chữ thường — mã sinh ra luôn viết hoa.
    const shareCode = command.shareCode.trim().toUpperCase();
    if (!PostShareCodePattern.test(shareCode))
      throw new PostNotFoundException(command.shareCode);

    const post = await this.posts.findPublicByShareCode(
      shareCode,
      command.currentUserId,
    );
    if (!post || post.status === GiftPostStatuses.REJECTED)
      throw new PostNotFoundException(command.shareCode);

    return {
      post: {
        postId: post.globalId,
        postType: post.postType,
        status: post.status,
      },
    };
  }
}
