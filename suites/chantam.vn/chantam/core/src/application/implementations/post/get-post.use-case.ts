import {
  IGetPostCommand,
  IGetPostResult,
  IGetPostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IGiftRequestRepository,
  IGiftTransactionRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  GiftRequestStatuses,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPostAuthorDto,
  IPostContactInfoDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPostUseCase implements IGetPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IGiftTransactionRepository)
    private readonly giftTransactionRepository: IGiftTransactionRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
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

    const requestCounts = await this.giftRequestRepository.countActiveByPostIds(
      [post.globalId],
    );
    const myStatuses = command.currentUserId
      ? await this.giftRequestRepository.findStatusesByPostIdsAndRequester(
          [post.globalId],
          command.currentUserId,
        )
      : new Map<string, GiftRequestStatuses>();
    const myRequestStatus = myStatuses.get(post.globalId) ?? null;

    // Chi tiết một bài: hỏi breakdown một lần là chấp nhận được. Bảng tin thì
    // không — đó là lý do nearby/me chỉ trả tổng số đếm.
    const summary = await this.reactions.summarize(
      {
        subjectType: ContentSubjectTypes.POST,
        subjectId: post.globalId,
      },
      command.currentUserId ?? null,
    );

    let author: IPostAuthorDto | null = null;
    let authorUser: IUserEntity | null = null;
    if (post.authorId) {
      authorUser = await this.userRepository.findOne({
        where: { globalId: post.authorId },
      });
      if (authorUser) {
        author = {
          id: authorUser.globalId,
          username: authorUser.username,
          avatarUrl: authorUser.avatarUrl,
          rank: authorUser.rank,
          joinedAt: authorUser.createdAt,
        };
      }
    }

    // Privacy: Thông tin liên lạc chỉ tiết lộ cho chính người tặng hoặc receiver
    // đã được chọn trong giao dịch DELIVERING/COMPLETED.
    let contactInfo: IPostContactInfoDto | null = null;
    if (command.currentUserId && authorUser) {
      const isAuthor = command.currentUserId === post.authorId;
      const isReceiver = await this.giftTransactionRepository.isReceiverOfPost(
        post.globalId,
        command.currentUserId,
      );

      if (isAuthor || isReceiver) {
        contactInfo = {
          phone: authorUser.phone ?? null,
          address: (post.details?.address as string) || post.areaLabel || null,
        };
      }
    }

    // Thích là cảm xúc `LIKE` chứ không phải một hệ đếm riêng, nên suy thẳng
    // từ `summarize()` đã gọi ở trên — bớt hẳn một vòng đi database.
    const isLiked = command.currentUserId
      ? summary.myReaction === ReactionKinds.LIKE
      : null;

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
      requestCount: requestCounts.get(post.globalId) ?? 0,
      myRequestStatus,
      hasRequested: Boolean(myRequestStatus),
      likeCount: post.likeCount ?? 0,
      isLiked,
      contactInfo,
      reactionCount: post.reactionCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      myReaction: summary.myReaction,
      reactionBreakdown: summary.breakdown,
    };
  }
}
