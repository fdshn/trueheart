import { IAppendPointEntryResult } from '@/application/contracts/point';
import { isPointPolicyError } from '@/application/implementations/point/point-policy-errors';
import {
  IPointLedgerRepository,
  IReferralInvitee,
  IReferralQualificationResult,
  IReferralRepository,
  IReferralSummary,
} from '@/domain/ports/repository';
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
   * Số cụm dấu vết đăng ký trùng nhau trong danh sách người đã mời.
   *
   * Đếm theo từng loại dấu vết rồi cộng: hai người cùng IP nhưng khác máy và hai người
   * cùng máy nhưng khác IP là hai tín hiệu khác nhau, và gộp chúng thành một là làm mất
   * chính thứ Admin cần để phân biệt "một gia đình dùng chung wifi" với "một người
   * mở mười tài khoản trên một máy".
   *
   * `HAVING COUNT(*) > 1` trên giá trị KHÁC NULL: dữ liệu trước 30/09 không có dấu vết
   * nào, và gộp chúng lại thành một cụm "trùng" sẽ báo đỏ cho mọi tài khoản cũ.
   */
  public async countSharedSignupFingerprints(
    referrerId: string,
  ): Promise<number> {
    const [row] = await this.manager.query<{ clusters: string }[]>(
      `
        WITH fingerprints AS (
          SELECT 'IP' AS kind, signup_ip_hash AS value
          FROM referrals WHERE referrer_id = $1 AND signup_ip_hash IS NOT NULL
          UNION ALL
          SELECT 'DEVICE' AS kind, signup_device_hash AS value
          FROM referrals WHERE referrer_id = $1 AND signup_device_hash IS NOT NULL
        )
        SELECT COUNT(*)::text AS clusters
        FROM (
          SELECT kind, value FROM fingerprints
          GROUP BY kind, value
          HAVING COUNT(*) > 1
        ) shared
      `,
      [referrerId],
    );

    return Number(row?.clusters ?? 0);
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
}
