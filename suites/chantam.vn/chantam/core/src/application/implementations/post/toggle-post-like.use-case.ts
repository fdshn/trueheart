import {
  ITogglePostLikeCommand,
  ITogglePostLikeResult,
  ITogglePostLikeUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IContentReactionRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Nút thích của bài đăng.
 *
 * Đây là **lối tắt** cho cảm xúc `LIKE` chứ không phải một hệ đếm riêng: mọi
 * lượt thích nằm chung bảng `content_reactions` với bốn cảm xúc còn lại. Hai
 * bảng song song thì `GET /posts/:id` sẽ trả hai con số thích khác nhau cho
 * cùng một bài, và không con số nào đúng.
 */
@Injectable()
export class TogglePostLikeUseCase implements ITogglePostLikeUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
  ) {}

  public async handle(
    command: ITogglePostLikeCommand,
  ): Promise<ITogglePostLikeResult> {
    // Khoá ngoại đa hình không tồn tại nên database không chặn được một cảm
    // xúc trỏ vào bài không có. Phép kiểm này là thứ duy nhất giữ chỗ đó.
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt) {
      throw new PostNotFoundException(command.postId);
    }

    // Bình thái theo kết quả: bấm hai lần nhanh không ném lỗi "đã thích rồi"
    // vào mặt người dùng, vì trạng thái được đọc và ghi trong cùng transaction.
    return this.reactions.toggleLike(command.postId, command.userId);
  }
}
