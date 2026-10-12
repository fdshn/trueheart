import {
  CharityCampaignPhase,
  ICharityCampaign,
  ICharityCampaignPage,
  ICharityCampaignRepository,
  ICharityContribution,
  ICharityContributionPage,
  ICharityNeedItem,
  ICharityReview,
  ICreateCharityCampaignParams,
  ICreateCharityContributionItemParams,
  ICreateCharityContributionParams,
  ICreateCharityNeedItemParams,
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
  remainingNeedQuantity,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
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

const ContributionColumns = `contribution.global_id, contribution.campaign_id,
       contribution.contributor_id, contribution.status, contribution.note,
       contribution.contact_note, contribution.decided_at,
       contribution.created_at`;

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
            campaign_type, beneficiary_relation)
         VALUES ($1, $2, $3, $4, $5, $6, ${LocationExpression}, $8, $7, $11,
                 $12, $13, $14,
                 CASE WHEN $15 = 'PENDING_APPROVAL' THEN NULL ELSE now() END,
                 $16, $17)
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
       FROM campaign_contributions contribution
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
       FROM campaign_contributions contribution
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
