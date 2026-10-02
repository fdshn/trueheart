import {
  IAdminConfigRepository,
  IAffiliateEventOutcome,
  IAffiliateEventRow,
  IAffiliatePolicyRevision,
  IAffiliateRepository,
  IAffiliateRewardRow,
  IPointLedgerRepository,
  IPublishAffiliatePolicyParams,
  IRecordAffiliateEventParams,
  IReverseAffiliateEventResult,
} from '@/domain/ports/repository';
import {
  AffiliateActiveMemberWindowConfigKey,
  normalizeActiveMemberWindowDays,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  AffiliateEventType,
  AffiliateGeoStatus,
  AffiliateLocationSource,
  AffiliateRewardStatus,
  affiliatePolicyGaps,
  affiliateRewardIdempotencyKey,
  businessDateOf,
  distributeAffiliatePoints,
  normalizeAffiliatePolicy,
  resolveAffiliateLocation,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IPolicyRow {
  version: number;
  enabled: boolean;
  distribution_mode: string;
  event_points_json: unknown;
  daily_cap_per_beneficiary: number;
  max_beneficiaries_per_event: number;
  effective_at: Date;
  reason: string;
  created_by: string | null;
  created_at: Date;
}

const PolicyColumns = `version, enabled, distribution_mode, event_points_json,
       daily_cap_per_beneficiary, max_beneficiaries_per_event, effective_at,
       reason, created_by, created_at`;

function toRevision(row: IPolicyRow): IAffiliatePolicyRevision {
  return {
    version: Number(row.version),
    policy: normalizeAffiliatePolicy({
      enabled: row.enabled,
      distributionMode: row.distribution_mode,
      eventPoints: row.event_points_json,
      dailyCapPerBeneficiary: Number(row.daily_cap_per_beneficiary),
      maxBeneficiariesPerEvent: Number(row.max_beneficiaries_per_event),
    }),
    effectiveAt: row.effective_at,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

@Injectable()
export class AffiliateRepository implements IAffiliateRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  /**
   * Bản đang chạy = version lớn nhất đã tới hiệu lực.
   *
   * `ORDER BY version DESC`, KHÔNG `effective_at DESC` — cùng bẫy đã bắt ở policy
   * điểm danh ngày 02/10: một bản publish SAU với mốc hiệu lực sớm hơn sẽ bị bản
   * publish TRƯỚC đè lên, và tính năng không bật được bằng bất kỳ lượt publish nào.
   */
  private async readActivePolicy(
    manager: EntityManager,
  ): Promise<IAffiliatePolicyRevision | null> {
    const [row] = await manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM affiliate_policy_revisions
       WHERE effective_at <= now()
       ORDER BY version DESC
       LIMIT 1`,
    );
    return row ? toRevision(row) : null;
  }

  public async getActivePolicy(): Promise<IAffiliatePolicyRevision | null> {
    return this.readActivePolicy(this.manager);
  }

  public async listPolicyHistory(
    limit: number,
  ): Promise<IAffiliatePolicyRevision[]> {
    const rows = await this.manager.query<IPolicyRow[]>(
      `SELECT ${PolicyColumns} FROM affiliate_policy_revisions
       ORDER BY version DESC LIMIT $1`,
      [limit],
    );
    return (rows ?? []).map(toRevision);
  }

  public async publishPolicy(
    params: IPublishAffiliatePolicyParams,
  ): Promise<IAffiliatePolicyRevision> {
    return this.manager.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('affiliate_policy_revisions'))",
      );

      const [latest] = await manager.query<{ version: number }[]>(
        `SELECT version FROM affiliate_policy_revisions
         ORDER BY version DESC LIMIT 1`,
      );
      const currentVersion = latest ? Number(latest.version) : null;

      if ((params.expectedVersion ?? null) !== currentVersion)
        throw new ValidationFailedException([
          `expectedVersion: bản hiện tại là ${currentVersion ?? 'chưa có'}, không phải ${params.expectedVersion ?? 'chưa có'}`,
        ]);

      const gaps = affiliatePolicyGaps(params.policy);
      if (gaps.length > 0) throw new ValidationFailedException(gaps);

      const nextVersion = (currentVersion ?? 0) + 1;
      await manager.query(
        `INSERT INTO affiliate_policy_revisions
           (version, enabled, distribution_mode, event_points_json,
            daily_cap_per_beneficiary, max_beneficiaries_per_event,
            effective_at, reason, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
        [
          nextVersion,
          params.policy.enabled,
          params.policy.distributionMode,
          JSON.stringify(params.policy.eventPoints),
          params.policy.dailyCapPerBeneficiary,
          params.policy.maxBeneficiariesPerEvent,
          params.effectiveAt,
          params.reason,
          params.actorUserId,
        ],
      );

      const [row] = await manager.query<IPolicyRow[]>(
        `SELECT ${PolicyColumns} FROM affiliate_policy_revisions WHERE version = $1`,
        [nextVersion],
      );
      return toRevision(row);
    });
  }

  public async recordEvent(
    manager: EntityManager,
    params: IRecordAffiliateEventParams,
  ): Promise<IAffiliateEventOutcome | null> {
    const revision = await this.readActivePolicy(manager);
    // Chưa publish, đang tắt, hoặc thiếu trần — ba trạng thái, cùng một hệ quả:
    // không ghi gì và KHÔNG ném. Ném ở đây làm chết cả đường đăng bài.
    if (!revision?.policy.enabled) return null;
    if (affiliatePolicyGaps(revision.policy).length > 0) return null;

    const policy = revision.policy;
    const eventPoints = policy.eventPoints[params.eventType] ?? 0;

    // Nhóm của người có hành động. Không thuộc nhóm nào thì không có affiliate —
    // Phase 1 depth = 1 nên không đi lên cây nào cả (BR-AFF-01).
    const [group] = await manager.query<
      {
        group_id: string;
        radius_meters: number;
        member_default_lat: number | null;
        member_default_lng: number | null;
      }[]
    >(
      `SELECT team.global_id AS group_id,
              (team.radius_km * 1000)::int AS radius_meters,
              ST_Y(person.default_location::geometry) AS member_default_lat,
              ST_X(person.default_location::geometry) AS member_default_lng
       FROM group_memberships membership
       INNER JOIN groups team
         ON team.global_id = membership.group_id AND team.deleted_at IS NULL
       INNER JOIN users person ON person.global_id = membership.user_id
       WHERE membership.user_id = $1 AND membership.status = 'ACTIVE'
         AND team.status = 'ACTIVE'
       LIMIT 1`,
      [params.sourceUserId],
    );
    if (!group) return null;

    const resolved = resolveAffiliateLocation({
      eventLocation: params.eventLocation,
      transactionLocation: params.transactionLocation,
      postLocation: params.postLocation,
      memberDefaultLocation:
        group.member_default_lat === null || group.member_default_lng === null
          ? null
          : { lat: group.member_default_lat, lng: group.member_default_lng },
    });

    let geoStatus: AffiliateGeoStatus = 'NO_LOCATION';
    let distanceMeters: number | null = null;

    if (resolved.location) {
      // Đo khoảng cách bằng Postgres chứ không bằng JS: cùng một hàm mà
      // `ST_DWithin` dùng, nên không có ca "đo ra 1999m mà ST_DWithin nói ngoài vùng".
      const [measured] = await manager.query<
        { distance_meters: number; inside: boolean }[]
      >(
        `SELECT ST_Distance(point.geo, team.center_location)::int AS distance_meters,
                ST_DWithin(point.geo, team.center_location, $4) AS inside
         FROM groups team,
              (SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS geo) point
         WHERE team.global_id = $1`,
        [
          group.group_id,
          resolved.location.lng,
          resolved.location.lat,
          group.radius_meters,
        ],
      );
      distanceMeters = Number(measured.distance_meters);
      geoStatus = measured.inside ? 'ELIGIBLE' : 'NOT_ELIGIBLE_GEO';
    }

    return this.writeEvent(manager, {
      params,
      revision,
      policy,
      eventPoints,
      groupId: group.group_id,
      radiusMeters: group.radius_meters,
      geoStatus,
      locationSource: resolved.source,
      distanceMeters,
    });
  }

  /** Chèn sự kiện, giải người nhận, chia điểm, áp trần ngày, ghi sổ. */
  private async writeEvent(
    manager: EntityManager,
    input: {
      params: IRecordAffiliateEventParams;
      revision: IAffiliatePolicyRevision;
      policy: IAffiliatePolicyRevision['policy'];
      eventPoints: number;
      groupId: string;
      radiusMeters: number;
      geoStatus: AffiliateGeoStatus;
      locationSource: AffiliateLocationSource;
      distanceMeters: number | null;
    },
  ): Promise<IAffiliateEventOutcome | null> {
    const { params, revision, policy } = input;

    // `ON CONFLICT DO NOTHING` trên khoá nguồn: lượt gọi lại cho cùng sự kiện không
    // ghi thêm, và `rowCount` 0 là tín hiệu "đã xử lý rồi" — trả `null`, không phát
    // điểm lần hai. Đọc trước rồi ghi sẽ lọt ở ca hai tiến trình song song.
    const inserted = await manager.query<{ id: string }[]>(
      `INSERT INTO affiliate_events
         (group_id, source_user_id, event_type, reference_type, reference_id,
          geo_status, location_source, distance_meters, radius_meters,
          beneficiary_count, total_points, policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10)
       ON CONFLICT (group_id, event_type, reference_type, reference_id) DO NOTHING
       RETURNING id`,
      [
        input.groupId,
        params.sourceUserId,
        params.eventType,
        params.referenceType,
        params.referenceId,
        input.geoStatus,
        input.locationSource,
        input.distanceMeters,
        input.radiusMeters,
        revision.version,
      ],
    );
    if (!Array.isArray(inserted) || inserted.length === 0) return null;
    const eventId = String(inserted[0].id);

    const base: IAffiliateEventOutcome = {
      eventId,
      groupId: input.groupId,
      geoStatus: input.geoStatus,
      locationSource: input.locationSource,
      distanceMeters: input.distanceMeters,
      radiusMeters: input.radiusMeters,
      beneficiaryCount: 0,
      totalPoints: 0,
      cappedCount: 0,
    };

    // Ngoài vùng hoặc không có toạ độ: sự kiện ĐÃ được lưu với `geo_status`,
    // `distance_meters` và `radius_meters` — đủ trả lời "vì sao nhóm tôi không được
    // điểm" (BR-GEO-AFF-03). KHÔNG ghi dòng reward 0 điểm cho từng thành viên: với
    // nhóm 500 người thì mỗi sự kiện bị loại sinh 500 dòng vô dụng, và bảng reward
    // sẽ phình nhanh nhất đúng trên đường không phát điểm.
    if (input.geoStatus !== 'ELIGIBLE') return base;

    const windowDays = normalizeActiveMemberWindowDays(
      await this.readActiveMemberWindow(),
    );

    // Active Member = thành viên ACTIVE, tài khoản ACTIVE, còn hoạt động trong cửa
    // sổ, VÀ Vị trí mặc định nằm trong bán kính nhóm. Cùng vị ngữ mà
    // `findAffiliateSnapshot` đếm, nên con số Owner thấy ở `/groups/:id/affiliate`
    // khớp với số người thật sự được chia.
    //
    // `ORDER BY global_id` để thứ tự tiền định: phần dư của `SPLIT_POOL` về những
    // người đầu danh sách, nên thứ tự phải ổn định giữa các lần chạy.
    const beneficiaries = await manager.query<{ user_id: string }[]>(
      `SELECT person.global_id AS user_id
       FROM group_memberships membership
       INNER JOIN groups team ON team.global_id = membership.group_id
       INNER JOIN users person ON person.global_id = membership.user_id
       WHERE membership.group_id = $1 AND membership.status = 'ACTIVE'
         AND person.status = 'ACTIVE'
         AND person.last_active_at >= now() - make_interval(days => $2)
         AND person.default_location IS NOT NULL
         AND ST_DWithin(person.default_location, team.center_location,
                        team.radius_km * 1000)
       ORDER BY person.global_id
       LIMIT $3`,
      [input.groupId, windowDays, policy.maxBeneficiariesPerEvent],
    );

    const shares = distributeAffiliatePoints({
      beneficiaryUserIds: (beneficiaries ?? []).map((row) => row.user_id),
      eventPoints: input.eventPoints,
      mode: policy.distributionMode,
    });

    let totalPoints = 0;
    let cappedCount = 0;
    const today = businessDateOf(new Date());

    for (const share of shares) {
      const awarded = await this.writeReward(manager, {
        eventId,
        input,
        share,
        today,
      });
      if (awarded.status === 'AWARDED') totalPoints += awarded.pointDelta;
      if (awarded.status === 'CAPPED') cappedCount += 1;
    }

    await manager.query(
      `UPDATE affiliate_events
       SET beneficiary_count = $2, total_points = $3 WHERE id = $1`,
      [eventId, shares.length, totalPoints],
    );

    return {
      ...base,
      beneficiaryCount: shares.length,
      totalPoints,
      cappedCount,
    };
  }

  /**
   * Cửa sổ "Active Member", đọc qua `AdminConfigRepository`.
   *
   * KHÔNG viết lại câu SELECT ở đây. Bản đầu của file này có viết, và nó thiếu hai
   * mệnh đề mà `getConfigValue` có: `effective_from <= now()` và `effective_to`. Thiếu
   * cái thứ nhất là đọc trúng một bản hẹn giờ CHƯA tới hạn, tức áp chính sách trước
   * ngày Admin chọn — và nó còn đọc sai cả tên cột (`config_value` thay vì `value_json`),
   * nên hỏng ồn ào ngay. Lần sau có thể chỉ hỏng âm thầm.
   *
   * Đọc NGOÀI transaction là có chủ ý: đây là một bản cấu hình đã publish, không phải
   * dữ liệu mà lượt ghi này tạo ra.
   */
  private async readActiveMemberWindow(): Promise<unknown> {
    return this.adminConfig.getConfigValue(
      AffiliateActiveMemberWindowConfigKey,
    );
  }

  /** Một dòng reward: áp trần ngày rồi ghi sổ nếu còn chỗ. */
  private async writeReward(
    manager: EntityManager,
    args: {
      eventId: string;
      input: {
        params: IRecordAffiliateEventParams;
        revision: IAffiliatePolicyRevision;
        policy: IAffiliatePolicyRevision['policy'];
        groupId: string;
      };
      share: { beneficiaryUserId: string; pointDelta: number };
      today: string;
    },
  ): Promise<{ status: AffiliateRewardStatus; pointDelta: number }> {
    const { input, share } = args;
    const policy = input.policy;

    // Trần NGÀY theo giờ Việt Nam, đếm trên chính bảng này. Đếm ở đây thay vì dựa
    // `daily_cap` của `point_rules` vì affiliate không đi qua `appendByRule` — số
    // điểm phụ thuộc cách chia, không phải một mức cố định của một mã rule.
    const [used] = await manager.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(point_delta), 0)::text AS total
       FROM affiliate_rewards
       WHERE beneficiary_user_id = $1
         AND reward_status = 'AWARDED'
         AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date`,
      [share.beneficiaryUserId, args.today],
    );
    const usedToday = Number(used?.total ?? 0);
    const remaining = policy.dailyCapPerBeneficiary - usedToday;

    const overCap = share.pointDelta > 0 && remaining < share.pointDelta;
    // Cắt bớt cho vừa trần sẽ sinh ra những con số lẻ không ai giải thích được
    // ("hôm nay bạn được 3 điểm cho sự kiện đáng 10"). Chặn CẢ DÒNG và ghi `CAPPED`
    // thì Owner đọc audit thấy rõ: người này đã đầy trần hôm nay.
    const status: AffiliateRewardStatus =
      share.pointDelta === 0 ? 'CAPPED' : overCap ? 'CAPPED' : 'AWARDED';
    const pointDelta = status === 'AWARDED' ? share.pointDelta : 0;

    let ledgerId: number | null = null;
    if (status === 'AWARDED') {
      const entry = await this.ledger.appendAdjustmentWithinTransaction(
        manager,
        {
          userId: share.beneficiaryUserId,
          ruleCode: 'GROUP_AFFILIATE',
          delta: pointDelta,
          referenceType: input.params.referenceType,
          referenceId: input.params.referenceId,
          idempotencyKey: affiliateRewardIdempotencyKey({
            beneficiaryUserId: share.beneficiaryUserId,
            eventType: input.params.eventType as AffiliateEventType,
            referenceType: input.params.referenceType,
            referenceId: input.params.referenceId,
          }),
          actor: 'SYSTEM',
          source: 'GROUP_AFFILIATE',
          reason: `Affiliate nhóm: ${input.params.eventType}`,
        },
      );
      ledgerId = entry.entryId;
    }

    await manager.query(
      `INSERT INTO affiliate_rewards
         (event_id, group_id, source_user_id, beneficiary_user_id, event_type,
          reference_type, reference_id, geo_status, reward_status, point_delta,
          point_ledger_id, idempotency_key, policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ELIGIBLE', $8, $9, $10, $11, $12)
       ON CONFLICT (beneficiary_user_id, event_type, reference_type, reference_id)
       DO NOTHING`,
      [
        args.eventId,
        input.groupId,
        input.params.sourceUserId,
        share.beneficiaryUserId,
        input.params.eventType,
        input.params.referenceType,
        input.params.referenceId,
        status,
        pointDelta,
        ledgerId,
        affiliateRewardIdempotencyKey({
          beneficiaryUserId: share.beneficiaryUserId,
          eventType: input.params.eventType as AffiliateEventType,
          referenceType: input.params.referenceType,
          referenceId: input.params.referenceId,
        }),
        input.revision.version,
      ],
    );

    return { status, pointDelta };
  }

  public async listEvents(query: {
    groupId?: string;
    geoStatus?: AffiliateGeoStatus;
    skip: number;
    take: number;
  }): Promise<{ items: IAffiliateEventRow[]; total: number }> {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (query.groupId) {
      values.push(query.groupId);
      filters.push(`group_id = $${values.length}`);
    }
    if (query.geoStatus) {
      values.push(query.geoStatus);
      filters.push(`geo_status = $${values.length}`);
    }
    values.push(query.take, query.skip);

    const rows = await this.manager.query<Record<string, unknown>[]>(
      `SELECT global_id, group_id, source_user_id, event_type, reference_type,
              reference_id, geo_status, location_source, distance_meters,
              radius_meters, beneficiary_count, total_points, policy_version,
              created_at, COUNT(*) OVER () AS total
       FROM affiliate_events
       ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    return {
      items: (rows ?? []).map((row) => ({
        globalId: String(row.global_id),
        groupId: String(row.group_id),
        sourceUserId: String(row.source_user_id),
        eventType: String(row.event_type),
        referenceType: String(row.reference_type),
        referenceId: String(row.reference_id),
        geoStatus: row.geo_status as AffiliateGeoStatus,
        locationSource: row.location_source as AffiliateLocationSource,
        distanceMeters:
          row.distance_meters === null ? null : Number(row.distance_meters),
        radiusMeters:
          row.radius_meters === null ? null : Number(row.radius_meters),
        beneficiaryCount: Number(row.beneficiary_count),
        totalPoints: Number(row.total_points),
        policyVersion: Number(row.policy_version),
        createdAt: row.created_at as Date,
      })),
      total: Number(rows?.[0]?.total ?? 0),
    };
  }

  public async listRewards(
    eventGlobalId: string,
  ): Promise<IAffiliateRewardRow[]> {
    const rows = await this.manager.query<Record<string, unknown>[]>(
      `SELECT reward.beneficiary_user_id, reward.reward_status, reward.point_delta,
              reward.point_ledger_id, reward.reversed_at
       FROM affiliate_rewards reward
       INNER JOIN affiliate_events event ON event.id = reward.event_id
       WHERE event.global_id = $1
       ORDER BY reward.beneficiary_user_id`,
      [eventGlobalId],
    );

    return (rows ?? []).map((row) => ({
      beneficiaryUserId: String(row.beneficiary_user_id),
      rewardStatus: row.reward_status as AffiliateRewardStatus,
      pointDelta: Number(row.point_delta),
      pointLedgerId:
        row.point_ledger_id === null ? null : Number(row.point_ledger_id),
      reversedAt: (row.reversed_at as Date | null) ?? null,
    }));
  }

  public async reverseEvent(params: {
    eventGlobalId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IReverseAffiliateEventResult> {
    return this.manager.transaction(async (manager) => {
      const [event] = await manager.query<
        { id: string; policy_version: number }[]
      >(
        `SELECT id, policy_version FROM affiliate_events
         WHERE global_id = $1 FOR UPDATE`,
        [params.eventGlobalId],
      );
      if (!event)
        throw new ValidationFailedException([
          `eventGlobalId: không tìm thấy sự kiện ${params.eventGlobalId}`,
        ]);

      // Chỉ những dòng ĐANG ở AWARDED. Gọi lại lần hai thì không còn dòng nào, nên
      // trả 0/0 thay vì ném: thu hồi hai lần là một thao tác vô hại, còn ném làm
      // Admin tưởng lần đầu thất bại.
      const awarded = await manager.query<
        { id: string; beneficiary_user_id: string; point_delta: number }[]
      >(
        `SELECT id, beneficiary_user_id, point_delta FROM affiliate_rewards
         WHERE event_id = $1 AND reward_status = 'AWARDED'
         ORDER BY id
         FOR UPDATE`,
        [event.id],
      );
      if (!awarded || awarded.length === 0)
        return { reversedCount: 0, pointsReclaimed: 0 };

      let pointsReclaimed = 0;

      for (const reward of awarded) {
        const delta = Number(reward.point_delta);

        // GHI THÊM một bút toán ngược, không sửa bút toán gốc — BR-AFF-04 nguyên
        // văn: *"tạo adjustment ledger tương ứng thay vì xóa lịch sử"*. Và
        // `point_ledger` có trigger chặn UPDATE nên không có cách nào khác.
        await this.ledger.appendAdjustmentWithinTransaction(manager, {
          userId: reward.beneficiary_user_id,
          ruleCode: 'GROUP_AFFILIATE_REVERSAL',
          delta: -delta,
          referenceType: 'AFFILIATE_REWARD',
          referenceId: String(reward.id),
          idempotencyKey: `GROUP_AFFILIATE_REVERSAL:${reward.id}`,
          actor: params.actorUserId,
          source: 'GROUP_AFFILIATE',
          reason: params.reason,
        });

        pointsReclaimed += delta;
      }

      // Giữ `point_delta` và `point_ledger_id` — xem chú thích ràng buộc ở migration
      // `1797400000000`. Dòng này nay là bản ghi "đã phát bao nhiêu rồi thu lại".
      const updated = await updateReturning<{ id: string }>(
        manager,
        `UPDATE affiliate_rewards
         SET reward_status = 'REVERSED', reversed_at = now()
         WHERE event_id = $1 AND reward_status = 'AWARDED'
         RETURNING id`,
        [event.id],
      );

      return { reversedCount: updated.length, pointsReclaimed };
    });
  }
}
