import { isPointPolicyError } from '@/application/implementations/point/point-policy-errors';
import {
  CharityCampaignNotClosableException,
  CharityCampaignNotExtendableException,
  CharityCampaignNotFoundException,
  CharityContributionAlreadyDecidedException,
  CharityContributionNotFoundException,
  CharityDeliveryInvalidStateException,
  CharityDeliveryNotFoundException,
  CharityExternalContributionNotFoundException,
  CharityExternalContributionVoidedException,
  CharityLinesInvalidException,
  CharityNeedExceededException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
} from '@/domain/exceptions';
import {
  CharityCampaignPhase,
  CharityDeliveryStatus,
  ICharityBeneficiary,
  ICharityBeneficiaryInput,
  ICharityCampaign,
  ICharityCampaignPage,
  ICharityCampaignRepository,
  ICharityContribution,
  ICharityContributionPage,
  ICharityDelivery,
  ICharityExternalContribution,
  ICharityNeedItem,
  ICharityReview,
  ICloseCampaignResult,
  ICreateCharityCampaignParams,
  ICreateCharityContributionItemParams,
  ICreateCharityContributionParams,
  ICreateCharityNeedItemParams,
  IDecideContributionResult,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import {
  CharityApprovalStatus,
  CharityBeneficiaryRelation,
  CharityCampaignType,
  CharityContributionStatus,
  CharityParticipationStatus,
  CharityRejectionReason,
  CharityReviewRole,
  charityProgressPercent,
  contributionDecisionProblem,
  contributionStatusFrom,
  firstNeedOverflow,
  remainingNeedQuantity,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  title: string;
  slug: string;
  description: string;
  banner_url: string;
  badge_name: string;
  target_items_count: string | number;
  current_items_count: string | number;
  lat: string | number | null;
  lng: string | number | null;
  location_label: string | null;
  start_time: Date;
  end_time: Date;
  is_active: boolean;
  approval_status: string;
  approval_note: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  participant_count: string | number;
  campaign_type: string;
  beneficiary_relation: string | null;
  allow_over_target: boolean;
}

interface IReviewRow {
  global_id: string;
  campaign_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: string;
  rating: string | number;
  comment: string | null;
  created_at: Date;
}

/**
 * Cột đọc ra, dùng CHUNG cho mọi câu SELECT và mọi câu `UPDATE … RETURNING`.
 *
 * Một hằng chứ không chép tay ở tám chỗ: `location` là `geography`, đọc thẳng ra không
 * thành số được, và `ST_Y` là VĨ ĐỘ còn `ST_X` là KINH ĐỘ. Đổi chỗ hai cái là dời hoạt
 * động sang bán cầu khác mà không câu truy vấn nào báo lỗi — nên chỗ dễ sai đó chỉ được
 * phép tồn tại một lần.
 *
 * `participant_count` là CÂU CON, không phải cột. Xem docblock migration `1798200000000`.
 * Nó đếm trên `IDX_campaign_participations_campaign` (index phần, chỉ hàng `REGISTERED`).
 */
interface IContributionRow {
  global_id: string;
  campaign_id: string;
  contributor_id: string;
  status: string;
  note: string | null;
  contact_note: string | null;
  decided_at: Date | null;
  created_at: Date;
  delivery_id: string | null;
  delivery_status: string | null;
}

interface IContributionItemRow {
  contribution_id?: string;
  global_id: string;
  need_item_id: string;
  item_name: string;
  unit: string;
  offered_quantity: string | number;
  condition_note: string | null;
  accepted_quantity: string | number | null;
  rejection_reason: string | null;
}

interface INeedLockRow {
  global_id: string;
  item_name: string;
  target_quantity: number | string;
  accepted_quantity: number | string;
  received_quantity: number | string;
  is_active: boolean;
}

interface IDeliveryRow {
  global_id: string;
  campaign_id: string;
  contribution_id: string;
  contributor_id: string;
  organizer_id: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
}

interface IExternalRow {
  global_id: string;
  campaign_id: string;
  need_item_id: string;
  item_name: string;
  unit: string;
  quantity: number | string;
  source_label: string;
  received_at: Date;
  evidence_note: string | null;
  recorded_by: string;
  status: string;
  replaces_id: string | null;
  voided_at: Date | null;
  void_reason: string | null;
  created_at: Date;
}

const ExternalColumns = `external.global_id, external.campaign_id,
       external.need_item_id, need.item_name, need.unit, external.quantity,
       external.source_label, external.received_at, external.evidence_note,
       external.recorded_by, external.status, external.replaces_id,
       external.voided_at, external.void_reason, external.created_at`;

function toExternal(row: IExternalRow): ICharityExternalContribution {
  return {
    globalId: row.global_id,
    campaignId: row.campaign_id,
    needItemId: row.need_item_id,
    itemName: row.item_name,
    unit: row.unit,
    quantity: Number(row.quantity),
    sourceLabel: row.source_label,
    receivedAt: row.received_at,
    evidenceNote: row.evidence_note,
    recordedBy: row.recorded_by,
    status: row.status as 'ACTIVE' | 'VOIDED',
    replacesId: row.replaces_id,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
  };
}

/** Mã rule của Point Rule từ thiện — seed TẮT ở `1799800000000`. */
const CharityContributionCompletedRuleCode = 'CHARITY_CONTRIBUTION_COMPLETED';

const ContributionColumns = `contribution.global_id, contribution.campaign_id,
       contribution.contributor_id, contribution.status, contribution.note,
       contribution.contact_note, contribution.decided_at,
       contribution.created_at,
       delivery.global_id AS delivery_id, delivery.status AS delivery_status`;

/**
 * Nguồn FROM của mọi lượt đọc đề nghị. LEFT JOIN vì phần lớn đề nghị chưa có lượt
 * giao nhận nào; `UQ_campaign_deliveries_contribution` bảo đảm nó không nhân hàng.
 */
const ContributionSource = `campaign_contributions contribution
       LEFT JOIN campaign_deliveries delivery
         ON delivery.contribution_id = contribution.global_id`;

function toContribution(
  row: IContributionRow,
  items: readonly IContributionItemRow[],
): ICharityContribution {
  return {
    globalId: row.global_id,
    campaignId: row.campaign_id,
    contributorId: row.contributor_id,
    status: row.status as CharityContributionStatus,
    note: row.note,
    contactNote: row.contact_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    deliveryId: row.delivery_id,
    deliveryStatus: row.delivery_status as CharityDeliveryStatus | null,
    items: items.map((item) => ({
      globalId: item.global_id,
      needItemId: item.need_item_id,
      itemName: item.item_name,
      unit: item.unit,
      offeredQuantity: Number(item.offered_quantity),
      conditionNote: item.condition_note,
      // `null` phải giữ `null`: nó nghĩa là "chưa ai quyết", còn `Number(null)` là
      // 0 và 0 nghĩa là "đã xem và không nhận". Hai câu khác nhau hẳn.
      acceptedQuantity:
        item.accepted_quantity === null ? null : Number(item.accepted_quantity),
      rejectionReason: item.rejection_reason as CharityRejectionReason | null,
    })),
  };
}

const Columns = `campaigns.global_id, campaigns.title, campaigns.slug, campaigns.description,
       campaigns.banner_url, campaigns.badge_name,
       campaigns.target_items_count, campaigns.current_items_count,
       ST_Y(campaigns.location::geometry) AS lat,
       ST_X(campaigns.location::geometry) AS lng,
       campaigns.location_label, campaigns.start_time, campaigns.end_time,
       campaigns.is_active, campaigns.approval_status, campaigns.approval_note,
       campaigns.approved_at, campaigns.approved_by, campaigns.created_by,
       campaigns.created_at, campaigns.updated_at,
       campaigns.campaign_type, campaigns.beneficiary_relation,
       campaigns.allow_over_target,
       (SELECT count(*) FROM campaign_participations participation
         WHERE participation.campaign_id = campaigns.global_id
           AND participation.status = 'REGISTERED') AS participant_count`;

/** Mảnh `location` dựng từ hai tham số, hoặc `NULL` khi hoạt động không gắn toạ độ. */
const LocationExpression = `CASE
  WHEN $9::float8 IS NULL THEN NULL
  ELSE ST_SetSRID(ST_MakePoint($10::float8, $9::float8), 4326)::geography
END`;

function toCampaign(row: IRow): ICharityCampaign {
  const targetItemsCount = Number(row.target_items_count);
  const currentItemsCount = Number(row.current_items_count);

  return {
    globalId: row.global_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    bannerUrl: row.banner_url,
    badgeName: row.badge_name,
    targetItemsCount,
    currentItemsCount,
    progressPercent: charityProgressPercent({
      currentItemsCount,
      targetItemsCount,
    }),
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    locationLabel: row.location_label,
    startTime: row.start_time,
    endTime: row.end_time,
    isActive: row.is_active,
    approvalStatus: row.approval_status as CharityApprovalStatus,
    approvalNote: row.approval_note,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    campaignType: row.campaign_type as CharityCampaignType,
    beneficiaryRelation:
      row.beneficiary_relation as CharityBeneficiaryRelation | null,
    allowOverTarget: row.allow_over_target,
    // `count(*)` về đây là CHUỖI. Trả thẳng ra API thì client nhận `"3"` và mọi phép
    // so sánh số ở đó đều sai một cách im lặng.
    participantCount: Number(row.participant_count),
  };
}

function toReview(row: IReviewRow): ICharityReview {
  return {
    globalId: row.global_id,
    campaignId: row.campaign_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    reviewerRole: row.reviewer_role as CharityReviewRole,
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.created_at,
  };
}

/** Điều kiện lọc theo pha thời gian. Mốc là `now()` của database, không phải của Node. */
function phaseFilter(phase: CharityCampaignPhase | undefined): string {
  if (phase === 'UPCOMING') return 'AND campaigns.start_time > now()';
  if (phase === 'ONGOING')
    return 'AND campaigns.start_time <= now() AND campaigns.end_time > now()';
  if (phase === 'ENDED') return 'AND campaigns.end_time <= now()';
  return '';
}

/** Hoạt động hiện được ra ngoài: đã duyệt, còn bật, chưa xoá. */
const PublicFilter = `campaigns.approval_status = 'APPROVED'
      AND campaigns.is_active
      AND campaigns.deleted_at IS NULL`;

@Injectable()
export class CharityCampaignRepository implements ICharityCampaignRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    // Repository gọi repository cùng tầng hạ tầng — cùng lối `GiftTransactionRepository`
    // — vì bút toán điểm phải ghi TRONG transaction hoàn tất lượt giao nhận. Ngoài nó
    // thì một lượt giao nhận commit xong mà điểm chưa ghi là mất vĩnh viễn.
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async create(
    params: ICreateCharityCampaignParams,
  ): Promise<ICharityCampaign> {
    // Hoạt động và bảng nhu cầu ghi trong MỘT transaction (F65b §3). Hai lượt ghi
    // rời sẽ để lại một kêu gọi công khai không nói cần gì, nếu lượt thứ hai hỏng
    // — và với quyền public-ngay thì nó công khai thật, không chờ ai đọc lại.
    return this.manager.transaction(async (manager) => {
      const campaign = await this.insertCampaign(manager, params);
      if (params.needs.length > 0)
        await this.insertNeeds(manager, campaign.globalId, params.needs);
      if (params.beneficiary)
        await this.writeBeneficiary(
          manager,
          campaign.globalId,
          params.createdBy,
          params.beneficiary,
        );
      return campaign;
    });
  }

  private async insertCampaign(
    manager: EntityManager,
    params: ICreateCharityCampaignParams,
  ): Promise<ICharityCampaign> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]` — chỉ
    // `UPDATE`/`DELETE` bị. Nên chỗ này đọc thẳng `rows[0]`, không qua `updateReturning`.
    const [row] = await manager.query<IRow[]>(
      `WITH inserted AS (
         INSERT INTO campaigns
           (title, slug, description, banner_url, badge_name, target_items_count,
            location, location_label, start_time, end_time,
            created_by, approval_status, approved_by, approved_at,
            campaign_type, beneficiary_relation, allow_over_target)
         VALUES ($1, $2, $3, $4, $5, $6, ${LocationExpression}, $8, $7, $11,
                 $12, $13, $14,
                 CASE WHEN $15 = 'PENDING_APPROVAL' THEN NULL ELSE now() END,
                 $16, $17, $18)
         RETURNING *
       )
       SELECT ${Columns} FROM inserted AS campaigns`,
      [
        params.title,
        params.slug,
        params.description,
        params.bannerUrl,
        params.badgeName,
        params.targetItemsCount,
        params.startTime,
        params.locationLabel,
        params.lat,
        params.lng,
        params.endTime,
        params.createdBy,
        params.approvalStatus,
        params.approvedBy,
        // Truyền `approvalStatus` LẦN HAI làm `$15`.
        //
        // Dùng một tham số vừa ở vị trí VALUES (cột `varchar(30)`) vừa trong phép so
        // `= 'PENDING_APPROVAL'` (hằng `text`) làm Postgres ném "inconsistent types
        // deduced for parameter" — đúng lỗi đã gặp ở F47. Hai số hiệu thì không còn gì
        // phải suy diễn.
        params.approvalStatus,
        params.campaignType,
        params.beneficiaryRelation,
        params.allowOverTarget,
      ],
    );
    return toCampaign(row);
  }

  /**
   * Chèn bảng nhu cầu bằng MỘT câu lệnh, không vòng lặp.
   *
   * `unnest` chứ không `n` lượt `INSERT`: ràng buộc
   * `UQ_campaign_need_items_name_unit` phải thấy cả lô cùng lúc, nếu không hai dòng
   * trùng tên+đơn vị trong CÙNG request sẽ chèn được dòng đầu rồi mới ném ở dòng
   * sau — và nơi gọi không có cách nào nói "dòng thứ mấy".
   */
  private async insertNeeds(
    manager: EntityManager,
    campaignId: string,
    needs: readonly ICreateCharityNeedItemParams[],
  ): Promise<void> {
    await manager.query(
      `INSERT INTO campaign_need_items
         (campaign_id, category_id, item_name, description, unit,
          target_quantity, allow_alternative, sort_order)
       SELECT $1, item.category_id, item.item_name, item.description, item.unit,
              item.target_quantity, item.allow_alternative, item.sort_order
       FROM UNNEST(
         $2::uuid[], $3::text[], $4::text[], $5::text[],
         $6::int[], $7::boolean[], $8::int[]
       ) AS item(category_id, item_name, description, unit,
                 target_quantity, allow_alternative, sort_order)`,
      [
        campaignId,
        needs.map((need) => need.categoryId),
        needs.map((need) => need.itemName),
        needs.map((need) => need.description),
        needs.map((need) => need.unit),
        needs.map((need) => need.targetQuantity),
        needs.map((need) => need.allowAlternative),
        needs.map((need) => need.sortOrder),
      ],
    );
  }

  public async listNeeds(campaignId: string): Promise<ICharityNeedItem[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        category_id: string | null;
        item_name: string;
        description: string | null;
        unit: string;
        target_quantity: number;
        allow_alternative: boolean;
        accepted_quantity: number;
        received_quantity: number;
        sort_order: number;
        is_active: boolean;
        pending_quantity: string | number;
      }[]
    >(
      // `pending_quantity` ĐẾM LÚC ĐỌC, không phải cột: §3 nói nó không giữ chỗ,
      // nên một con số lưu sẵn mà không ai được dựa vào là mời người sau dựa vào
      // nó. Mỗi chiến dịch có vài chục dòng nhu cầu nên đây không phải chỗ cần
      // tối ưu; đổi lại nó không bao giờ lệch.
      `SELECT need.global_id, need.category_id, need.item_name, need.description,
              need.unit, need.target_quantity, need.allow_alternative,
              need.accepted_quantity, need.received_quantity, need.sort_order,
              need.is_active,
              COALESCE((
                SELECT SUM(item.offered_quantity)
                FROM campaign_contribution_items item
                INNER JOIN campaign_contributions contribution
                  ON contribution.global_id = item.contribution_id
                WHERE item.need_item_id = need.global_id
                  AND contribution.status = 'PENDING_REVIEW'
              ), 0) AS pending_quantity
       FROM campaign_need_items need
       WHERE need.campaign_id = $1
       ORDER BY need.sort_order, need.id`,
      [campaignId],
    );

    return rows.map((row) => {
      const targetQuantity = Number(row.target_quantity);
      const acceptedQuantity = Number(row.accepted_quantity);
      const receivedQuantity = Number(row.received_quantity);
      return {
        globalId: row.global_id,
        categoryId: row.category_id,
        itemName: row.item_name,
        description: row.description,
        unit: row.unit,
        targetQuantity,
        allowAlternative: row.allow_alternative,
        acceptedQuantity,
        receivedQuantity,
        // Tính ở ĐÂY chứ không trong SQL: `remainingNeedQuantity` là hàm thuần có
        // phép kiểm riêng, và hai nơi tính cùng một con số là hai nơi sẽ trôi.
        remainingQuantity: remainingNeedQuantity({
          targetQuantity,
          acceptedQuantity,
          receivedQuantity,
        }),
        // `SUM` của Postgres trả `numeric`, và node-pg đưa `numeric` về CHUỖI.
        // Thiếu `Number()` thì client nhận `"60"` và mọi phép so ở đó lệch âm thầm
        // — cùng cái bẫy đã gặp ở `participant_count`.
        pendingQuantity: Number(row.pending_quantity),
        sortOrder: Number(row.sort_order),
        isActive: row.is_active,
      };
    });
  }

  public async createContribution(
    params: ICreateCharityContributionParams,
  ): Promise<ICharityContribution> {
    return this.manager.transaction(async (manager) => {
      const [header] = await manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_contributions
           (campaign_id, contributor_id, note, contact_note)
         VALUES ($1, $2, $3, $4)
         RETURNING global_id`,
        [
          params.campaignId,
          params.contributorId,
          params.note,
          params.contactNote,
        ],
      );

      await this.insertContributionItems(
        manager,
        header.global_id,
        params.items,
      );

      const created = await this.readContribution(manager, header.global_id);
      // Không bao giờ `null` ở đây — vừa chèn trong cùng transaction. Ném thay vì
      // `!` để một lỗi tương lai ở `readContribution` lộ ra ngay chỗ nó xảy ra.
      if (!created)
        throw new Error(
          'createContribution: không đọc lại được đề nghị vừa ghi',
        );
      return created;
    });
  }

  private async insertContributionItems(
    manager: EntityManager,
    contributionId: string,
    items: readonly ICreateCharityContributionItemParams[],
  ): Promise<void> {
    // Một câu lệnh cho cả lô, cùng lý do như bảng nhu cầu: ràng buộc
    // `UQ_campaign_contribution_items_one_per_need` phải thấy cả lô cùng lúc.
    await manager.query(
      `INSERT INTO campaign_contribution_items
         (contribution_id, need_item_id, offered_quantity, condition_note)
       SELECT $1, item.need_item_id, item.offered_quantity, item.condition_note
       FROM UNNEST($2::uuid[], $3::int[], $4::text[])
         AS item(need_item_id, offered_quantity, condition_note)`,
      [
        contributionId,
        items.map((item) => item.needItemId),
        items.map((item) => item.offeredQuantity),
        items.map((item) => item.conditionNote),
      ],
    );
  }

  private async readContribution(
    manager: EntityManager,
    globalId: string,
  ): Promise<ICharityContribution | null> {
    const [row] = await manager.query<IContributionRow[]>(
      `SELECT ${ContributionColumns}
       FROM ${ContributionSource}
       WHERE contribution.global_id = $1`,
      [globalId],
    );
    if (!row) return null;

    const items = await manager.query<IContributionItemRow[]>(
      `SELECT item.global_id, item.need_item_id, need.item_name, need.unit,
              item.offered_quantity, item.condition_note,
              item.accepted_quantity, item.rejection_reason
       FROM campaign_contribution_items item
       INNER JOIN campaign_need_items need
         ON need.global_id = item.need_item_id
       WHERE item.contribution_id = $1
       ORDER BY need.sort_order, item.id`,
      [globalId],
    );

    return toContribution(row, items);
  }

  public async findContributionByGlobalId(
    globalId: string,
  ): Promise<ICharityContribution | null> {
    return this.readContribution(this.manager, globalId);
  }

  public async listContributionsByCampaign(params: {
    campaignId: string;
    status?: CharityContributionStatus;
    limit: number;
    offset: number;
  }): Promise<ICharityContributionPage> {
    return this.listContributions({
      where: `contribution.campaign_id = $1
              AND ($2::text IS NULL OR contribution.status = $2)`,
      values: [params.campaignId, params.status ?? null],
      limit: params.limit,
      offset: params.offset,
    });
  }

  public async listContributionsByContributor(params: {
    contributorId: string;
    limit: number;
    offset: number;
  }): Promise<ICharityContributionPage> {
    return this.listContributions({
      where: `contribution.contributor_id = $1 AND $2::text IS NULL`,
      values: [params.contributorId, null],
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * Một đường đọc cho cả hai danh sách.
   *
   * `$2::text IS NULL` ở đường contributor trông lạ nhưng có lý do đo được:
   * Postgres từ chối một câu lệnh có tham số được TRUYỀN mà không chỗ nào tham
   * chiếu — `could not determine data type of parameter`. Hai câu `where` khác nhau
   * dùng chung một bộ tham số thì tham số nào cũng phải xuất hiện.
   */
  private async listContributions(params: {
    where: string;
    values: unknown[];
    limit: number;
    offset: number;
  }): Promise<ICharityContributionPage> {
    const rows = await this.manager.query<IContributionRow[]>(
      `SELECT ${ContributionColumns}
       FROM ${ContributionSource}
       WHERE ${params.where}
       ORDER BY contribution.created_at DESC, contribution.id DESC
       LIMIT $3 OFFSET $4`,
      [...params.values, params.limit, params.offset],
    );
    const [count] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total
       FROM campaign_contributions contribution
       WHERE ${params.where}`,
      params.values,
    );

    if (rows.length === 0)
      return { items: [], total: Number(count?.total ?? 0) };

    const items = await this.manager.query<IContributionItemRow[]>(
      `SELECT item.contribution_id, item.global_id, item.need_item_id,
              need.item_name, need.unit, item.offered_quantity,
              item.condition_note, item.accepted_quantity, item.rejection_reason
       FROM campaign_contribution_items item
       INNER JOIN campaign_need_items need
         ON need.global_id = item.need_item_id
       WHERE item.contribution_id = ANY($1::uuid[])
       ORDER BY need.sort_order, item.id`,
      [rows.map((row) => row.global_id)],
    );

    return {
      items: rows.map((row) =>
        toContribution(
          row,
          items.filter((item) => item.contribution_id === row.global_id),
        ),
      ),
      total: Number(count?.total ?? 0),
    };
  }

  public async replaceContribution(params: {
    contributionId: string;
    contributorId: string;
    note: string | null;
    contactNote: string | null;
    items: readonly ICreateCharityContributionItemParams[];
  }): Promise<ICharityContribution | null> {
    return this.manager.transaction(async (manager) => {
      // `status = 'PENDING_REVIEW'` trong WHERE, không chỉ ở tầng trên: hai request
      // sửa song song đều đọc thấy còn sửa được rồi cùng ghi, và đây là chỗ duy
      // nhất thấy cái thứ hai.
      const updated = await updateReturning<{ global_id: string }>(
        manager,
        `UPDATE campaign_contributions
         SET note = $3, contact_note = $4, updated_at = now()
         WHERE global_id = $1 AND contributor_id = $2
           AND status = 'PENDING_REVIEW'
         RETURNING global_id`,
        [
          params.contributionId,
          params.contributorId,
          params.note,
          params.contactNote,
        ],
      );
      if (updated.length === 0) return null;

      // Thay TRỌN bộ dòng: một lượt sửa là một bản đề nghị đầy đủ. Vá từng dòng thì
      // việc BỎ một dòng không diễn đạt được.
      await manager.query(
        `DELETE FROM campaign_contribution_items WHERE contribution_id = $1`,
        [params.contributionId],
      );
      await this.insertContributionItems(
        manager,
        params.contributionId,
        params.items,
      );

      return this.readContribution(manager, params.contributionId);
    });
  }

  /**
   * Khoá chiến dịch rồi khoá MỌI dòng nhu cầu của nó theo `id` tăng dần.
   *
   * Đây là hai bước đầu của thứ tự khoá cố định (§5), dùng chung cho cả ba đường
   * ghi vào projection: quyết định, hoàn tất, huỷ. Một hàm cho cả ba nghĩa là không
   * đường nào lỡ tay đảo thứ tự.
   */
  private async lockCampaignAndNeeds(
    manager: EntityManager,
    campaignId: string,
  ): Promise<{
    campaign: {
      approval_status: string;
      is_active: boolean;
      created_by: string | null;
      allow_over_target: boolean;
      end_time: Date;
    };
    needs: INeedLockRow[];
  }> {
    const [campaign] = await manager.query<
      {
        approval_status: string;
        is_active: boolean;
        created_by: string | null;
        allow_over_target: boolean;
        end_time: Date;
      }[]
    >(
      `SELECT approval_status, is_active, created_by, allow_over_target, end_time
       FROM campaigns WHERE global_id = $1 FOR UPDATE`,
      [campaignId],
    );
    if (!campaign) throw new CharityCampaignNotFoundException();

    const needs = await manager.query<INeedLockRow[]>(
      `SELECT global_id, item_name, target_quantity, accepted_quantity,
              received_quantity, is_active
       FROM campaign_need_items
       WHERE campaign_id = $1
       ORDER BY id
       FOR UPDATE`,
      [campaignId],
    );
    return { campaign, needs };
  }

  /**
   * Quyền ĐIỀU PHỐI, đọc TRONG transaction đang giữ khoá chiến dịch.
   *
   * Đọc ở đây chứ không tin một kết quả đọc trước đó: thu quyền coordinator giữa lúc
   * mở màn hình và lúc bấm phải có hiệu lực ngay.
   */
  private async managesWithin(
    manager: EntityManager,
    campaign: { created_by: string | null },
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    if (campaign.created_by === userId) return true;
    const [row] = await manager.query<{ found: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM campaign_coordinators
         WHERE campaign_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ) AS found`,
      [campaignId, userId],
    );
    return row.found;
  }

  /**
   * Cộng/trừ projection của nhiều dòng nhu cầu trong MỘT câu lệnh.
   *
   * Gọi chỉ sau `lockCampaignAndNeeds` trong cùng transaction — những dòng này đã bị
   * khoá, nên phép cộng ở đây không đua với ai.
   */
  private async shiftNeedProjections(
    manager: EntityManager,
    shifts: readonly {
      needItemId: string;
      acceptedDelta: number;
      receivedDelta: number;
    }[],
  ): Promise<void> {
    if (shifts.length === 0) return;
    await manager.query(
      `UPDATE campaign_need_items need
       SET accepted_quantity = need.accepted_quantity + shift.accepted_delta,
           received_quantity = need.received_quantity + shift.received_delta,
           updated_at = now()
       FROM UNNEST($1::uuid[], $2::int[], $3::int[])
         AS shift(need_item_id, accepted_delta, received_delta)
       WHERE need.global_id = shift.need_item_id`,
      [
        shifts.map((shift) => shift.needItemId),
        shifts.map((shift) => shift.acceptedDelta),
        shifts.map((shift) => shift.receivedDelta),
      ],
    );
  }

  public async decideContribution(params: {
    contributionId: string;
    organizerId: string;
    decisionKey: string;
    decisions: readonly {
      contributionItemId: string;
      acceptedQuantity: number;
      rejectionReason?: CharityRejectionReason | null;
    }[];
  }): Promise<IDecideContributionResult> {
    return this.manager.transaction(async (manager) => {
      // Đọc KHÔNG khoá để biết chiến dịch nào — thứ tự khoá đòi khoá chiến dịch
      // TRƯỚC đề nghị, nên chưa được khoá đề nghị ở bước này.
      const [peek] = await manager.query<{ campaign_id: string }[]>(
        `SELECT campaign_id FROM campaign_contributions WHERE global_id = $1`,
        [params.contributionId],
      );
      if (!peek) throw new CharityContributionNotFoundException();

      const { campaign, needs } = await this.lockCampaignAndNeeds(
        manager,
        peek.campaign_id,
      );
      if (
        !(await this.managesWithin(
          manager,
          campaign,
          peek.campaign_id,
          params.organizerId,
        ))
      )
        throw new CharityNotOrganizerException();

      const [contribution] = await manager.query<
        {
          status: string;
          decision_key: string | null;
          contributor_id: string;
        }[]
      >(
        `SELECT status, decision_key, contributor_id
         FROM campaign_contributions WHERE global_id = $1 FOR UPDATE`,
        [params.contributionId],
      );

      // Retry CÙNG khoá: trả lại đúng kết quả cũ, không ghi gì. Kiểm SAU khi đã
      // khoá, nên hai lượt retry song song cũng chỉ một lượt thấy trạng thái chờ.
      if (contribution.decision_key === params.decisionKey)
        return {
          contribution: await this.mustReadContribution(
            manager,
            params.contributionId,
          ),
          delivery: await this.readDeliveryByContribution(
            manager,
            params.contributionId,
          ),
          replayed: true,
        };

      if (contribution.status !== 'PENDING_REVIEW')
        throw new CharityContributionAlreadyDecidedException();
      // Chiến dịch đã đóng hoặc đình chỉ thì không nhận thêm. KHÔNG xét `end_time`:
      // hết giờ mà người tổ chức chưa đóng thì họ vẫn phải xử nốt hàng đợi được.
      if (campaign.approval_status !== 'APPROVED' || !campaign.is_active)
        throw new CharityNotAcceptingContributionsException();

      const lines = await manager.query<
        {
          global_id: string;
          need_item_id: string;
          offered_quantity: number | string;
        }[]
      >(
        `SELECT global_id, need_item_id, offered_quantity
         FROM campaign_contribution_items
         WHERE contribution_id = $1
         ORDER BY id
         FOR UPDATE`,
        [params.contributionId],
      );
      const forDecision = lines.map((line) => ({
        contributionItemId: line.global_id,
        needItemId: line.need_item_id,
        offeredQuantity: Number(line.offered_quantity),
      }));

      const problem = contributionDecisionProblem(
        forDecision,
        params.decisions,
      );
      if (problem) throw new CharityLinesInvalidException(problem);

      const needById = new Map(needs.map((need) => [need.global_id, need]));
      const decided = forDecision.map((line) => {
        const decision = params.decisions.find(
          (item) => item.contributionItemId === line.contributionItemId,
        ) as (typeof params.decisions)[number];
        return {
          ...line,
          acceptedQuantity: decision.acceptedQuantity,
          rejectionReason: decision.rejectionReason ?? null,
        };
      });

      // Nhận vào một dòng nhu cầu người tổ chức đã RÚT là nhận vào một nhu cầu không
      // còn ai cần. Từ chối dòng đó thì vẫn được — đó là cách dọn nó.
      const intoClosedNeed = decided.find(
        (line) =>
          line.acceptedQuantity > 0 &&
          !needById.get(line.needItemId)?.is_active,
      );
      if (intoClosedNeed)
        throw new CharityLinesInvalidException(
          `Dòng ${intoClosedNeed.contributionItemId}: nhu cầu này đã được rút, chỉ từ chối được`,
        );

      const overflow = firstNeedOverflow(
        needs.map((need) => ({
          needItemId: need.global_id,
          itemName: need.item_name,
          targetQuantity: Number(need.target_quantity),
          acceptedQuantity: Number(need.accepted_quantity),
          receivedQuantity: Number(need.received_quantity),
        })),
        decided,
        campaign.allow_over_target,
      );
      if (overflow)
        throw new CharityNeedExceededException(
          overflow.itemName,
          overflow.requested,
          overflow.remaining,
        );

      await manager.query(
        `UPDATE campaign_contribution_items item
         SET accepted_quantity = decided.accepted_quantity,
             rejection_reason = decided.rejection_reason,
             updated_at = now()
         FROM UNNEST($1::uuid[], $2::int[], $3::text[])
           AS decided(global_id, accepted_quantity, rejection_reason)
         WHERE item.global_id = decided.global_id`,
        [
          decided.map((line) => line.contributionItemId),
          decided.map((line) => line.acceptedQuantity),
          decided.map((line) => line.rejectionReason),
        ],
      );

      await manager.query(
        `UPDATE campaign_contributions
         SET status = $2, decided_at = now(), decided_by = $3,
             decision_key = $4, updated_at = now()
         WHERE global_id = $1`,
        [
          params.contributionId,
          contributionStatusFrom(decided),
          params.organizerId,
          params.decisionKey,
        ],
      );

      const accepted = decided.filter((line) => line.acceptedQuantity > 0);
      await this.shiftNeedProjections(
        manager,
        accepted.map((line) => ({
          needItemId: line.needItemId,
          acceptedDelta: line.acceptedQuantity,
          receivedDelta: 0,
        })),
      );

      // Chỉ phần được NHẬN mới sinh lượt giao nhận (§6). Từ chối hết thì không có
      // lượt giao nhận rác nào.
      if (accepted.length > 0) {
        const [delivery] = await manager.query<{ global_id: string }[]>(
          `INSERT INTO campaign_deliveries
             (campaign_id, contribution_id, contributor_id, organizer_id)
           VALUES ($1, $2, $3, $4)
           RETURNING global_id`,
          [
            peek.campaign_id,
            params.contributionId,
            contribution.contributor_id,
            params.organizerId,
          ],
        );
        await manager.query(
          `INSERT INTO campaign_delivery_items
             (delivery_id, contribution_item_id, need_item_id, accepted_quantity)
           SELECT $1, line.contribution_item_id, line.need_item_id,
                  line.accepted_quantity
           FROM UNNEST($2::uuid[], $3::uuid[], $4::int[])
             AS line(contribution_item_id, need_item_id, accepted_quantity)`,
          [
            delivery.global_id,
            accepted.map((line) => line.contributionItemId),
            accepted.map((line) => line.needItemId),
            accepted.map((line) => line.acceptedQuantity),
          ],
        );
      }

      return {
        contribution: await this.mustReadContribution(
          manager,
          params.contributionId,
        ),
        delivery: await this.readDeliveryByContribution(
          manager,
          params.contributionId,
        ),
        replayed: false,
      };
    });
  }

  public async completeDelivery(params: {
    deliveryId: string;
    organizerId: string;
    received: readonly { needItemId: string; receivedQuantity: number }[];
  }): Promise<ICharityDelivery> {
    return this.manager.transaction(async (manager) => {
      const delivery = await this.lockDeliveryInOrder(
        manager,
        params.deliveryId,
      );
      // Người tổ chức hoặc một coordinator còn hiệu lực xác nhận — không nhất thiết là
      // người đã xét: lượt giao có thể được nhận ở điểm tập kết do người khác trực.
      if (
        !(await this.managesWithin(
          manager,
          { created_by: delivery.campaign_created_by },
          delivery.campaign_id,
          params.organizerId,
        ))
      )
        throw new CharityNotOrganizerException();
      if (delivery.status !== 'ACCEPTED')
        throw new CharityDeliveryInvalidStateException(delivery.status);

      const items = await manager.query<
        { need_item_id: string; accepted_quantity: number | string }[]
      >(
        `SELECT need_item_id, accepted_quantity
         FROM campaign_delivery_items
         WHERE delivery_id = $1
         ORDER BY id
         FOR UPDATE`,
        [params.deliveryId],
      );

      // Xác nhận ĐỦ mọi dòng, mỗi dòng một lần, trong [0, accepted]. Bỏ sót một dòng
      // là để lại một phần đã chấp nhận không bao giờ được trả về nhu cầu.
      const received = new Map<string, number>();
      for (const line of params.received) {
        if (received.has(line.needItemId))
          throw new CharityLinesInvalidException(
            `Dòng ${line.needItemId} được xác nhận hai lần`,
          );
        received.set(line.needItemId, line.receivedQuantity);
      }
      if (received.size !== items.length)
        throw new CharityLinesInvalidException(
          'Phải xác nhận đủ mọi dòng của lượt giao nhận',
        );
      for (const item of items) {
        const quantity = received.get(item.need_item_id);
        const accepted = Number(item.accepted_quantity);
        if (
          quantity === undefined ||
          !Number.isInteger(quantity) ||
          quantity < 0 ||
          quantity > accepted
        )
          throw new CharityLinesInvalidException(
            `Dòng ${item.need_item_id}: số thực nhận phải từ 0 tới ${accepted}`,
          );
      }

      await manager.query(
        `UPDATE campaign_delivery_items item
         SET received_quantity = line.received_quantity
         FROM UNNEST($2::uuid[], $3::int[]) AS line(need_item_id, received_quantity)
         WHERE item.delivery_id = $1 AND item.need_item_id = line.need_item_id`,
        [params.deliveryId, [...received.keys()], [...received.values()]],
      );

      // Phần đã chấp nhận RỜI khỏi `accepted_quantity` theo đúng số đã chấp nhận,
      // còn `received_quantity` chỉ nhận số THỰC NHẬN. Thiếu hụt giữa hai số trở về
      // phần còn thiếu của nhu cầu — người khác lại tặng vào được.
      await this.shiftNeedProjections(
        manager,
        items.map((item) => ({
          needItemId: item.need_item_id,
          acceptedDelta: -Number(item.accepted_quantity),
          receivedDelta: received.get(item.need_item_id) ?? 0,
        })),
      );

      await manager.query(
        `UPDATE campaign_deliveries
         SET status = 'COMPLETED', completed_at = now(), completed_by = $2
         WHERE global_id = $1`,
        [params.deliveryId, params.organizerId],
      );

      // Một lần cho mỗi ĐỀ NGHỊ, không cho từng dòng hay từng lượt giao (§7). Khoá
      // chống trùng theo `contribution_id` làm điều đó thành tính chất của sổ điểm.
      //
      // Chỉ khi thực nhận được ít nhất một thứ: một lượt "hoàn tất" mà người tổ chức
      // xác nhận không nhận được gì không phải một đóng góp — thưởng cho nó là mở
      // đường cho hai người thông đồng cày điểm.
      const totalReceived = [...received.values()].reduce((a, b) => a + b, 0);
      if (totalReceived > 0) {
        try {
          await this.ledger.appendByRuleWithinTransaction(manager, {
            userId: delivery.contributor_id,
            ruleCode: CharityContributionCompletedRuleCode,
            referenceType: 'CHARITY_CONTRIBUTION',
            referenceId: delivery.contribution_id,
            idempotencyKey: `${CharityContributionCompletedRuleCode}:${delivery.contribution_id}`,
            actor: 'SYSTEM',
            source: 'CHARITY_DELIVERY',
          });
        } catch (error) {
          // Rule đang TẮT chờ Bên A chốt mức — đó là trường hợp BÌNH THƯỜNG lúc này,
          // không phải lỗi. Việc món đồ đã tới tay là sự thật; thưởng bao nhiêu là
          // chính sách, và chính sách không được đánh đổ sự thật.
          if (!isPointPolicyError(error)) throw error;
        }
      }

      return this.mustReadDelivery(manager, params.deliveryId);
    });
  }

  public async cancelDelivery(params: {
    deliveryId: string;
    actorUserId: string;
    reason: string;
  }): Promise<ICharityDelivery> {
    return this.manager.transaction(async (manager) => {
      const delivery = await this.lockDeliveryInOrder(
        manager,
        params.deliveryId,
      );
      const isParty =
        delivery.contributor_id === params.actorUserId ||
        (await this.managesWithin(
          manager,
          { created_by: delivery.campaign_created_by },
          delivery.campaign_id,
          params.actorUserId,
        ));
      // Người ngoài nhận cùng lỗi với lượt không tồn tại.
      if (!isParty) throw new CharityDeliveryNotFoundException();
      if (delivery.status !== 'ACCEPTED')
        throw new CharityDeliveryInvalidStateException(delivery.status);

      const items = await manager.query<
        { need_item_id: string; accepted_quantity: number | string }[]
      >(
        `SELECT need_item_id, accepted_quantity
         FROM campaign_delivery_items WHERE delivery_id = $1 ORDER BY id`,
        [params.deliveryId],
      );

      // Trả phần đã chấp nhận về nhu cầu, KHÔNG cộng vào phần đã nhận (§6), và KHÔNG
      // đụng đề nghị: nó vẫn là lịch sử của một cam kết đã được chấp nhận (§11.4).
      await this.shiftNeedProjections(
        manager,
        items.map((item) => ({
          needItemId: item.need_item_id,
          acceptedDelta: -Number(item.accepted_quantity),
          receivedDelta: 0,
        })),
      );

      await manager.query(
        `UPDATE campaign_deliveries
         SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2,
             cancel_reason = $3
         WHERE global_id = $1`,
        [params.deliveryId, params.actorUserId, params.reason],
      );

      return this.mustReadDelivery(manager, params.deliveryId);
    });
  }

  /**
   * Khoá lượt giao nhận ĐÚNG thứ tự: chiến dịch → dòng nhu cầu → lượt giao.
   *
   * Đọc không khoá trước để biết chiến dịch nào, vì khoá lượt giao trước rồi mới khoá
   * chiến dịch là đảo thứ tự so với `decideContribution` — hai đường đó chạy cùng lúc
   * trên cùng chiến dịch là deadlock.
   */
  private async lockDeliveryInOrder(
    manager: EntityManager,
    deliveryId: string,
  ): Promise<{
    campaign_id: string;
    contribution_id: string;
    contributor_id: string;
    organizer_id: string;
    status: string;
    campaign_created_by: string | null;
  }> {
    const [peek] = await manager.query<{ campaign_id: string }[]>(
      `SELECT campaign_id FROM campaign_deliveries WHERE global_id = $1`,
      [deliveryId],
    );
    if (!peek) throw new CharityDeliveryNotFoundException();

    const { campaign } = await this.lockCampaignAndNeeds(
      manager,
      peek.campaign_id,
    );

    const [delivery] = await manager.query<
      {
        campaign_id: string;
        contribution_id: string;
        contributor_id: string;
        organizer_id: string;
        status: string;
      }[]
    >(
      `SELECT campaign_id, contribution_id, contributor_id, organizer_id, status
       FROM campaign_deliveries WHERE global_id = $1 FOR UPDATE`,
      [deliveryId],
    );
    return { ...delivery, campaign_created_by: campaign.created_by };
  }

  public async findDeliveryByGlobalId(
    globalId: string,
  ): Promise<ICharityDelivery | null> {
    return this.readDelivery(this.manager, `delivery.global_id = $1`, globalId);
  }

  private async readDeliveryByContribution(
    manager: EntityManager,
    contributionId: string,
  ): Promise<ICharityDelivery | null> {
    return this.readDelivery(
      manager,
      `delivery.contribution_id = $1`,
      contributionId,
    );
  }

  private async mustReadDelivery(
    manager: EntityManager,
    deliveryId: string,
  ): Promise<ICharityDelivery> {
    const delivery = await this.readDelivery(
      manager,
      `delivery.global_id = $1`,
      deliveryId,
    );
    if (!delivery) throw new CharityDeliveryNotFoundException();
    return delivery;
  }

  private async mustReadContribution(
    manager: EntityManager,
    contributionId: string,
  ): Promise<ICharityContribution> {
    const contribution = await this.readContribution(manager, contributionId);
    if (!contribution) throw new CharityContributionNotFoundException();
    return contribution;
  }

  private async readDelivery(
    manager: EntityManager,
    where: string,
    value: string,
  ): Promise<ICharityDelivery | null> {
    const [row] = await manager.query<IDeliveryRow[]>(
      `SELECT delivery.global_id, delivery.campaign_id, delivery.contribution_id,
              delivery.contributor_id, delivery.organizer_id, delivery.status,
              delivery.created_at, delivery.completed_at, delivery.cancelled_at,
              delivery.cancel_reason
       FROM campaign_deliveries delivery
       WHERE ${where}`,
      [value],
    );
    if (!row) return null;

    const items = await manager.query<
      {
        need_item_id: string;
        item_name: string;
        unit: string;
        accepted_quantity: number | string;
        received_quantity: number | string | null;
      }[]
    >(
      `SELECT item.need_item_id, need.item_name, need.unit,
              item.accepted_quantity, item.received_quantity
       FROM campaign_delivery_items item
       INNER JOIN campaign_need_items need ON need.global_id = item.need_item_id
       WHERE item.delivery_id = $1
       ORDER BY need.sort_order, item.id`,
      [row.global_id],
    );

    return {
      globalId: row.global_id,
      campaignId: row.campaign_id,
      contributionId: row.contribution_id,
      contributorId: row.contributor_id,
      organizerId: row.organizer_id,
      status: row.status as CharityDeliveryStatus,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      items: items.map((item) => ({
        needItemId: item.need_item_id,
        itemName: item.item_name,
        unit: item.unit,
        acceptedQuantity: Number(item.accepted_quantity),
        // `null` giữ `null`: "chưa xác nhận" khác "xác nhận không nhận được gì".
        receivedQuantity:
          item.received_quantity === null
            ? null
            : Number(item.received_quantity),
      })),
    };
  }

  public async recordExternalContribution(params: {
    campaignId: string;
    recordedBy: string;
    needItemId: string;
    quantity: number;
    sourceLabel: string;
    receivedAt: Date;
    evidenceNote: string | null;
  }): Promise<ICharityExternalContribution> {
    return this.manager.transaction(async (manager) => {
      const { campaign, needs } = await this.lockCampaignAndNeeds(
        manager,
        params.campaignId,
      );
      if (
        !(await this.managesWithin(
          manager,
          campaign,
          params.campaignId,
          params.recordedBy,
        ))
      )
        throw new CharityNotOrganizerException();
      // Chỉ chiến dịch đã duyệt mới có tiến độ để ghi vào. KHÔNG đòi `is_active`:
      // vật phẩm về kho sau khi đã đóng chiến dịch vẫn là vật phẩm thật.
      if (campaign.approval_status !== 'APPROVED')
        throw new CharityNotAcceptingContributionsException();

      const need = needs.find((item) => item.global_id === params.needItemId);
      if (!need || !need.is_active) throw new CharityNeedItemInvalidException();

      const [row] = await manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_external_contributions
           (campaign_id, need_item_id, quantity, source_label, received_at,
            evidence_note, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING global_id`,
        [
          params.campaignId,
          params.needItemId,
          params.quantity,
          params.sourceLabel,
          params.receivedAt,
          params.evidenceNote,
          params.recordedBy,
        ],
      );
      await this.shiftNeedProjections(manager, [
        {
          needItemId: params.needItemId,
          acceptedDelta: 0,
          receivedDelta: params.quantity,
        },
      ]);

      return this.mustReadExternal(manager, row.global_id);
    });
  }

  public async amendExternalContribution(params: {
    externalId: string;
    actorUserId: string;
    action: 'VOID' | 'ADJUST';
    reason: string;
    quantity?: number;
  }): Promise<ICharityExternalContribution> {
    return this.manager.transaction(async (manager) => {
      const [peek] = await manager.query<{ campaign_id: string }[]>(
        `SELECT campaign_id FROM campaign_external_contributions
         WHERE global_id = $1`,
        [params.externalId],
      );
      if (!peek) throw new CharityExternalContributionNotFoundException();

      const { campaign } = await this.lockCampaignAndNeeds(
        manager,
        peek.campaign_id,
      );
      // Người ngoài nhận cùng lỗi với bản ghi không tồn tại.
      if (
        !(await this.managesWithin(
          manager,
          campaign,
          peek.campaign_id,
          params.actorUserId,
        ))
      )
        throw new CharityExternalContributionNotFoundException();

      const [current] = await manager.query<IExternalRow[]>(
        `SELECT ${ExternalColumns}
         FROM campaign_external_contributions external
         INNER JOIN campaign_need_items need ON need.global_id = external.need_item_id
         WHERE external.global_id = $1
         FOR UPDATE OF external`,
        [params.externalId],
      );
      // Đã huỷ thì không huỷ hay điều chỉnh lần nữa — sửa một bản ghi đã bị thay là
      // sửa một nhánh lịch sử không còn ai đọc.
      if (current.status !== 'ACTIVE')
        throw new CharityExternalContributionVoidedException();
      // Điều chỉnh mà số không đổi là một lượt ghi lịch sử không nói gì. Kiểm ở ĐÂY vì
      // chỉ ở đây — trên hàng đã khoá — con số cũ mới chắc là con số hiện hành.
      if (
        params.action === 'ADJUST' &&
        params.quantity === Number(current.quantity)
      )
        throw new CharityLinesInvalidException(
          'Số lượng mới trùng số lượng cũ — không có gì để điều chỉnh',
        );

      await manager.query(
        `UPDATE campaign_external_contributions
         SET status = 'VOIDED', voided_at = now(), voided_by = $2, void_reason = $3
         WHERE global_id = $1`,
        [params.externalId, params.actorUserId, params.reason],
      );

      const oldQuantity = Number(current.quantity);
      if (params.action === 'VOID') {
        await this.shiftNeedProjections(manager, [
          {
            needItemId: current.need_item_id,
            acceptedDelta: 0,
            receivedDelta: -oldQuantity,
          },
        ]);
        return this.mustReadExternal(manager, params.externalId);
      }

      const quantity = params.quantity as number;
      const [replacement] = await manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_external_contributions
           (campaign_id, need_item_id, quantity, source_label, received_at,
            evidence_note, recorded_by, replaces_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING global_id`,
        [
          current.campaign_id,
          current.need_item_id,
          quantity,
          current.source_label,
          current.received_at,
          current.evidence_note,
          params.actorUserId,
          params.externalId,
        ],
      );
      // Một lượt ghi cho chênh lệch, không hai lượt trừ-rồi-cộng: cùng một kết quả,
      // và không có khoảnh khắc nào `received_quantity` thấp hơn sự thật.
      await this.shiftNeedProjections(manager, [
        {
          needItemId: current.need_item_id,
          acceptedDelta: 0,
          receivedDelta: quantity - oldQuantity,
        },
      ]);
      return this.mustReadExternal(manager, replacement.global_id);
    });
  }

  public async listExternalContributions(
    campaignId: string,
  ): Promise<ICharityExternalContribution[]> {
    const rows = await this.manager.query<IExternalRow[]>(
      `SELECT ${ExternalColumns}
       FROM campaign_external_contributions external
       INNER JOIN campaign_need_items need ON need.global_id = external.need_item_id
       WHERE external.campaign_id = $1
       ORDER BY external.created_at DESC, external.id DESC`,
      [campaignId],
    );
    return rows.map(toExternal);
  }

  private async mustReadExternal(
    manager: EntityManager,
    globalId: string,
  ): Promise<ICharityExternalContribution> {
    const [row] = await manager.query<IExternalRow[]>(
      `SELECT ${ExternalColumns}
       FROM campaign_external_contributions external
       INNER JOIN campaign_need_items need ON need.global_id = external.need_item_id
       WHERE external.global_id = $1`,
      [globalId],
    );
    if (!row) throw new CharityExternalContributionNotFoundException();
    return toExternal(row);
  }

  public async closeCampaign(params: {
    campaignId: string;
    actorUserId: string;
  }): Promise<ICloseCampaignResult> {
    return this.manager.transaction(async (manager) => {
      await this.lockCampaignAndNeeds(manager, params.campaignId);

      // `start_time = LEAST(...)`: đóng một chiến dịch CHƯA bắt đầu mà chỉ đặt
      // `end_time = now()` sẽ vi phạm `CHK_campaigns_time_order`. Kéo `start_time` về
      // trước đó một giây là hợp lý — với chiến dịch chưa bắt đầu, `start_time` là kế
      // hoạch chứ chưa phải lịch sử. KHÔNG dời `end_time` ra sau `now()`: §8 phân biệt
      // ĐÃ ĐÓNG với ĐÌNH CHỈ đúng bằng việc `end_time` đã qua hay chưa.
      const closed = await updateReturning<{ global_id: string }>(
        manager,
        `UPDATE campaigns
         SET is_active = false,
             end_time = now(),
             start_time = LEAST(start_time, now() - interval '1 second'),
             updated_at = now()
         WHERE global_id = $1
           AND approval_status = 'APPROVED'
           AND end_time > now()
           AND deleted_at IS NULL
         RETURNING global_id`,
        [params.campaignId],
      );
      if (closed.length === 0) throw new CharityCampaignNotClosableException();

      // Từ chối hàng loạt đề nghị đang chờ (§8), từng dòng nhận 0 với lý do
      // `CAMPAIGN_CLOSED` — cùng hình dạng với một lượt từ chối bằng tay, nên danh sách
      // của người tặng đọc nó y như mọi lượt từ chối khác.
      const pending = await manager.query<
        { global_id: string; contributor_id: string }[]
      >(
        `SELECT global_id, contributor_id FROM campaign_contributions
         WHERE campaign_id = $1 AND status = 'PENDING_REVIEW'
         ORDER BY id
         FOR UPDATE`,
        [params.campaignId],
      );
      const pendingIds = pending.map((row) => row.global_id);
      if (pendingIds.length > 0) {
        await manager.query(
          `UPDATE campaign_contribution_items
           SET accepted_quantity = 0, rejection_reason = 'CAMPAIGN_CLOSED',
               updated_at = now()
           WHERE contribution_id = ANY($1::uuid[])`,
          [pendingIds],
        );
        await manager.query(
          `UPDATE campaign_contributions
           SET status = 'REJECTED', decided_at = now(), decided_by = $2,
               updated_at = now()
           WHERE global_id = ANY($1::uuid[])`,
          [pendingIds, params.actorUserId],
        );
      }

      // KHÔNG huỷ lượt giao nhận đang chạy (§8, §11.5): đó là vật phẩm đã được hứa
      // và có thể đang trên đường. Chỉ đếm để báo lại.
      const [open] = await manager.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM campaign_deliveries
         WHERE campaign_id = $1 AND status = 'ACCEPTED'`,
        [params.campaignId],
      );

      return {
        campaignId: params.campaignId,
        rejectedContributions: pendingIds.length,
        rejected: pending.map((row) => ({
          contributionId: row.global_id,
          contributorId: row.contributor_id,
        })),
        openDeliveries: Number(open.count),
      };
    });
  }

  public async isCampaignManager(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ found: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM campaigns
         WHERE global_id = $1 AND created_by = $2
       ) OR EXISTS (
         SELECT 1 FROM campaign_coordinators
         WHERE campaign_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ) AS found`,
      [campaignId, userId],
    );
    return row.found;
  }

  public async grantCoordinator(params: {
    campaignId: string;
    userId: string;
    grantedBy: string;
  }): Promise<void> {
    // ON CONFLICT theo chỉ mục MỘT PHẦN: giao lại cho người đang có quyền là không làm
    // gì, nhưng giao lại sau khi đã thu là một hàng mới — lịch sử giữ cả hai lần.
    await this.manager.query(
      `INSERT INTO campaign_coordinators (campaign_id, user_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, user_id) WHERE revoked_at IS NULL DO NOTHING`,
      [params.campaignId, params.userId, params.grantedBy],
    );
  }

  public async revokeCoordinator(params: {
    campaignId: string;
    userId: string;
    revokedBy: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ id: string }>(
      this.manager,
      `UPDATE campaign_coordinators
       SET revoked_at = now(), revoked_by = $3
       WHERE campaign_id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [params.campaignId, params.userId, params.revokedBy],
    );
    return rows.length > 0;
  }

  public async listCoordinators(
    campaignId: string,
  ): Promise<{ userId: string; grantedBy: string; grantedAt: Date }[]> {
    const rows = await this.manager.query<
      { user_id: string; granted_by: string; granted_at: Date }[]
    >(
      `SELECT user_id, granted_by, granted_at FROM campaign_coordinators
       WHERE campaign_id = $1 AND revoked_at IS NULL
       ORDER BY granted_at`,
      [campaignId],
    );
    return rows.map((row) => ({
      userId: row.user_id,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    }));
  }

  private async writeBeneficiary(
    manager: EntityManager,
    campaignId: string,
    actorUserId: string,
    beneficiary: ICharityBeneficiaryInput,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO campaign_beneficiaries
         (campaign_id, full_name, relation_note, phone, address,
          consent_status, verification_note, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (campaign_id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             relation_note = EXCLUDED.relation_note,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address,
             consent_status = EXCLUDED.consent_status,
             verification_note = EXCLUDED.verification_note,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [
        campaignId,
        beneficiary.fullName,
        beneficiary.relationNote,
        beneficiary.phone,
        beneficiary.address,
        beneficiary.consentStatus,
        beneficiary.verificationNote,
        actorUserId,
      ],
    );
  }

  public async findBeneficiary(
    campaignId: string,
  ): Promise<ICharityBeneficiary | null> {
    return this.readBeneficiary(this.manager, campaignId);
  }

  private async readBeneficiary(
    manager: EntityManager,
    campaignId: string,
  ): Promise<ICharityBeneficiary | null> {
    const [row] = await manager.query<
      {
        full_name: string;
        relation_note: string;
        phone: string | null;
        address: string | null;
        consent_status: 'PENDING' | 'CONFIRMED';
        verification_note: string | null;
        updated_at: Date;
      }[]
    >(
      `SELECT full_name, relation_note, phone, address, consent_status,
              verification_note, updated_at
       FROM campaign_beneficiaries WHERE campaign_id = $1`,
      [campaignId],
    );
    if (!row) return null;
    return {
      fullName: row.full_name,
      relationNote: row.relation_note,
      phone: row.phone,
      address: row.address,
      consentStatus: row.consent_status,
      verificationNote: row.verification_note,
      updatedAt: row.updated_at,
    };
  }

  public async upsertBeneficiary(params: {
    campaignId: string;
    actorUserId: string;
    beneficiary: ICharityBeneficiaryInput;
  }): Promise<{ beneficiary: ICharityBeneficiary; hidden: boolean }> {
    return this.manager.transaction(async (manager) => {
      const { campaign } = await this.lockCampaignAndNeeds(
        manager,
        params.campaignId,
      );
      await this.writeBeneficiary(
        manager,
        params.campaignId,
        params.actorUserId,
        params.beneficiary,
      );

      // Rút lại đồng ý lúc đang public thì ẨN NGAY, cùng transaction. Không làm thì
      // hình ảnh và hoàn cảnh của một người KHÔNG còn đồng ý vẫn nằm trên đường công
      // khai cho tới khi có ai đó nhớ ra mà gỡ.
      let hidden = false;
      if (
        params.beneficiary.consentStatus !== 'CONFIRMED' &&
        campaign.approval_status === 'APPROVED' &&
        campaign.is_active
      ) {
        await manager.query(
          `UPDATE campaigns SET is_active = false, updated_at = now()
           WHERE global_id = $1`,
          [params.campaignId],
        );
        hidden = true;
      }

      const beneficiary = await this.readBeneficiary(
        manager,
        params.campaignId,
      );
      return { beneficiary: beneficiary as ICharityBeneficiary, hidden };
    });
  }

  public async extendCampaign(params: {
    campaignId: string;
    actorUserId: string;
    newEndTime: Date;
    reason: string;
  }): Promise<{ campaignId: string; previousEndTime: Date; newEndTime: Date }> {
    return this.manager.transaction(async (manager) => {
      const { campaign } = await this.lockCampaignAndNeeds(
        manager,
        params.campaignId,
      );
      // Chỉ chiến dịch ĐANG MỞ: đã đóng thì gia hạn là mở lại — một quyết định
      // khác, đề nghị cũ đã bị từ chối hàng loạt; đang đình chỉ thì người quyết là
      // Admin, không phải người tổ chức.
      const open =
        campaign.approval_status === 'APPROVED' &&
        campaign.is_active &&
        campaign.end_time.getTime() > Date.now();
      if (!open || params.newEndTime.getTime() <= campaign.end_time.getTime())
        throw new CharityCampaignNotExtendableException();

      await manager.query(
        `UPDATE campaigns SET end_time = $2, updated_at = now() WHERE global_id = $1`,
        [params.campaignId, params.newEndTime],
      );
      await manager.query(
        `INSERT INTO campaign_schedule_changes
           (campaign_id, previous_end_time, new_end_time, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          params.campaignId,
          campaign.end_time,
          params.newEndTime,
          params.actorUserId,
          params.reason,
        ],
      );
      return {
        campaignId: params.campaignId,
        previousEndTime: campaign.end_time,
        newEndTime: params.newEndTime,
      };
    });
  }

  public async withdrawContribution(params: {
    contributionId: string;
    contributorId: string;
  }): Promise<ICharityContribution | null> {
    return this.manager.transaction(async (manager) => {
      const updated = await updateReturning<{ global_id: string }>(
        manager,
        // Rút là đổi TRẠNG THÁI, không xoá hàng: organizer đã đọc đề nghị đó và
        // cần biết nó từng tồn tại.
        `UPDATE campaign_contributions
         SET status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now()
         WHERE global_id = $1 AND contributor_id = $2
           AND status = 'PENDING_REVIEW'
         RETURNING global_id`,
        [params.contributionId, params.contributorId],
      );
      if (updated.length === 0) return null;

      return this.readContribution(manager, params.contributionId);
    });
  }

  public async slugTaken(slug: string): Promise<boolean> {
    const [row] = await this.manager.query<{ taken: boolean }[]>(
      `SELECT true AS taken FROM campaigns WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return row?.taken === true;
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<ICharityCampaign | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        WHERE campaigns.global_id = $1 AND campaigns.deleted_at IS NULL`,
      [globalId],
    );
    return row ? toCampaign(row) : null;
  }

  /**
   * So `global_id::text = $1` thay vì thử nhận dạng UUID ở tầng JS.
   *
   * Một câu, không nhánh: slug có dạng `^[a-z0-9]+(-[a-z0-9]+)*$` nên không chuỗi nào vừa
   * là UUID hợp lệ vừa là slug hợp lệ, và `::text` tránh hẳn lỗi `invalid input syntax for
   * type uuid` khi ai đó gọi `/campaigns/vu-lan-2026`.
   */
  public async findPublicByIdOrSlug(
    idOrSlug: string,
  ): Promise<ICharityCampaign | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        WHERE (campaigns.global_id::text = $1 OR campaigns.slug = $1)
          AND ${PublicFilter}`,
      [idOrSlug],
    );
    return row ? toCampaign(row) : null;
  }

  public async listPublic(query: {
    limit: number;
    offset: number;
    phase?: CharityCampaignPhase;
  }): Promise<ICharityCampaignPage> {
    const filter = phaseFilter(query.phase);

    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        WHERE ${PublicFilter} ${filter}
        ORDER BY campaigns.start_time DESC, campaigns.id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaigns
        WHERE ${PublicFilter} ${filter}`,
    );

    return {
      items: (rows ?? []).map(toCampaign),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listForAdmin(query: {
    limit: number;
    offset: number;
    approvalStatus?: CharityApprovalStatus;
  }): Promise<ICharityCampaignPage> {
    const values: unknown[] = [query.limit, query.offset];
    let filter = '';

    if (query.approvalStatus) {
      values.push(query.approvalStatus);
      filter = `AND campaigns.approval_status = $${values.length}`;
    }

    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        WHERE campaigns.deleted_at IS NULL ${filter}
        ORDER BY campaigns.created_at DESC, campaigns.id DESC
        LIMIT $1 OFFSET $2`,
      values,
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaigns
        WHERE campaigns.deleted_at IS NULL
          ${query.approvalStatus ? 'AND campaigns.approval_status = $1' : ''}`,
      query.approvalStatus ? [query.approvalStatus] : [],
    );

    return {
      items: (rows ?? []).map(toCampaign),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listJoinedByUser(query: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<ICharityCampaignPage> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        INNER JOIN campaign_participations AS joined
           ON joined.campaign_id = campaigns.global_id
          AND joined.user_id = $3
          AND joined.status = 'REGISTERED'
        WHERE campaigns.deleted_at IS NULL
        ORDER BY campaigns.start_time DESC, campaigns.id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.userId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaign_participations
        WHERE user_id = $1 AND status = 'REGISTERED'`,
      [query.userId],
    );

    return {
      items: (rows ?? []).map(toCampaign),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listByCreator(query: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<ICharityCampaignPage> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaigns
        WHERE campaigns.created_by = $3 AND campaigns.deleted_at IS NULL
        ORDER BY campaigns.created_at DESC, campaigns.id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.userId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaigns
        WHERE created_by = $1 AND deleted_at IS NULL`,
      [query.userId],
    );

    return {
      items: (rows ?? []).map(toCampaign),
      total: Number(counted?.total ?? 0),
    };
  }

  public async decideApproval(params: {
    campaignId: string;
    approverId: string;
    approve: boolean;
    note: string | null;
  }): Promise<ICharityCampaign | null> {
    // `AND approval_status = 'PENDING_APPROVAL'` nằm trong WHERE của chính câu UPDATE, chứ
    // không phải một lượt đọc trước đó: hai Admin bấm cùng lúc thì người sau phải thấy
    // xung đột, không phải ghi đè quyết định người trước.
    const rows = await updateReturning<IRow>(
      this.manager,
      `WITH updated AS (
         UPDATE campaigns
            SET approval_status = CASE WHEN $3 THEN 'APPROVED' ELSE 'REJECTED' END,
                approval_note = $4,
                approved_by = $2,
                approved_at = now(),
                updated_at = now()
          WHERE global_id = $1
            AND approval_status = 'PENDING_APPROVAL'
            AND deleted_at IS NULL
          RETURNING *
       )
       SELECT ${Columns} FROM updated AS campaigns`,
      [params.campaignId, params.approverId, params.approve, params.note],
    );
    return rows.length > 0 ? toCampaign(rows[0]) : null;
  }

  public async updateProgress(params: {
    campaignId: string;
    currentItemsCount: number;
  }): Promise<ICharityCampaign | null> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `WITH updated AS (
         UPDATE campaigns
            SET current_items_count = $2, updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING *
       )
       SELECT ${Columns} FROM updated AS campaigns`,
      [params.campaignId, params.currentItemsCount],
    );
    return rows.length > 0 ? toCampaign(rows[0]) : null;
  }

  public async setActive(params: {
    campaignId: string;
    isActive: boolean;
  }): Promise<ICharityCampaign | null> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `WITH updated AS (
         UPDATE campaigns
            SET is_active = $2, updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING *
       )
       SELECT ${Columns} FROM updated AS campaigns`,
      [params.campaignId, params.isActive],
    );
    return rows.length > 0 ? toCampaign(rows[0]) : null;
  }

  /**
   * Đăng ký, hoặc hồi lại một hàng đã huỷ.
   *
   * `WHERE campaign_participations.status = 'CANCELLED'` ở nhánh `DO UPDATE` là chỗ then
   * chốt: thiếu nó thì một lượt bấm hai lần trả `created: true` cả hai lần (vì `xmax` vẫn
   * khác 0 sau một lượt UPDATE không đổi gì), và người dùng không bao giờ thấy "bạn đã
   * đăng ký rồi". Có nó thì lượt thứ hai không khớp hàng nào và `RETURNING` trả rỗng.
   */
  public async register(params: {
    campaignId: string;
    userId: string;
  }): Promise<{ created: boolean }> {
    const rows = await this.manager.query<{ global_id: string }[]>(
      `INSERT INTO campaign_participations (campaign_id, user_id, status, registered_at)
       VALUES ($1, $2, 'REGISTERED', now())
       ON CONFLICT (campaign_id, user_id) DO UPDATE
         SET status = 'REGISTERED', registered_at = now(), cancelled_at = NULL
         WHERE campaign_participations.status = 'CANCELLED'
       RETURNING global_id`,
      [params.campaignId, params.userId],
    );
    return { created: (rows ?? []).length > 0 };
  }

  public async cancelParticipation(params: {
    campaignId: string;
    userId: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_participations
          SET status = 'CANCELLED', cancelled_at = now()
        WHERE campaign_id = $1 AND user_id = $2 AND status = 'REGISTERED'
        RETURNING global_id`,
      [params.campaignId, params.userId],
    );
    return rows.length > 0;
  }

  public async findParticipationStatus(params: {
    campaignId: string;
    userId: string;
  }): Promise<CharityParticipationStatus | null> {
    const [row] = await this.manager.query<{ status: string }[]>(
      `SELECT status FROM campaign_participations
        WHERE campaign_id = $1 AND user_id = $2`,
      [params.campaignId, params.userId],
    );
    return row ? (row.status as CharityParticipationStatus) : null;
  }

  public async listRegisteredUserIds(campaignId: string): Promise<string[]> {
    const rows = await this.manager.query<{ user_id: string }[]>(
      `SELECT user_id FROM campaign_participations
        WHERE campaign_id = $1 AND status = 'REGISTERED'
        ORDER BY registered_at ASC`,
      [campaignId],
    );
    return (rows ?? []).map((row) => row.user_id);
  }

  public async createReview(params: {
    campaignId: string;
    reviewerId: string;
    revieweeId: string;
    reviewerRole: CharityReviewRole;
    rating: number;
    comment: string | null;
  }): Promise<ICharityReview> {
    const [row] = await this.manager.query<IReviewRow[]>(
      `INSERT INTO campaign_reviews
         (campaign_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING global_id, campaign_id, reviewer_id, reviewee_id, reviewer_role,
                 rating, comment, created_at`,
      [
        params.campaignId,
        params.reviewerId,
        params.revieweeId,
        params.reviewerRole,
        params.rating,
        params.comment,
      ],
    );
    return toReview(row);
  }

  public async reviewExists(params: {
    campaignId: string;
    reviewerId: string;
    revieweeId: string;
  }): Promise<boolean> {
    const [row] = await this.manager.query<{ found: boolean }[]>(
      `SELECT true AS found FROM campaign_reviews
        WHERE campaign_id = $1 AND reviewer_id = $2 AND reviewee_id = $3
        LIMIT 1`,
      [params.campaignId, params.reviewerId, params.revieweeId],
    );
    return row?.found === true;
  }

  public async listReviews(query: {
    campaignId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ICharityReview[]; total: number }> {
    const rows = await this.manager.query<IReviewRow[]>(
      `SELECT global_id, campaign_id, reviewer_id, reviewee_id, reviewer_role,
              rating, comment, created_at
         FROM campaign_reviews
        WHERE campaign_id = $3
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.campaignId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaign_reviews WHERE campaign_id = $1`,
      [query.campaignId],
    );

    return {
      items: (rows ?? []).map(toReview),
      total: Number(counted?.total ?? 0),
    };
  }
}
