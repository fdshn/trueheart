import {
  IGetPostCommand,
  IGetPostResult,
  IGetPostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { IPostAuthorDto } from '@chantam.vn/chantam.core-lib/dto';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPostUseCase implements IGetPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(command: IGetPostCommand): Promise<IGetPostResult> {
    const post = await this.postRepository.findPublicByGlobalId(
      command.postId,
      command.currentUserId,
    );

    if (!post) throw new PostNotFoundException(command.postId);

    post.location = applyGeoJitter(
      post.location,
      post.globalId,
      this.config.geo.jitterRadiusMeters,
    );

    const media = await this.postMediaRepository.listByPostId(post.globalId);

    let author: IPostAuthorDto | null = null;
    if (post.authorId) {
      const user = await this.userRepository.findOne({
        where: { globalId: post.authorId },
      });
      if (user) {
        author = {
          id: user.globalId,
          username: user.username,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          rank: user.rank,
        };
      }
    }

    return {
      post,
      author,
      media: media
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .map((item) => ({
          id: item.id,
          url: `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`,
          sortOrder: item.sortOrder,
        })),
      isLocationApproximate: true,
    };
  }
}
