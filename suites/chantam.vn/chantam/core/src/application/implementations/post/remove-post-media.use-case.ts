import {
  IRemovePostMediaCommand,
  IRemovePostMediaResult,
  IRemovePostMediaUseCase,
} from '@/application/contracts/post';
import { assertEditablePost } from '@/domain/consts/post-edit-policy';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemovePostMediaUseCase implements IRemovePostMediaUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRemovePostMediaCommand,
  ): Promise<IRemovePostMediaResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();
    assertEditablePost(post);

    const removedKey = await this.postMediaRepository.removeByPostId(
      command.postId,
      command.mediaId,
    );

    if (!removedKey) throw new PostNotFoundException(command.postId);

    // Dọn object SAU khi bản ghi đã xoá xong, và cố ý không nằm trong
    // transaction: S3 không tham gia transaction database được. Chết giữa
    // chừng theo thứ tự này để lại một object mồ côi — thứ mà
    // `media:sweep-orphans` dọn. Làm ngược lại thì để lại một bản ghi trỏ vào
    // ảnh không còn tồn tại, và người xem thấy ô ảnh vỡ.
    await this.storage.deleteObjects([removedKey]);

    return {};
  }
}
