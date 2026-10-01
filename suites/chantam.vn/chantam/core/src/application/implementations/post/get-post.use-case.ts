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

    const isAuthor = command.currentUserId === post.authorId;

    // Hai bên trong lượt trao thấy toạ độ THẬT, dùng ĐÚNG ngưỡng đã mở cho thông tin
    // liên lạc ở dưới: `isReceiverOfPost` (giao dịch ACCEPTED/DELIVERING/COMPLETED).
    //
    // ## Vì sao không đặt một ngưỡng riêng cho toạ độ
    //
    // Hệ này ĐÃ trả `contactInfo.address` — địa chỉ dạng chứ — cho chính người nhận đó,
    // cùng số điện thoại. Nhưng pin trên bản đồ họ thấy vẫn lệch ~300 m, tức app đưa họ
    // số nhà rồi chỉ sai chỗ để đi tới. Hai ngưỡng khác nhau cho cùng một cặp người là một
    // sự tùy ý khó giải thích, và cái bị giữ lại lại đúng là cái họ cần để tìm đường.
    //
    // Đặc tả mục 1.3 nói "chỉ người đã được duyệt nhận mới biết địa chỉ chính xác".
    // Trước 01/10 câu đó chưa từng chạy cho toạ độ: đường canonical chỉ có ngoại lệ chủ
    // bài, còn đường legacy mang một tham số `canViewExactLocation` hardcode `false`.
    //
    // KHÔNG áp cho `/posts/nearby`, `/posts/map`, `/posts/:id/matches`: ở đó mọi bài đều
    // là bài của người khác, và một kênh quét không bao giờ được trả toạ độ thật.
    const isReceiver = command.currentUserId
      ? await this.giftTransactionRepository.isReceiverOfPost(
          post.globalId,
          command.currentUserId,
        )
      : false;
    const canSeeExactLocation = isAuthor || isReceiver;

    if (!canSeeExactLocation)
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

    // Privacy: thông tin liên lạc chỉ tiết lộ cho chính người tặng hoặc người nhận đã
    // được chọn — giao dịch ACCEPTED/DELIVERING/COMPLETED, xem `isReceiverOfPost`.
    //
    // Dùng lại `canSeeExactLocation` đã tính ở trên thay vì gọi `isReceiverOfPost` lần hai:
    // một lượt đọc bài không nên hỏi cùng một câu hai lần, và quan trọng hơn: hai lần gọi
    // là hai cơ hội để hai ngưỡng trôi lệch nhau về sau.
    let contactInfo: IPostContactInfoDto | null = null;
    if (command.currentUserId && authorUser) {
      if (canSeeExactLocation) {
        contactInfo = {
          phone: authorUser.phone ?? null,
          address: (post.details?.address as string) || post.areaLabel || null,
        };
      }
    }

    return {
      canEdit:
        isAuthor &&
        ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'].includes(post.status) &&
        (post.expiresAt === null || post.expiresAt > new Date()) &&
        !(await this.giftTransactionRepository.hasLiveForPost(post.globalId)),
      post,
      author,
      media: media
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .map((item) => ({
          id: item.id,
          url: `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`,
          sortOrder: item.sortOrder,
        })),
      isLocationApproximate: !canSeeExactLocation,
      requestCount: requestCounts.get(post.globalId) ?? 0,
      myRequestStatus,
      hasRequested: Boolean(myRequestStatus),
      contactInfo,
      reactionCount: post.reactionCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      myReaction: summary.myReaction,
      reactionBreakdown: summary.breakdown,
    };
  }
}
