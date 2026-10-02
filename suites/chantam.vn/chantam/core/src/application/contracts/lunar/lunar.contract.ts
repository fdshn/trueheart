import { ILunarHoliday } from '@/domain/ports/repository';
import { LunarObservance } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface ILunarTodayView {
  /** Ngày dương lịch theo UTC+7 — không theo múi giờ của máy chạy. */
  solarDate: string;
  lunarDay: number;
  lunarMonth: number;
  lunarYear: number;
  isLeapMonth: boolean;
  canChi: string;
  /** Chuỗi header đúng khuôn UC-LUNAR-01 bước 2. */
  header: string;
  /** `FULL_MOON` cho ngày 14/15, `NEW_MOON` cho ngày 30/1, `null` cho mọi ngày khác. */
  observance: LunarObservance;
  /**
   * Biểu ngữ UC-LUNAR-01 bước 4, hoặc `null` khi hôm nay không phải mốc nào.
   *
   * Dựng ở backend, không để client ghép: câu chữ là nội dung sản phẩm, và sửa nó không
   * nên phải chờ Store duyệt.
   */
  banner: string | null;
  /** Ngày lễ của hôm nay, nếu danh mục có. */
  holiday: ILunarHoliday | null;
}

export interface IGetLunarTodayCommand {
  /** Bỏ trống thì lấy thời điểm hiện tại. Có mặt để kiểm chứng và để Admin xem trước. */
  at?: Date;
}

export interface IGetLunarTodayUseCase extends IUseCase<
  IGetLunarTodayCommand,
  ILunarTodayView
> {}

export const IGetLunarTodayUseCase = Symbol('IGetLunarTodayUseCase');

export interface IListLunarHolidaysCommand {
  actorUserId: string;
}

export interface ILunarHolidayListResult {
  holidays: ILunarHoliday[];
}

export interface IListLunarHolidaysUseCase extends IUseCase<
  IListLunarHolidaysCommand,
  ILunarHolidayListResult
> {}

export const IListLunarHolidaysUseCase = Symbol('IListLunarHolidaysUseCase');

export interface IReplaceLunarHolidaysCommand {
  actorUserId: string;
  holidays: Array<{
    lunarMonth: number;
    lunarDay: number;
    name: string;
    description?: string | null;
    isActive?: boolean;
  }>;
}

export interface IReplaceLunarHolidaysUseCase extends IUseCase<
  IReplaceLunarHolidaysCommand,
  ILunarHolidayListResult
> {}

export const IReplaceLunarHolidaysUseCase = Symbol(
  'IReplaceLunarHolidaysUseCase',
);
