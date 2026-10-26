import {
  IListUserPostsCommand,
  IListUserPostsResult,
  IListUserPostsUseCase,
} from '@/application/contracts/post';
import { UserNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  PubliclyVisibleGiftPostStatuses,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import { toPublicAuthor } from '../shared/public-author';

/**
 * Trạng thái người NGOÀI được thấy — đúng luật của `findPublicByGlobalId`. Bài đã xong, hết
 * hạn hay bị gỡ không lên hồ sơ của người khác.
 */
const PublicStatuses: string[] = [...PubliclyVisibleGiftPostStatuses];

/**
 * Bài của một người trên hồ sơ (PR #46 §3.4).
 *
 * Cùng hình dạng bảng tin "quanh đây" và cùng luật bảo vệ: vị trí làm nhiễu, tác giả là
 * author summary, KHÔNG có liên hệ. Chính chủ thấy mọi bài chưa xoá (vẫn vị trí nhiễu — bản
 * chính xác của chính mình ở `GET /posts/mine`).
 */
@Injectable()
export class ListUserPostsUseCase implements IListUserPostsUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly media: IPostMediaRepository,
    @Inject(IGiftRequestRepository)
    private readonly requests: IGiftRequestRepository,
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IListUserPostsCommand,
  ): Promise<IListUserPostsResult> {
    const author = await this.users.findActiveByUsername(command.username);
    if (!author) throw new UserNotFoundException();

    const { skip, take } = toSkipTake(command);
    const page = Math.floor(skip / take) + 1;
    const isOwner = command.viewerId === author.globalId;

    // Người ngoài hỏi một trạng thái không công khai: câu trả lời đúng là "không có", và
    // không cần hỏi database mới biết.
    if (!isOwner && command.status && !PublicStatuses.includes(command.status))
      return { posts: [], meta: new PaginationMetaDto(page, take, 0) };

    const { items, total } = await this.posts.findMyPosts({
      authorId: author.globalId,
      postType: command.postType,
      status: command.status,
      visibleStatuses: isOwner ? undefined : PublicStatuses,
      skip,
      take,
    });

    const postIds = items.map((post) => post.globalId);
    const [requestCounts, mediaRows, myReactions] = await Promise.all([
      postIds.length > 0
        ? this.requests.countActiveByPostIds(postIds)
        : new Map<string, number>(),
      postIds.length > 0 ? this.media.listByPostIds(postIds) : [],
      postIds.length > 0 && command.viewerId
        ? this.reactions.findMyReactions(
            ContentSubjectTypes.POST,
            postIds,
            command.viewerId,
          )
        : new Map<string, ReactionKinds>(),
    ]);

    const base = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    const mediaByPost = new Map<
      string,
      { id: number; url: string; sortOrder: number }[]
    >();
    for (const item of mediaRows) {
      const list = mediaByPost.get(item.postId) ?? [];
      list.push({
        id: item.id,
        url: `${base}/${item.r2Key}`,
        sortOrder: item.sortOrder,
      });
      mediaByPost.set(item.postId, list);
    }
    const authorDto = toPublicAuthor(author);

    return {
      posts: items.map((post) => ({
        post: {
          ...post,
          location: applyGeoJitter(
            post.location,
            post.globalId,
            this.config.geo.jitterRadiusMeters,
          ),
        },
        distanceMeters: null,
        isLocationApproximate: true as const,
        media: (mediaByPost.get(post.globalId) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder,
        ),
        author: authorDto,
        requestCount: requestCounts.get(post.globalId) ?? 0,
        reactionCount: post.reactionCount,
        commentCount: post.commentCount,
        shareCount: post.shareCount,
        myReaction: myReactions.get(post.globalId) ?? null,
      })),
      meta: new PaginationMetaDto(page, take, total),
    };
  }
}
