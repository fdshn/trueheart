import {
  IRequestPostMediaUploadCommand,
  IRequestPostMediaUploadUseCase,
} from '@/application/contracts/post';
import { assertEditablePost } from '@/domain/consts/post-edit-policy';
import {
  PostMediaLimitExceededException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';

@Injectable()
export class RequestPostMediaUploadUseCase implements IRequestPostMediaUploadUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(command: IRequestPostMediaUploadCommand) {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();
    assertEditablePost(post);
    if ((await this.postMediaRepository.countByPostId(command.postId)) >= 10)
      throw new PostMediaLimitExceededException();

    return withStorageValidation('media', () =>
      this.storage.createPostMediaUpload(command),
    );
  }
}
