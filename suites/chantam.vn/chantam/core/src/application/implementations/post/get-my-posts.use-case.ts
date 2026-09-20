import {
  IGetMyPostsCommand,
  IGetMyPostsResult,
  IGetMyPostsUseCase,
} from '@/application/contracts/post';
import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetMyPostsUseCase implements IGetMyPostsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(command: IGetMyPostsCommand): Promise<IGetMyPostsResult> {
    const { skip, take } = toSkipTake(command);
    const { items: posts, total } = await this.postRepository.findMyPosts({
      // Tác giả lấy từ access token, KHÔNG nhận từ query: tin vào query là ai
      // cũng đọc được bài nháp và bài bị từ chối của người khác.
      authorId: command.userId,
      postType: command.postType,
      status: command.status,
      categoryId: command.categoryId,
      skip,
      take,
    });

    const postIds = posts.map((p) => p.globalId);
    const requestCounts =
      postIds.length > 0
        ? await this.giftRequestRepository.countActiveByPostIds(postIds)
        : new Map<string, number>();

    const items = await Promise.all(
      posts.map(async (post) => {
        const rawMedia = await this.postMediaRepository.listByPostId(
          post.globalId,
        );
        const media = rawMedia
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({
            id: item.id,
            url: `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`,
            sortOrder: item.sortOrder,
          }));

        return {
          post,
          requestCount: requestCounts.get(post.globalId) ?? 0,
          media,
        };
      }),
    );

    // Trả toạ độ THẬT, không làm nhiễu: đây là bài của chính người gọi, và họ
    // cần thấy đúng chỗ mình đã ghim để sửa cho khớp.
    return {
      posts: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
