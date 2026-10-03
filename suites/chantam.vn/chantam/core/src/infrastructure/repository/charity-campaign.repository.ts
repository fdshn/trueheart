import {
  CharityCampaignPhase,
  ICharityCampaign,
  ICharityCampaignPage,
  ICharityCampaignRepository,
  ICharityReview,
  ICreateCharityCampaignParams,
} from '@/domain/ports/repository';
import {
  CharityApprovalStatus,
  CharityParticipationStatus,
  CharityReviewRole,
  charityProgressPercent,
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
const Columns = `campaigns.global_id, campaigns.title, campaigns.slug, campaigns.description,
       campaigns.banner_url, campaigns.badge_name,
       campaigns.target_items_count, campaigns.current_items_count,
       ST_Y(campaigns.location::geometry) AS lat,
       ST_X(campaigns.location::geometry) AS lng,
       campaigns.location_label, campaigns.start_time, campaigns.end_time,
       campaigns.is_active, campaigns.approval_status, campaigns.approval_note,
       campaigns.approved_at, campaigns.approved_by, campaigns.created_by,
       campaigns.created_at, campaigns.updated_at,
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
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]` — chỉ
    // `UPDATE`/`DELETE` bị. Nên chỗ này đọc thẳng `rows[0]`, không qua `updateReturning`.
    const [row] = await this.manager.query<IRow[]>(
      `WITH inserted AS (
         INSERT INTO campaigns
           (title, slug, description, banner_url, badge_name, target_items_count,
            location, location_label, start_time, end_time,
            created_by, approval_status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${LocationExpression}, $8, $7, $11,
                 $12, $13, $14,
                 CASE WHEN $15 = 'PENDING_APPROVAL' THEN NULL ELSE now() END)
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
      ],
    );
    return toCampaign(row);
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
