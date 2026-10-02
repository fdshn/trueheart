import {
  IBulkNotifyAudienceRepository,
  ILunarHoliday,
  ILunarHolidayRepository,
  IReplaceLunarHolidaysParams,
} from '@/domain/ports/repository';
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
  }): Promise<{ id: number; globalId: string }[]> {
    const rows = await this.manager.query<{ id: string; global_id: string }[]>(
      `SELECT id, global_id FROM users
        WHERE id > $1
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT $2`,
      [params.afterId, params.limit],
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
