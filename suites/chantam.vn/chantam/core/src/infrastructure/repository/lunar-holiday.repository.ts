import {
  IBulkNotifyAudienceRepository,
  ILunarHoliday,
  ILunarHolidayRepository,
  IReplaceLunarHolidaysParams,
} from '@/domain/ports/repository';
import {
  AllUsersAudience,
  IBroadcastAudience,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IRow {
  lunar_month: number;
  lunar_day: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

const Columns = `lunar_month, lunar_day, name, description, is_active, sort_order`;

function toHoliday(row: IRow): ILunarHoliday {
  return {
    lunarMonth: Number(row.lunar_month),
    lunarDay: Number(row.lunar_day),
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
  };
}

@Injectable()
export class LunarHolidayRepository implements ILunarHolidayRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async listAll(): Promise<ILunarHoliday[]> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM lunar_holidays
        ORDER BY sort_order ASC, lunar_month ASC, lunar_day ASC`,
    );
    return (rows ?? []).map(toHoliday);
  }

  public async findByLunarDate(
    lunarMonth: number,
    lunarDay: number,
  ): Promise<ILunarHoliday | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM lunar_holidays
        WHERE lunar_month = $1 AND lunar_day = $2 AND is_active`,
      [lunarMonth, lunarDay],
    );
    return row ? toHoliday(row) : null;
  }

  public async replaceAll(
    params: IReplaceLunarHolidaysParams,
  ): Promise<ILunarHoliday[]> {
    return this.manager.transaction(async (manager) => {
      // Khoá bảng trong transaction: hai lượt thay cả bộ chạy song song sẽ cho một danh
      // mục trộn hai bản. Bảng này nhỏ và sửa rất thưa, nên khoá cả bảng là cái giá nhỏ
      // nhất so với mọi cách khác.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('lunar_holidays'))",
      );
      await manager.query(`DELETE FROM lunar_holidays`);

      for (const [index, holiday] of params.holidays.entries()) {
        await manager.query(
          `INSERT INTO lunar_holidays
             (lunar_month, lunar_day, name, description, is_active, sort_order, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            holiday.lunarMonth,
            holiday.lunarDay,
            holiday.name,
            holiday.description,
            holiday.isActive,
            // Thứ tự do VỊ TRÍ trong mảng quyết định, không nhận `sortOrder` từ client:
            // nhận vào thì hai dòng cùng số là chuyện sẽ xảy ra, và lúc đó thứ tự hiện ra
            // tuỳ cách Postgres trả hàng.
            index + 1,
            params.actorUserId,
          ],
        );
      }

      const rows = await manager.query<IRow[]>(
        `SELECT ${Columns} FROM lunar_holidays
          ORDER BY sort_order ASC, lunar_month ASC, lunar_day ASC`,
      );
      return (rows ?? []).map(toHoliday);
    });
  }
}

/**
 * Danh sách người nhận cho thông báo hàng loạt (mục mở L28).
 *
 * Tách thành class riêng, không gắn vào `LunarHolidayRepository`: việc "lặp người dùng
 * đang hoạt động" không thuộc về danh mục ngày lễ, và F47 (thông báo theo khu vực) sẽ dùng
 * lại đúng cổng này với một mệnh đề `ST_DWithin` thêm vào.
 */
@Injectable()
export class BulkNotifyAudienceRepository implements IBulkNotifyAudienceRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async findActiveUserIdsAfter(params: {
    afterId: number;
    limit: number;
    audience?: IBroadcastAudience;
  }): Promise<{ id: number; globalId: string }[]> {
    const audience = params.audience ?? AllUsersAudience;
    const values: unknown[] = [params.afterId, params.limit];
    let filter = '';

    if (audience.type === 'GROUP') {
      values.push(audience.groupId);
      // `status = 'ACTIVE'` là BẮT BUỘC, và `test:broadcast` nhóm 7 bắt được 03/10 rằng
      // bản đầu của tôi thiếu nó.
      //
      // `group_memberships` giữ cả dòng của nhóm ĐÃ GIẢI TÁN (`DISSOLVED` — Owner xoá tài
      // khoản thì nhóm giải tán, theo CHỐT-05). `UQ_group_memberships_one_active_per_user`
      // chỉ ràng buộc dòng ACTIVE, nên dòng DISSOLVED nằm lại vĩnh viễn. Thiếu mệnh đề
      // này là gửi thông báo của một nhóm cho người mà nhóm đó **không còn tồn tại**.
      //
      // `EXISTS` chứ không `JOIN`: enum chỉ có ACTIVE và DISSOLVED nên trùng hàng cho cùng
      // một nhóm là khó xảy ra, nhưng `EXISTS` đúng về ý — câu hỏi là "người này CÓ thuộc
      // nhóm không", không phải "có bao nhiêu hàng". Lý lẽ ở bản đầu của tôi, "một người
      // thuộc nhiều sub-team", SAI: ràng buộc unique chặn ca đó.
      filter = `AND EXISTS (
        SELECT 1 FROM group_memberships member
         WHERE member.user_id = users.global_id
           AND member.group_id = $${values.length}
           AND member.status = 'ACTIVE'
      )`;
    } else if (audience.type === 'AREA') {
      values.push(
        audience.centerLng,
        audience.centerLat,
        audience.radiusMeters,
      );
      // `ST_DWithin` trên `geography` nhận bán kính bằng MÉT — cùng hàm và cùng đơn vị
      // mà discovery dùng. Lưu ý thứ tự `ST_MakePoint(lng, lat)`: ngược lại là đổi toạ
      // độ Sài Gòn thành một điểm ngoài khơi Somalia, và truy vấn vẫn chạy.
      //
      // Người chưa đặt Vị trí mặc định (`default_location IS NULL`) KHÔNG nhận được —
      // đó là chủ ý: không biết họ ở đâu thì không thể nói họ ở trong vùng.
      filter = `AND users.default_location IS NOT NULL
        AND ST_DWithin(
          users.default_location,
          ST_SetSRID(ST_MakePoint($${values.length - 2}, $${values.length - 1}), 4326)::geography,
          $${values.length}
        )`;
    }

    const rows = await this.manager.query<{ id: string; global_id: string }[]>(
      `SELECT users.id, users.global_id FROM users
        WHERE users.id > $1
          AND users.status = 'ACTIVE'
          AND users.deleted_at IS NULL
          ${filter}
        ORDER BY users.id ASC
        LIMIT $2`,
      values,
    );
    return (rows ?? []).map((row) => ({
      // `id` là BIGSERIAL nên node-pg trả về CHUỖI. Dùng thẳng nó làm `afterId` cho trang
      // sau sẽ so chuỗi với số trong câu `WHERE id > $1` — Postgres vẫn chạy, nhưng mọi
      // phép tính ở tầng JS thì sai.
      id: Number(row.id),
      globalId: row.global_id,
    }));
  }
}
