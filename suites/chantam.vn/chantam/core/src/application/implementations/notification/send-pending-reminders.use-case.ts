import {
  IDispatchNotificationUseCase,
  ISendPendingRemindersCommand,
  ISendPendingRemindersResult,
  ISendPendingRemindersUseCase,
} from '@/application/contracts/notification';
import {
  IAdminConfigRepository,
  IPostRepository,
  IRankRepository,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizeReviewGraceConfig,
  PostExpiryReminderDays,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

const DefaultLimit = 500;

/**
 * Chờ bao lâu sau khi hoàn tất mới nhắc đánh giá.
 *
 * Nhắc ngay hôm hoàn tất là làm phiền người còn chưa mở hộp — nhất là với hàng
 * ship. Hai ngày là khoảng đủ để họ đã thấy món đồ mà vẫn còn xa hạn 7 ngày.
 */
const RemindReviewAfterDays = 2;

/**
 * Nhắc nhiệm vụ duy trì trước bao nhiêu ngày.
 *
 * SRS BR-PROF-RANK-03 yêu cầu nhắc trước 1 tháng. Trượt chu kỳ nay bị trừ điểm
 * và có thể tụt hạng, nên nhắc muộn hơn thời điểm còn kịp làm 2 lượt trao là nhắc
 * một việc không còn cứu được.
 */
const RemindMaintenanceBeforeDays = 30;

/**
 * Gửi các lời nhắc theo lịch.
 *
 * Gộp hai loại vào một job vì chúng cùng khuôn — quét bảng, gửi thông báo có
 * khoá chống trùng — và hai job riêng nghĩa là hai lịch cron phải nhớ.
 *
 * Chạy bằng `npm run notify:reminders`, thêm `--dry-run` để chỉ xem.
 */
@Injectable()
export class SendPendingRemindersUseCase implements ISendPendingRemindersUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IRankRepository)
    private readonly ranks: IRankRepository,
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: ISendPendingRemindersCommand,
  ): Promise<ISendPendingRemindersResult> {
    const limit = command.limit ?? DefaultLimit;
    const dryRun = command.dryRun === true;

    const grace = normalizeReviewGraceConfig(
      await this.adminConfig.getConfigValue(ReviewGraceConfigKey),
    );

    const pendingReviews = await this.reviews.findPendingReviewReminders({
      graceDays: grace.graceDays,
      remindAfterDays: RemindReviewAfterDays,
      limit,
    });
    const pendingCycles = await this.ranks.findCyclesNeedingReminder({
      remindBeforeDays: RemindMaintenanceBeforeDays,
      limit,
    });
    const expiringPosts = await this.posts.findPostsExpiringSoon({
      withinDays: PostExpiryReminderDays,
      limit,
    });

    if (dryRun)
      return {
        reviewReminders: 0,
        maintenanceReminders: 0,
        expiringPostReminders: 0,
        pendingReview: pendingReviews.length,
        pendingMaintenance: pendingCycles.length,
        pendingExpiringPosts: expiringPosts.length,
      };

    let reviewReminders = 0;
    for (const pending of pendingReviews) {
      const sent = await this.dispatchNotification.handle({
        userId: pending.receiverId,
        type: NotificationTypes.REVIEW_REMINDER,
        title: 'Bạn chưa đánh giá lượt trao',
        body:
          `Hãy chấm mức chính xác của mô tả so với món đồ thật. ` +
          `Còn ${pending.daysLeft} ngày trước khi hệ thống áp mức mặc định.`,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: pending.transactionId,
        // Một lời nhắc cho mỗi lượt trao, không phải mỗi ngày một lời: người
        // không muốn đánh giá đã quyết rồi, nhắc mỗi ngày chỉ khiến họ tắt hết
        // thông báo và từ đó mất luôn thông báo về lượt xin nhận.
        idempotencyKey: `REVIEW_REMINDER:${pending.transactionId}`,
        variables: { daysLeft: String(pending.daysLeft) },
      });
      if (sent.created) reviewReminders += 1;
    }

    let maintenanceReminders = 0;
    const reminded: string[] = [];
    for (const cycle of pendingCycles) {
      const sent = await this.dispatchNotification.handle({
        userId: cycle.userId,
        type: NotificationTypes.RANK_MAINTENANCE_REMINDER,
        title: `Nhiệm vụ duy trì hạng ${cycle.rank} sắp hết hạn`,
        body:
          `Còn ${cycle.daysLeft} ngày. Bạn đã hoàn tất ` +
          `${cycle.giftsDone}/${cycle.requiredGifts} lượt trao và ` +
          `${cycle.referralsDone}/${cycle.requiredReferrals} lượt mời. ` +
          `Không đủ chỉ tiêu sẽ bị trừ ${cycle.penaltyPoints} điểm.`,
        referenceType: 'RANK_MAINTENANCE_CYCLE',
        referenceId: cycle.cycleId,
        idempotencyKey: `RANK_MAINTENANCE_REMINDER:${cycle.cycleId}`,
        variables: {
          rank: cycle.rank,
          daysLeft: String(cycle.daysLeft),
          giftsDone: String(cycle.giftsDone),
          requiredGifts: String(cycle.requiredGifts),
          referralsDone: String(cycle.referralsDone),
          requiredReferrals: String(cycle.requiredReferrals),
          penaltyPoints: String(cycle.penaltyPoints),
        },
      });
      if (sent.created) maintenanceReminders += 1;
      // Đánh dấu cả khi `created` là false: khoá chống trùng đã chặn nên lần sau
      // cũng sẽ chặn, và để lại `reminded_at` trống là bắt câu quét nạp lại chu
      // kỳ đó mỗi ngày cho tới khi hết hạn.
      reminded.push(cycle.cycleId);
    }
    await this.ranks.markCyclesReminded(reminded);

    let expiringPostReminders = 0;
    for (const post of expiringPosts) {
      const sent = await this.dispatchNotification.handle({
        userId: post.authorId,
        type: NotificationTypes.POST_EXPIRING_SOON,
        title: 'Bài đăng sắp hết hạn',
        body:
          `Bài "${post.title}" còn ${post.daysLeft} ngày là hết hạn. ` +
          `Bạn có thể gia hạn thêm ba tháng nếu vẫn muốn giữ bài.`,
        referenceType: 'POST',
        referenceId: post.postId,
        // Khoá theo bài VÀ mốc hết hạn: gia hạn đổi `expires_at`, nên lần sắp
        // hết hạn sau là một sự việc khác và đáng được nhắc lại. Khoá theo mình
        // id bài thì người gia hạn một lần sẽ không bao giờ được nhắc nữa.
        idempotencyKey: `POST_EXPIRING_SOON:${post.postId}:${post.expiresAt.toISOString().slice(0, 10)}`,
        variables: {
          title: post.title,
          daysLeft: String(post.daysLeft),
        },
      });
      if (sent.created) expiringPostReminders += 1;
    }

    return {
      reviewReminders,
      maintenanceReminders,
      expiringPostReminders,
      pendingReview: pendingReviews.length,
      pendingMaintenance: pendingCycles.length,
      pendingExpiringPosts: expiringPosts.length,
    };
  }
}
