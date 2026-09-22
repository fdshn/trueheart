import {
  ITogglePostLikeCommand,
  ITogglePostLikeResult,
  ITogglePostLikeUseCase,
} from '@/application/contracts/post';
import {
  PostAlreadyLikedException,
  PostNotFoundException,
  PostNotLikedException,
} from '@/domain/exceptions';
import {
  IPostLikeRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class TogglePostLikeUseCase implements ITogglePostLikeUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostLikeRepository)
    private readonly postLikeRepository: IPostLikeRepository,
  ) {}

  public async handle(
    command: ITogglePostLikeCommand,
  ): Promise<ITogglePostLikeResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt) {
      throw new PostNotFoundException(command.postId);
    }

    const alreadyLiked = await this.postLikeRepository.hasLiked(
      command.userId,
      command.postId,
    );

    if (alreadyLiked) {
      // Unlike: xoá row + like_count--
      const removed = await this.postLikeRepository.unlike(
        command.userId,
        command.postId,
      );
      if (!removed) throw new PostNotLikedException();

      // Đọc lại likeCount sau khi unlike
      const updated = await this.postRepository.findOneBy({
        globalId: command.postId,
      });
      return {
        liked: false,
        likeCount: updated?.likeCount ?? post.likeCount - 1,
      };
    } else {
      // Like: insert row + like_count++
      const created = await this.postLikeRepository.like(
        command.userId,
        command.postId,
      );
      if (!created) throw new PostAlreadyLikedException();

      const updated = await this.postRepository.findOneBy({
        globalId: command.postId,
      });
      return {
        liked: true,
        likeCount: updated?.likeCount ?? post.likeCount + 1,
      };
    }
  }
}
