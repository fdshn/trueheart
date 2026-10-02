import {
  IAdminConfigRepository,
  IAdminDashboard,
} from '@/domain/ports/repository';
import {
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Số liệu điều hành (F59).
 *
 * **Đếm SỐNG, không có bảng tổng hợp.** Một bảng tổng hợp đòi job cập nhật, một
 * đường đối soát khi job chết, và một câu trả lời cho "vì sao số trên dashboard
 * khác số khi đếm tay". Với dữ liệu ở quy mô hiện tại thì cái giá đó lớn hơn hẳn
 * cái lợi. Khi nào chậm thật thì thêm bảng, và lúc đó sẽ biết cần tổng hợp gì.
 *
 * Mỗi chỉ số một truy vấn thay vì một câu ghép: một câu 5 nhánh `COUNT(*) FILTER`
 * trên 5 bảng khác nhau phải CROSS JOIN chúng lại, và đọc nó sáu tháng sau là một
 * buổi chiều. Năm câu rời thì mỗi câu đọc được một mình.
 */
@Injectable()
export class AdminDashboardRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async read(windowDays: number): Promise<IAdminDashboard> {
    const [users] = await this.manager.query<
      { total: string; recent: string; viewers: string }[]
    >(
      `
        SELECT COUNT(*)::text AS total,
               COUNT(*) FILTER (
                 WHERE created_at >= now() - ($1 || ' days')::interval
               )::text AS recent,
               COUNT(*) FILTER (WHERE rank = 'VIEWER')::text AS viewers
        FROM users
        WHERE deleted_at IS NULL
      `,
      [String(windowDays)],
    );

    // Phân bổ hạng đọc từ chính `users.rank`, không tính lại từ điểm: dashboard
    // phải nói đúng cái mà hệ thống đang DÙNG để cấp quyền, kể cả khi nó đang lệch
    // với điểm. Tính lại ở đây sẽ che mất chính xác loại lệch cần thấy.
    const ranks = await this.manager.query<{ rank: string; total: string }[]>(
      `
        SELECT rank, COUNT(*)::text AS total
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY rank
        ORDER BY rank
      `,
    );

    const categories = await this.manager.query<
      { category: string; total: string }[]
    >(
      `
        SELECT category.name AS category, COUNT(post.id)::text AS total
        FROM categories category
        LEFT JOIN posts post
          ON post.category_id = category.global_id
          AND post.deleted_at IS NULL
          AND post.status::text IN ('PUBLISHED', 'RESERVED', 'COMPLETED')
        GROUP BY category.name
        ORDER BY COUNT(post.id) DESC, category.name ASC
      `,
    );

    const [posts] = await this.manager.query<
      { published: string; reserved: string; completed: string }[]
    >(
      `
        SELECT COUNT(*) FILTER (WHERE status = 'PUBLISHED')::text AS published,
               COUNT(*) FILTER (WHERE status = 'RESERVED')::text AS reserved,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::text AS completed
        FROM posts
        WHERE deleted_at IS NULL
      `,
    );

    const [transactions] = await this.manager.query<
      { live: string; completed: string; recent: string; cancelled: string }[]
    >(
      `
        SELECT COUNT(*) FILTER (
                 WHERE status IN ('ACCEPTED', 'DELIVERING')
               )::text AS live,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::text AS completed,
               COUNT(*) FILTER (
                 WHERE status = 'COMPLETED'
                   AND completed_at >= now() - ($1 || ' days')::interval
               )::text AS recent,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')::text AS cancelled
        FROM gift_transactions
      `,
      [String(windowDays)],
    );

    // Dung lượng đếm bằng SỐ OBJECT, không phải byte.
    //
    // Không bảng nào lưu kích thước: `post_media` có `r2_key`,
    // `chat_message_media` có `storage_key`, và hết. Đo byte thật đòi gọi ra
    // storage cho từng object — một lượt gọi mạng dài trong một endpoint dashboard.
    // Trả số object và nói rõ đó là số object, thay vì quy đổi bằng một kích thước
    // trung bình bịa ra.
    const [media] = await this.manager.query<
      { post_objects: string; chat_objects: string }[]
    >(
      `
        SELECT (SELECT COUNT(*) FROM post_media)::text AS post_objects,
               (SELECT COUNT(*) FROM chat_message_media)::text AS chat_objects
      `,
    );

    const [queues] = await this.manager.query<
      { open_reports: string; pending_comments: string }[]
    >(
      `
        SELECT (
                 SELECT COUNT(*) FROM reports
                 WHERE status IN ('PENDING', 'IN_REVIEW')
               )::text AS open_reports,
               (
                 SELECT COUNT(*) FROM content_comments
                 WHERE status = 'PENDING_REVIEW'
               )::text AS pending_comments
      `,
    );

    // Phân bổ Điểm Cống hiến theo đúng ngưỡng hạng ĐANG hiệu lực.
    //
    // Cắt theo mốc tự nghĩ ra sẽ cho một biểu đồ không so sánh được với `users.byRank` ở
    // trên — mà khoảng lệch giữa hai cái đó mới là thứ đáng xem: một cái là hạng hệ thống
    // đang cấp quyền theo, một cái là hạng mà số dư nói lẽ ra phải là.
    //
    // KHÔNG cast `threshold_points` sang text ở đây.
    //
    // `SELECT threshold_points::text` (không alias) đặt tên cột RA đúng bằng tên cột VÀO,
    // và `ORDER BY threshold_points` khi đó trỏ vào cột RA — tức sắp theo CHUỖI:
    // `'0' < '1792' < '224' < '672' < '896'`. Mảng mốc truyền cho `width_bucket` thành ra
    // không tăng dần, và `width_bucket` với mảng chưa sắp trả bucket sai mà KHÔNG ném.
    // Bắt được 02/10 bằng `test:dashboard` nhóm 0; không phép kiểm mock nào thấy được.
    const tiers = await this.manager.query<
      { rank: string; threshold_points: number }[]
    >(
      `SELECT rank, threshold_points
       FROM rank_tiers
       ORDER BY threshold_points ASC`,
    );

    const [points] = await this.manager.query<
      { total_balance: string; issued: string; spent: string }[]
    >(
      `
        SELECT (SELECT COALESCE(SUM(balance), 0)::text
                FROM user_point_balances) AS total_balance,
               COALESCE(SUM(delta) FILTER (
                 WHERE delta > 0
                   AND created_at >= now() - ($1 || ' days')::interval
               ), 0)::text AS issued,
               -- Lượt tiêu là delta ÂM; đổi dấu để con số đọc ra là "đã tiêu bao nhiêu",
               -- không phải "âm bao nhiêu".
               COALESCE(-SUM(delta) FILTER (
                 WHERE delta < 0
                   AND created_at >= now() - ($1 || ' days')::interval
               ), 0)::text AS spent
        FROM point_ledger
      `,
      [String(windowDays)],
    );

    // Đếm người theo từng khoảng ngưỡng, trong MỘT câu.
    //
    // `width_bucket` cần mảng mốc tăng dần, và truy vấn `rank_tiers` ở trên đã sắp đúng
    // vậy. Người có số dư dưới mốc đầu tiên vẫn vào bucket 1, nên không ai rơi ra ngoài.
    const thresholds = tiers.map((tier) => Number(tier.threshold_points));
    const buckets =
      thresholds.length === 0
        ? []
        : await this.manager.query<{ bucket: string; total: string }[]>(
            `
              SELECT width_bucket(balance, $1::int[])::text AS bucket,
                     COUNT(*)::text AS total
              FROM user_point_balances
              GROUP BY 1
            `,
            [thresholds],
          );
    const bucketCounts = new Map(
      buckets.map((row) => [Number(row.bucket), Number(row.total)]),
    );

    const [groups] = await this.manager.query<
      {
        total: string;
        recent: string;
        members: string;
        recent_members: string;
      }[]
    >(
      `
        SELECT (SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL)::text AS total,
               (SELECT COUNT(*) FROM groups
                 WHERE deleted_at IS NULL
                   AND created_at >= now() - ($1 || ' days')::interval
               )::text AS recent,
               (SELECT COUNT(*) FROM group_memberships)::text AS members,
               (SELECT COUNT(*) FROM group_memberships
                 WHERE created_at >= now() - ($1 || ' days')::interval
               )::text AS recent_members
      `,
      [String(windowDays)],
    );

    // Bản chính sách affiliate đang chạy, đọc riêng để phân biệt "chưa ai publish" với
    // "đã publish mà đang tắt" — hai trạng thái cho cùng một bảng toàn số 0.
    //
    // `ORDER BY version DESC`, KHÔNG `effective_at DESC`: cùng bẫy đã bắt ở policy điểm
    // danh, và truy vấn này phải khớp `AffiliateRepository.readActivePolicy` chứ không
    // được nói một bản khác.
    const [affiliatePolicy] = await this.manager.query<{ enabled: boolean }[]>(
      `SELECT enabled FROM affiliate_policy_revisions
        WHERE effective_at <= now()
        ORDER BY version DESC
        LIMIT 1`,
    );

    const [affiliate] = await this.manager.query<
      {
        eligible: string;
        rejected: string;
        no_location: string;
        awarded: string;
        reversed: string;
      }[]
    >(
      `
        SELECT (SELECT COUNT(*) FROM affiliate_events
                 WHERE geo_status = 'ELIGIBLE')::text AS eligible,
               (SELECT COUNT(*) FROM affiliate_events
                 WHERE geo_status = 'NOT_ELIGIBLE_GEO')::text AS rejected,
               (SELECT COUNT(*) FROM affiliate_events
                 WHERE geo_status = 'NO_LOCATION')::text AS no_location,
               (SELECT COALESCE(SUM(point_delta), 0) FROM affiliate_rewards
                 WHERE reward_status = 'AWARDED')::text AS awarded,
               (SELECT COALESCE(SUM(point_delta), 0) FROM affiliate_rewards
                 WHERE reward_status = 'REVERSED')::text AS reversed
      `,
    );

    // Ngưỡng accuracy là cấu hình động, không phải hằng số — đọc ra để trả kèm, nếu không
    // `belowThreshold` là một con số không ai đọc được là dưới bao nhiêu.
    const accuracyConfig = normalizeGiverAccuracyConfig(
      await this.adminConfig.getConfigValue(GiverAccuracyConfigKey),
    );

    const [accuracy] = await this.manager.query<
      { measured: string; below: string; flagged: string }[]
    >(
      `
        SELECT COUNT(*) FILTER (
                 WHERE giver_accuracy_samples >= $1
               )::text AS measured,
               COUNT(*) FILTER (
                 WHERE giver_accuracy_samples >= $1
                   AND giver_accuracy_percent < $2
               )::text AS below,
               COUNT(*) FILTER (WHERE accuracy_review_required)::text AS flagged
        FROM users
        WHERE deleted_at IS NULL
      `,
      [accuracyConfig.minSamples, accuracyConfig.reviewThresholdPercent],
    );

    const completed = Number(transactions?.completed ?? 0);
    const cancelled = Number(transactions?.cancelled ?? 0);
    const settled = completed + cancelled;

    return {
      windowDays,
      users: {
        total: Number(users?.total ?? 0),
        newInWindow: Number(users?.recent ?? 0),
        viewers: Number(users?.viewers ?? 0),
        byRank: ranks.map((row) => ({
          rank: row.rank,
          total: Number(row.total),
        })),
      },
      posts: {
        published: Number(posts?.published ?? 0),
        reserved: Number(posts?.reserved ?? 0),
        completed: Number(posts?.completed ?? 0),
        byCategory: categories.map((row) => ({
          category: row.category,
          total: Number(row.total),
        })),
      },
      transactions: {
        live: Number(transactions?.live ?? 0),
        completed,
        completedInWindow: Number(transactions?.recent ?? 0),
        cancelled,
        // `null` chứ không phải 0 khi chưa có giao dịch nào kết thúc: 0% nghĩa là "thử
        // rồi và trượt hết", còn `null` nghĩa là "chưa có gì để đo".
        completionRatePercent:
          settled === 0 ? null : Math.round((completed / settled) * 1000) / 10,
        completionDenominator: settled,
      },
      points: {
        totalBalance: Number(points?.total_balance ?? 0),
        issuedInWindow: Number(points?.issued ?? 0),
        spentInWindow: Number(points?.spent ?? 0),
        // `width_bucket` trả 1 cho giá trị dưới mốc đầu, nên bậc thứ `i` nhận bucket
        // `i + 1`. Bậc không ai thuộc thì thiếu dòng, trả 0.
        byRankThreshold: tiers.map((tier, index) => ({
          rank: tier.rank,
          thresholdPoints: Number(tier.threshold_points),
          users: bucketCounts.get(index + 1) ?? 0,
        })),
      },
      groups: {
        total: Number(groups?.total ?? 0),
        newInWindow: Number(groups?.recent ?? 0),
        members: Number(groups?.members ?? 0),
        newMembersInWindow: Number(groups?.recent_members ?? 0),
      },
      affiliate: {
        policyPublished: affiliatePolicy !== undefined,
        policyEnabled: affiliatePolicy?.enabled === true,
        eventsEligible: Number(affiliate?.eligible ?? 0),
        eventsRejectedGeo: Number(affiliate?.rejected ?? 0),
        eventsNoLocation: Number(affiliate?.no_location ?? 0),
        pointsAwarded: Number(affiliate?.awarded ?? 0),
        pointsReversed: Number(affiliate?.reversed ?? 0),
      },
      accuracy: {
        thresholdPercent: accuracyConfig.reviewThresholdPercent,
        minSamples: accuracyConfig.minSamples,
        measured: Number(accuracy?.measured ?? 0),
        belowThreshold: Number(accuracy?.below ?? 0),
        reviewRequired: Number(accuracy?.flagged ?? 0),
      },
      media: {
        postObjects: Number(media?.post_objects ?? 0),
        chatObjects: Number(media?.chat_objects ?? 0),
      },
      queues: {
        openReports: Number(queues?.open_reports ?? 0),
        pendingComments: Number(queues?.pending_comments ?? 0),
      },
    };
  }
}
