import {
  IHomeCampaignPage,
  IHomeCampaignRecord,
  IHomeCampaignRepository,
  IHomeCampaignWriteParams,
  IUpdateHomeCampaignParams,
} from '@/domain/ports/repository';
import {
  IHomeLayout,
  normalizeHomeBanners,
  normalizeHomeFloatingBanner,
  normalizeHomePopup,
  normalizeHomeSections,
  normalizeHomeTheme,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  campaign_name: string;
  theme_config: unknown;
  marquee_text: string | null;
  popup_config: unknown;
  floating_banner: unknown;
  banners: unknown;
  sections_order: unknown;
  start_time: Date;
  end_time: Date;
  is_active: boolean;
  is_live: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * `is_live` suy ra ở SQL, không lưu thành cột.
 *
 * Một cột trạng thái phải giữ đồng bộ với `is_active` cộng hai mốc thời gian là cột sẽ nói
 * sai — ở `config_revisions` nó giữ `PUBLISHED` trong khi `effective_to` đã đóng, và phải
 * có một migration đi dọn. Ở đây nó được tính mỗi lượt đọc nên không có gì để lệch.
 */
const Columns = `global_id, campaign_name, theme_config, marquee_text, popup_config,
       floating_banner, banners, sections_order, start_time, end_time, is_active,
       (is_active AND now() >= start_time AND now() < end_time) AS is_live,
       created_by, updated_by, created_at, updated_at`;

function toRecord(row: IRow): IHomeCampaignRecord {
  return {
    globalId: row.global_id,
    campaignName: row.campaign_name,
    // Chuẩn hoá khi ĐỌC nữa, không chỉ khi ghi: dòng có thể do một bản mã cũ ghi, hoặc
    // do SQL tay. Trả thẳng JSON thô ra API là để client nhận một hình dạng mà không
    // hàm nào của ta bảo đảm.
    theme: normalizeHomeTheme(row.theme_config),
    marqueeText: row.marquee_text,
    banners: normalizeHomeBanners(row.banners),
    sectionsLayout: normalizeHomeSections(row.sections_order),
    popup: normalizeHomePopup(row.popup_config),
    floatingBanner: normalizeHomeFloatingBanner(row.floating_banner),
    startTime: row.start_time,
    endTime: row.end_time,
    isActive: row.is_active,
    isLive: row.is_live,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLayout(record: IHomeCampaignRecord): IHomeLayout {
  return {
    campaignId: record.globalId,
    campaignName: record.campaignName,
    theme: record.theme,
    marqueeText: record.marqueeText,
    banners: record.banners,
    sectionsLayout: record.sectionsLayout,
    popup: record.popup,
    floatingBanner: record.floatingBanner,
  };
}

@Injectable()
export class HomeCampaignRepository implements IHomeCampaignRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async listCampaigns(query: {
    limit: number;
    offset: number;
  }): Promise<IHomeCampaignPage> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM home_campaign_configs
       ORDER BY start_time DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM home_campaign_configs`,
    );

    return {
      items: (rows ?? []).map(toRecord),
      total: Number(counted?.total ?? 0),
    };
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<IHomeCampaignRecord | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM home_campaign_configs WHERE global_id = $1`,
      [globalId],
    );
    return row ? toRecord(row) : null;
  }

  public async createCampaign(
    params: IHomeCampaignWriteParams,
  ): Promise<IHomeCampaignRecord> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]` — chỉ
    // `UPDATE`/`DELETE` bị. Nên ở đây đọc thẳng `rows[0]`, còn `updateCampaign` dưới
    // kia phải đi qua `updateReturning`.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO home_campaign_configs
         (campaign_name, theme_config, marquee_text, popup_config, floating_banner,
          banners, sections_order, start_time, end_time, is_active, created_by, updated_by)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
               $8, $9, $10, $11, $11)
       RETURNING ${Columns}`,
      [
        params.campaignName,
        JSON.stringify(params.theme),
        params.marqueeText,
        params.popup === null ? null : JSON.stringify(params.popup),
        params.floatingBanner === null
          ? null
          : JSON.stringify(params.floatingBanner),
        JSON.stringify(params.banners),
        JSON.stringify(params.sectionsLayout),
        params.startTime,
        params.endTime,
        params.isActive,
        params.actorUserId,
      ],
    );
    return toRecord(row);
  }

  public async updateCampaign(
    params: IUpdateHomeCampaignParams,
  ): Promise<IHomeCampaignRecord> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE home_campaign_configs
          SET campaign_name = $2,
              theme_config = $3::jsonb,
              marquee_text = $4,
              popup_config = $5::jsonb,
              floating_banner = $6::jsonb,
              banners = $7::jsonb,
              sections_order = $8::jsonb,
              start_time = $9,
              end_time = $10,
              is_active = $11,
              updated_by = $12,
              updated_at = now()
        WHERE global_id = $1
        RETURNING ${Columns}`,
      [
        params.globalId,
        params.campaignName,
        JSON.stringify(params.theme),
        params.marqueeText,
        params.popup === null ? null : JSON.stringify(params.popup),
        params.floatingBanner === null
          ? null
          : JSON.stringify(params.floatingBanner),
        JSON.stringify(params.banners),
        JSON.stringify(params.sectionsLayout),
        params.startTime,
        params.endTime,
        params.isActive,
        params.actorUserId,
      ],
    );
    return toRecord(rows[0]);
  }

  /**
   * Bản đang phục vụ.
   *
   * `ORDER BY start_time DESC` chỉ để chọn một khi có nhiều — mà ràng buộc
   * `EXCL_home_campaign_configs_active_overlap` đã bảo đảm không thể có hai bản đang bật
   * giao nhau về thời gian, nên thực tế mệnh đề này không bao giờ phải phân xử gì. Giữ nó
   * để truy vấn vẫn tất định nếu ai đó tắt ràng buộc đi.
   */
  public async findActiveLayout(): Promise<IHomeLayout | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM home_campaign_configs
        WHERE is_active AND now() >= start_time AND now() < end_time
        ORDER BY start_time DESC
        LIMIT 1`,
    );
    return row ? toLayout(toRecord(row)) : null;
  }
}
