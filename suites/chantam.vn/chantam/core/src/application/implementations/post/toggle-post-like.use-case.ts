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
      // Unlike: xoá row + like_count-- (atomic trong transaction, trả về count mới)
      const result = await this.postLikeRepository.unlike(
        command.userId,
        command.postId,
      );
      if (!result) throw new PostNotLikedException();
      return { liked: false, likeCount: result.likeCount };
    } else {
      // Like: insert row + like_count++ (atomic trong transaction, trả về count mới)
      const result = await this.postLikeRepository.like(
        command.userId,
        command.postId,
      );
      if (!result) throw new PostAlreadyLikedException();
      return { liked: true, likeCount: result.likeCount };
    }
  }
}
