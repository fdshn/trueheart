import {
  ICreateSponsorBannerParams,
  ISponsorBanner,
  ISponsorBannerPage,
  ISponsorBannerRepository,
  IWriteSponsorBannerParams,
} from '@/domain/ports/repository';
import {
  BannerApprovalStatus,
  BannerPlacement,
  bannerClickThroughRate,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  partner_name: string;
  partner_contact: string | null;
  title: string;
  image_url: string;
  target_url: string;
  placement: string;
  display_order: string | number;
  starts_at: Date;
  ends_at: Date;
  is_active: boolean;
  approval_status: string;
  approval_note: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  impression_count: string | number;
  click_count: string | number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const Columns = `global_id, partner_name, partner_contact, title, image_url, target_url,
       placement, display_order, starts_at, ends_at, is_active,
       approval_status, approval_note, approved_at, approved_by,
       impression_count, click_count, created_by, created_at, updated_at`;

/** Banner đang được phục vụ: đã duyệt, còn bật, chưa xoá, VÀ đang trong khung giờ. */
const ServingFilter = `approval_status = 'APPROVED'
      AND is_active
      AND deleted_at IS NULL
      AND starts_at <= now()
      AND ends_at > now()`;

function toBanner(row: IRow): ISponsorBanner {
  // `bigint` của Postgres về đây là CHUỖI. Trả thẳng ra API thì client nhận `"120"`, và
  // `clickCount / impressionCount` ở tầng nào đó thành phép chia chuỗi.
  const impressionCount = Number(row.impression_count);
  const clickCount = Number(row.click_count);

  return {
    globalId: row.global_id,
    partnerName: row.partner_name,
    partnerContact: row.partner_contact,
    title: row.title,
    imageUrl: row.image_url,
    targetUrl: row.target_url,
    placement: row.placement as BannerPlacement,
    displayOrder: Number(row.display_order),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    approvalStatus: row.approval_status as BannerApprovalStatus,
    approvalNote: row.approval_note,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    impressionCount,
    clickCount,
    clickThroughRate: bannerClickThroughRate({ impressionCount, clickCount }),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Khoá DTO -> cột, dùng cho câu `UPDATE` dựng động. */
const UpdatableColumns: Readonly<
  Record<keyof IWriteSponsorBannerParams, string>
> = {
  partnerName: 'partner_name',
  partnerContact: 'partner_contact',
  title: 'title',
  imageUrl: 'image_url',
  targetUrl: 'target_url',
  placement: 'placement',
  displayOrder: 'display_order',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
};

@Injectable()
export class SponsorBannerRepository implements ISponsorBannerRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async create(
    params: ICreateSponsorBannerParams,
  ): Promise<ISponsorBanner> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]`.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO sponsor_banners
         (partner_name, partner_contact, title, image_url, target_url, placement,
          display_order, starts_at, ends_at, created_by, approval_status, approved_by,
          approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CASE WHEN $13 = 'PENDING_APPROVAL' THEN NULL ELSE now() END)
       RETURNING ${Columns}`,
      [
        params.partnerName,
        params.partnerContact,
        params.title,
        params.imageUrl,
        params.targetUrl,
        params.placement,
        params.displayOrder,
        params.startsAt,
        params.endsAt,
        params.createdBy,
        params.approvalStatus,
        params.approvedBy,
        // Truyền `approvalStatus` LẦN HAI làm `$13`. Dùng một tham số vừa ở vị trí VALUES
        // (cột `varchar(30)`) vừa trong phép so `= 'PENDING_APPROVAL'` (hằng `text`) làm
        // Postgres ném "inconsistent types deduced for parameter" — lỗi đã gặp ở F47.
        params.approvalStatus,
      ],
    );
    return toBanner(row);
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<ISponsorBanner | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [globalId],
    );
    return row ? toBanner(row) : null;
  }

  public async findServing(params: {
    placement: BannerPlacement;
    limit: number;
  }): Promise<ISponsorBanner[]> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE placement = $1 AND ${ServingFilter}
        ORDER BY display_order ASC, id ASC
        LIMIT $2`,
      [params.placement, params.limit],
    );
    return (rows ?? []).map(toBanner);
  }

  public async listForAdmin(query: {
    limit: number;
    offset: number;
    placement?: BannerPlacement;
    approvalStatus?: BannerApprovalStatus;
  }): Promise<ISponsorBannerPage> {
    const filters: string[] = [];
    const filterValues: unknown[] = [];

    if (query.placement) {
      filterValues.push(query.placement);
      filters.push(`placement = $${filterValues.length}`);
    }
    if (query.approvalStatus) {
      filterValues.push(query.approvalStatus);
      filters.push(`approval_status = $${filterValues.length}`);
    }
    const where = ['deleted_at IS NULL', ...filters].join(' AND ');

    // Câu đếm dùng ĐÚNG bộ lọc của câu đọc, và dùng chung mảng tham số — hai bản lọc lệch
    // nhau là Admin thấy "12 banner" rồi nhận về 8 hàng.
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM sponsor_banners WHERE ${where}`,
      filterValues,
    );
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
      [...filterValues, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toBanner),
      total: Number(counted?.total ?? 0),
    };
  }

  /**
   * Sửa những trường người gọi có gửi, bỏ qua phần còn lại.
   *
   * Dựng danh sách `SET` từ `UpdatableColumns` thay vì viết tay chín nhánh `if`: thêm một
   * trường về sau chỉ phải khai một chỗ, và tên cột không thể bị gõ sai ở nhánh thứ chín.
   */
  public async update(params: {
    bannerId: string;
    changes: Partial<IWriteSponsorBannerParams>;
  }): Promise<ISponsorBanner | null> {
    const assignments: string[] = [];
    const values: unknown[] = [params.bannerId];

    for (const [key, column] of Object.entries(UpdatableColumns)) {
      const value = params.changes[key as keyof IWriteSponsorBannerParams];
      if (value === undefined) continue;
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }

    // Không có gì để sửa thì không chạy câu nào — một `UPDATE` rỗng vẫn đụng `updated_at`,
    // và Admin mất cách biết banner nào thật sự được sửa.
    if (assignments.length === 0) return this.findByGlobalId(params.bannerId);

    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET ${assignments.join(', ')}, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${Columns}`,
      values,
    );
    return rows.length > 0 ? toBanner(rows[0]) : null;
  }

  public async decideApproval(params: {
    bannerId: string;
    approverId: string;
    approve: boolean;
    note: string | null;
  }): Promise<ISponsorBanner | null> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET approval_status = CASE WHEN $3 THEN 'APPROVED' ELSE 'REJECTED' END,
              approval_note = $4,
              approved_by = $2,
              approved_at = now(),
              updated_at = now()
        WHERE global_id = $1
          AND approval_status = 'PENDING_APPROVAL'
          AND deleted_at IS NULL
        RETURNING ${Columns}`,
      [params.bannerId, params.approverId, params.approve, params.note],
    );
    return rows.length > 0 ? toBanner(rows[0]) : null;
  }

  public async setActive(params: {
    bannerId: string;
    isActive: boolean;
  }): Promise<ISponsorBanner | null> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET is_active = $2, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${Columns}`,
      [params.bannerId, params.isActive],
    );
    return rows.length > 0 ? toBanner(rows[0]) : null;
  }

  public async softDelete(bannerId: string): Promise<boolean> {
    // Xoá MỀM: `impression_count` của một banner đã chạy là con số đối soát với đối tác, và
    // xoá cứng là huỷ bằng chứng của một hợp đồng đã thực hiện.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE sponsor_banners
          SET deleted_at = now(), is_active = false, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [bannerId],
    );
    return rows.length > 0;
  }

  public async recordImpressions(bannerIds: readonly string[]): Promise<void> {
    if (bannerIds.length === 0) return;
    await updateReturning(
      this.manager,
      `UPDATE sponsor_banners
          SET impression_count = impression_count + 1
        WHERE global_id = ANY($1::uuid[])
        RETURNING global_id`,
      [bannerIds],
    );
  }

  public async recordClick(bannerId: string): Promise<boolean> {
    // Chỉ đếm lượt bấm của banner ĐANG được phục vụ. Thiếu `ServingFilter` ở đây thì một
    // link cũ nằm trong ảnh chụp màn hình vẫn cộng số cho một hợp đồng đã hết.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE sponsor_banners
          SET click_count = click_count + 1
        WHERE global_id = $1 AND ${ServingFilter}
        RETURNING global_id`,
      [bannerId],
    );
    return rows.length > 0;
  }
}
