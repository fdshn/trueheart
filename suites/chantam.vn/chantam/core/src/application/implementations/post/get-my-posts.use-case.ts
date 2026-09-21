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

    const allMedia =
      postIds.length > 0
        ? await this.postMediaRepository.listByPostIds(postIds)
        : [];

    const mediaMap = new Map<
      string,
      Array<{ id: number; url: string; sortOrder: number }>
    >();
    for (const item of allMedia) {
      const url = `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`;
      const entry = { id: item.id, url, sortOrder: item.sortOrder };
      const list = mediaMap.get(item.postId);
      if (list) {
        list.push(entry);
      } else {
        mediaMap.set(item.postId, [entry]);
      }
    }

    const items = posts.map((post) => {
      const media = (mediaMap.get(post.globalId) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );

      return {
        post,
        requestCount: requestCounts.get(post.globalId) ?? 0,
        media,
      };
    });

    // Trả toạ độ THẬT, không làm nhiễu: đây là bài của chính người gọi, và họ
    // cần thấy đúng chỗ mình đã ghim để sửa cho khớp.
    return {
      posts: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
