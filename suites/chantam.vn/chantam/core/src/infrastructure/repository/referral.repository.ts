import { IAppendPointEntryResult } from '@/application/contracts/point';
import { isPointPolicyError } from '@/application/implementations/point/point-policy-errors';
import {
  IPointLedgerRepository,
  IReferralFingerprintSignals,
  IReferralInvitee,
  IReferralQualificationResult,
  IReferralRepository,
  IReferralReviewCandidate,
  IReferralReviewInvitee,
  IReferralSummary,
} from '@/domain/ports/repository';
import {
  IReferralAbuseConfig,
  referralAbuseReviewEnabled,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

/**
 * Trần số người được mời trả về trong một lượt.
 *
 * Cứng chứ không phân trang: `GET /referrals/me` là một trang tóm tắt, không phải
 * một danh sách để duyệt. Nhưng để không trần thì một người mời vài nghìn người sẽ
 * biến một lượt đọc hồ sơ thành vài nghìn dòng JSON.
 */
const MaxInviteesReturned = 50;

/**
 * Đếm cụm dấu vết trùng nhau, dùng chung cho cả một người và cả hàng đợi soát.
 *
 * Một hàm sinh câu chứ không hai câu chép tay: hai bản chép của cùng một định nghĩa "cụm
 * trùng" sẽ lệch nhau ở lần sửa thứ hai, và khi đó con số Admin thấy ở hàng đợi khác con
 * số họ thấy khi mở hồ sơ — kiểu lệch khó lần nhất.
 *
 * `scope` là mệnh đề lọc trên alias `invite`, do phía gọi truyền vào.
 */
function fingerprintSignalsSql(scope: string): string {
  return `
    WITH marks AS (
      SELECT invite.referrer_id, 'IP' AS kind, invite.signup_ip_hash AS value
      FROM referrals invite
      ${scope} AND invite.signup_ip_hash IS NOT NULL
      UNION ALL
      SELECT invite.referrer_id, 'DEVICE' AS kind, invite.signup_device_hash AS value
      FROM referrals invite
      ${scope} AND invite.signup_device_hash IS NOT NULL
    ), clusters AS (
      SELECT referrer_id, kind, value, count(*) AS members
      FROM marks
      GROUP BY referrer_id, kind, value
      HAVING count(*) > 1
    )
    SELECT
      count(*) FILTER (WHERE kind = 'IP')::text AS ip_clusters,
      count(*) FILTER (WHERE kind = 'DEVICE')::text AS device_clusters,
      COALESCE(MAX(members), 0)::text AS largest_cluster
    FROM clusters
  `;
}

@Injectable()
export class ReferralRepository implements IReferralRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  /**
   * Danh sách người đã mời, mới nhất trước.
   *
   * `LEFT JOIN point_ledger` chứ không đọc lại `point_rules`: số điểm phải là con số ĐÃ
   * VÀO SỔ cho đúng lượt đó, vì rule là cấu hình động và đọc lại sẽ nói sai về những
   * lượt đã trả trước khi Admin đổi mức.
   */
  private async listInvitees(userId: string): Promise<IReferralInvitee[]> {
    const rows = await this.manager.query<
      {
        username: string;
        full_name: string | null;
        invited_at: Date;
        qualified_at: Date | null;
        awarded_points: number | null;
      }[]
    >(
      `
        SELECT
          referee.username,
          referee.full_name,
          invite.created_at AS invited_at,
          invite.qualified_at,
          entry.delta AS awarded_points
        FROM referrals invite
        INNER JOIN users referee ON referee.global_id = invite.referee_id
        LEFT JOIN point_ledger entry ON entry.id = invite.reward_entry_id
        WHERE invite.referrer_id = $1
        ORDER BY invite.created_at DESC
        LIMIT $2
      `,
      [userId, MaxInviteesReturned],
    );

    return rows.map((row) => ({
      username: row.username,
      fullName: row.full_name,
      status:
        row.qualified_at === null
          ? ('PENDING' as const)
          : ('QUALIFIED' as const),
      invitedAt: row.invited_at,
      qualifiedAt: row.qualified_at,
      awardedPoints:
        row.awarded_points === null ? null : Number(row.awarded_points),
    }));
  }

  /**
   * Ba tín hiệu dấu vết đăng ký, ĐẾM TÁCH NHAU trong một lượt truy vấn.
   *
   * ## Vì sao tách IP và thiết bị
   *
   * Bản đầu (30/09) cộng hai loại thành MỘT con số. Ở Việt Nam hai thứ đó khác nhau rất
   * xa: mạng di động dùng CGNAT nên hàng nghìn người không liên quan chia một IPv4, còn
   * trùng thiết bị là cùng một bản cài app. Cộng lại là làm mất đúng thứ để phân biệt một
   * gia đình dùng chung mạng với một người mở mười tài khoản trên một máy — và một
   * ngưỡng đặt trên tổng đó không có nghĩa gì.
   *
   * ## Vì sao có cả cụm lớn nhất
   *
   * Riêng SỐ cụm không phân biệt được "ba cụm mỗi cụm hai người" với "một cụm mười
   * một người", mà cái thứ hai đáng xem hơn nhiều dù số cụm nhỏ hơn.
   *
   * `HAVING count(*) > 1` trên giá trị KHÁC NULL: dữ liệu trước 30/09 không có dấu vết
   * nào, và gộp chúng thành một cụm "trùng" sẽ báo đỏ cho mọi tài khoản cũ.
   */
  public async readSignupFingerprintSignals(
    referrerId: string,
  ): Promise<IReferralFingerprintSignals> {
    const [row] = await this.manager.query<
      {
        ip_clusters: string;
        device_clusters: string;
        largest_cluster: string;
      }[]
    >(fingerprintSignalsSql('WHERE invite.referrer_id = $1'), [referrerId]);

    return {
      sharedIpClusters: Number(row?.ip_clusters ?? 0),
      sharedDeviceClusters: Number(row?.device_clusters ?? 0),
      largestClusterSize: Number(row?.largest_cluster ?? 0),
    };
  }

  /** Danh sách người được mời cho đường Admin, kèm `rewardEntryId` để đảo bút toán. */
  public async listInviteesForReview(
    referrerId: string,
  ): Promise<IReferralReviewInvitee[]> {
    const rows = await this.manager.query<
      {
        referee_user_id: string;
        username: string;
        qualified_at: Date | null;
        referee_status: string;
        referee_deleted: boolean;
        reward_entry_id: string | null;
        invited_at: Date;
      }[]
    >(
      `
        SELECT
          invite.referee_id AS referee_user_id,
          referee.username,
          invite.qualified_at,
          referee.status AS referee_status,
          (referee.deleted_at IS NOT NULL) AS referee_deleted,
          invite.reward_entry_id::text AS reward_entry_id,
          invite.created_at AS invited_at
        FROM referrals invite
        INNER JOIN users referee ON referee.global_id = invite.referee_id
        WHERE invite.referrer_id = $1
        ORDER BY invite.created_at DESC
        LIMIT $2
      `,
      [referrerId, MaxInviteesReturned],
    );

    return rows.map((row) => ({
      refereeUserId: row.referee_user_id,
      username: row.username,
      status:
        row.qualified_at === null
          ? ('PENDING' as const)
          : ('QUALIFIED' as const),
      refereeStatus: row.referee_status,
      refereeDeleted: row.referee_deleted,
      rewardEntryId: row.reward_entry_id,
      invitedAt: row.invited_at,
    }));
  }

  public async getOwnSummary(userId: string): Promise<IReferralSummary> {
    const [summary] = await this.manager.query<
      {
        code: string;
        total_count: string;
        qualified_count: string;
        rewarded_count: string;
      }[]
    >(
      `
        SELECT
          user_account.referral_code AS code,
          COUNT(referral.id)::text AS total_count,
          COUNT(referral.qualified_at)::text AS qualified_count,
          COUNT(referral.reward_entry_id)::text AS rewarded_count
        FROM users user_account
        LEFT JOIN referrals referral ON referral.referrer_id = user_account.global_id
        WHERE user_account.global_id = $1
        GROUP BY user_account.referral_code
      `,
      [userId],
    );

    if (!summary) {
      return {
        code: '',
        totalCount: 0,
        qualifiedCount: 0,
        rewardedCount: 0,
        invitees: [],
      };
    }

    return {
      code: summary.code ?? '',
      totalCount: Number(summary.total_count),
      qualifiedCount: Number(summary.qualified_count),
      rewardedCount: Number(summary.rewarded_count),
      // Không đọc danh sách khi chưa mời ai: ba con số trên đã nói rồi.
      invitees:
        Number(summary.total_count) === 0
          ? []
          : await this.listInvitees(userId),
    };
  }

  public async findPendingQualifications(limit: number): Promise<string[]> {
    // `rank <> 'VIEWER'` là tín hiệu người được giới thiệu đã hoàn tất
    // onboarding — cùng tín hiệu mà đường gọi thật dùng, xem
    // `findOnboardedUsersMissingReward`.
    const rows = await this.manager.query<{ referee_id: string }[]>(
      `
        SELECT invite.referee_id
        FROM referrals invite
        INNER JOIN users referee ON referee.global_id = invite.referee_id
        INNER JOIN users referrer ON referrer.global_id = invite.referrer_id
        WHERE invite.qualified_at IS NULL
          AND referee.rank <> 'VIEWER'
          AND referee.deleted_at IS NULL
          -- Người MỜI cũng phải còn hoạt động. Thiếu vế này thì qualifyAndAward
          -- từ chối ở dưới mà vòng quét vẫn nhặt lại mỗi lượt point:reconcile — một
          -- vòng lặp vĩnh viễn cho một khoản không bao giờ được ghi. Người bị treo
          -- TẠM rồi được gỡ thì lượt đó lại xuất hiện ở đây: hoãn, không mất.
          AND referrer.status = 'ACTIVE'
          AND referrer.deleted_at IS NULL
        ORDER BY invite.created_at ASC
        LIMIT $1
      `,
      [limit],
    );

    return rows.map((row) => row.referee_id);
  }

  public async qualifyAndAward(params: {
    refereeId: string;
  }): Promise<IReferralQualificationResult> {
    return this.manager.transaction(async (manager) => {
      const [referral] = await manager.query<{ referrer_id: string }[]>(
        `
          SELECT referrer_id
          FROM referrals
          WHERE referee_id = $1
            AND qualified_at IS NULL
          FOR UPDATE
        `,
        [params.refereeId],
      );
      if (!referral) return { qualified: false };

      // Người MỜI phải còn hoạt động Ọ THỜI ĐIỂM TRẢ THƢỞNG, không phải chỉ
      // ở thời điểm đăng ký.
      //
      // Đường đăng ký đã kiểm `status = 'ACTIVE' AND deleted_at IS NULL`, nhưng
      // giữa lúc đăng ký và lúc trả thưởng có cả quá trình onboarding của người
      // được mời — vài ngày, đủ để Admin khoá tài khoản farm. Đo được 30/09: tài
      // khoản đã BANNED và xoá mềm vẫn nhận +56 điểm, và `point:reconcile` vá lại mãi.
      //
      // Từ chối bằng cách HOÃN — để nguyên dòng, không đánh dấu đã tính — cùng cách
      // mà nhánh chạm trần ngày làm: quan hệ giới thiệu là dữ liệu thật, và người bị
      // treo tạm có thể được gỡ vào tuần sau.
      const [referrer] = await manager.query<{ global_id: string }[]>(
        `
          SELECT global_id
          FROM users
          WHERE global_id = $1
            AND status = 'ACTIVE'
            AND deleted_at IS NULL
        `,
        [referral.referrer_id],
      );
      if (!referrer) return { qualified: false };

      // Trigger `enforce_referral_qualification_transition` đòi
      // `reward_entry_id IS NOT NULL`: ở tầng database, "đã đủ điều kiện" ĐỒNG
      // NGHĨA với "đã trả thưởng". Nên khi rule bị tắt hoặc chạm trần ngày, cách
      // đúng là HOÃN — để `qualified_at` vẫn NULL và trả `qualified: false` — chứ
      // không phải ghi một dòng hợp lệ mà không có thưởng, cũng không phải ném
      // ra ngoài và làm hỏng việc hoàn tất onboarding của người được giới thiệu.
      //
      // `point:reconcile` quét lại những lượt đang treo như vậy.
      let award: IAppendPointEntryResult;
      try {
        award = await this.ledger.appendByRuleWithinTransaction(manager, {
          userId: referral.referrer_id,
          ruleCode: 'REFERRAL_QUALIFIED',
          referenceType: 'REFERRAL',
          referenceId: params.refereeId,
          idempotencyKey: `REFERRAL_QUALIFIED:${params.refereeId}`,
          actor: 'SYSTEM',
          source: 'REFERRAL',
        });
      } catch (error) {
        if (isPointPolicyError(error)) return { qualified: false };
        throw error;
      }

      // `AND qualified_at IS NULL` cho phép gọi lại mà không thưởng hai lần.
      // Đọc đúng số dòng khớp mới phân biệt được "vừa đủ điều kiện" với "đã
      // đủ điều kiện từ trước" — trả nhầm là bộ đếm giới thiệu sai theo.
      const qualified = await updateReturning<{ id: string }>(
        manager,
        `
          UPDATE referrals
          SET qualified_at = now(), reward_entry_id = $2
          WHERE referee_id = $1
            AND qualified_at IS NULL
          RETURNING id
        `,
        [params.refereeId, award.entryId],
      );
      if (qualified.length === 0) return { qualified: false };

      // Trả kèm SỐ ĐIỂM để thông báo nói đúng con số. Lấy từ `award` chứ không đọc
      // lại `point_rules`: rule là cấu hình động, và đọc lại có thể ra con số khác
      // với con số vừa ghi vào sổ.
      return {
        qualified: true,
        referrerId: referral.referrer_id,
        // `delta` là mức thay đổi của chính bút toán này — dương với khoản thưởng.
        awardedPoints: award.delta,
      };
    });
  }

  /**
   * Người giới thiệu đang vượt ngưỡng xem xét, nặng trước.
   *
   * ## Tính sống, không lưu cờ
   *
   * Cùng lý lẽ đã ghi ở `GET /admin/reports/reporters`: chỉ Admin đọc nên không có áp lực
   * hiệu năng, mà lưu sẵn thì kéo theo migration backfill, đường tính lại và job đối
   * soát cho mỗi lần đổi ngưỡng. Một cờ lưu sẵn cho điều kiện này còn cũ theo HAI chiều:
   * hạ ngưỡng thì cờ cũ thiếu người, gỡ khoá một referee thì cờ cũ chỉ sai người.
   *
   * ## Hai vế ngưỡng là HOẬC, không phải VÀ
   *
   * Nhiều cụm nhỏ và một cụm rất lớn là hai hình dạng khác nhau của cùng một việc; đòi
   * cả hai cùng vượt là bỏ sót cả hai. Vế nào đặt `0` thì TẮT — xem
   * `DefaultReferralAbuseConfig`.
   */
  public async findReferrersForReview(params: {
    config: IReferralAbuseConfig;
    limit: number;
    offset: number;
  }): Promise<{ entries: IReferralReviewCandidate[]; total: number }> {
    const { config } = params;
    if (!referralAbuseReviewEnabled(config)) return { entries: [], total: 0 };

    // `$3` và `$4` là hai vế ngưỡng. `0` được dịch thành "không bao giờ khớp" chứ
    // không phải "luôn khớp": `>= 0` sẽ đúng với mọi người, tức THÊM mọi người vào
    // hàng đợi thay vì tắt vế đó.
    const deviceThreshold =
      config.minDeviceClusters > 0 ? config.minDeviceClusters : null;
    const sizeThreshold =
      config.minClusterSize > 0 ? config.minClusterSize : null;

    const rows = await this.manager.query<
      {
        referrer_user_id: string;
        username: string;
        qualified_referrals: string;
        ip_clusters: string;
        device_clusters: string;
        largest_cluster: string;
        total: string;
      }[]
    >(
      `
        WITH marks AS (
          SELECT invite.referrer_id, 'IP' AS kind, invite.signup_ip_hash AS value
          FROM referrals invite WHERE invite.signup_ip_hash IS NOT NULL
          UNION ALL
          SELECT invite.referrer_id, 'DEVICE' AS kind, invite.signup_device_hash AS value
          FROM referrals invite WHERE invite.signup_device_hash IS NOT NULL
        ), clusters AS (
          SELECT referrer_id, kind, value, count(*) AS members
          FROM marks
          GROUP BY referrer_id, kind, value
          HAVING count(*) > 1
        ), signals AS (
          SELECT
            referrer_id,
            count(*) FILTER (WHERE kind = 'IP') AS ip_clusters,
            count(*) FILTER (WHERE kind = 'DEVICE') AS device_clusters,
            COALESCE(MAX(members), 0) AS largest_cluster
          FROM clusters
          GROUP BY referrer_id
        ), scored AS (
          SELECT
            signals.referrer_id,
            referrer.username,
            (
              SELECT count(*)
              FROM referrals counted
              WHERE counted.referrer_id = signals.referrer_id
                AND counted.qualified_at IS NOT NULL
            ) AS qualified_referrals,
            signals.ip_clusters,
            signals.device_clusters,
            signals.largest_cluster
          FROM signals
          INNER JOIN users referrer ON referrer.global_id = signals.referrer_id
          WHERE referrer.deleted_at IS NULL
        ), matched AS (
          SELECT * FROM scored
          WHERE qualified_referrals >= $1
            AND (
              ($2::int IS NOT NULL AND device_clusters >= $2::int)
              OR ($3::int IS NOT NULL AND largest_cluster >= $3::int)
            )
        )
        SELECT
          referrer_id AS referrer_user_id,
          username,
          qualified_referrals::text,
          ip_clusters::text,
          device_clusters::text,
          largest_cluster::text,
          count(*) OVER ()::text AS total
        FROM matched
        ORDER BY largest_cluster DESC, device_clusters DESC, username ASC
        LIMIT $4 OFFSET $5
      `,
      [
        config.minQualifiedReferrals,
        deviceThreshold,
        sizeThreshold,
        params.limit,
        params.offset,
      ],
    );

    return {
      entries: rows.map((row) => ({
        referrerUserId: row.referrer_user_id,
        username: row.username,
        qualifiedReferrals: Number(row.qualified_referrals),
        signals: {
          sharedIpClusters: Number(row.ip_clusters),
          sharedDeviceClusters: Number(row.device_clusters),
          largestClusterSize: Number(row.largest_cluster),
        },
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }
}
