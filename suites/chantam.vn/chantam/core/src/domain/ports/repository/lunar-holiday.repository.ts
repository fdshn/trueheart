/**
 * Danh mục Ngày lễ Phật giáo (UC-LUNAR-01 bước 3, F46).
 *
 * Khoá là cặp (tháng, ngày) âm lịch, không có năm: ngày lễ lặp hằng năm theo âm lịch, nên
 * lưu kèm năm là lưu cùng một dòng 50 lần và mời một năm bị bỏ sót.
 */
export interface ILunarHoliday {
  lunarMonth: number;
  lunarDay: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface IReplaceLunarHolidaysParams {
  actorUserId: string;
  holidays: readonly Omit<ILunarHoliday, 'sortOrder'>[];
}

export interface ILunarHolidayRepository {
  /** Toàn bộ danh mục, gồm cả dòng đã tắt — CMS cần thấy chúng để bật lại. */
  listAll(): Promise<ILunarHoliday[]>;
  /**
   * Ngày lễ ĐANG BẬT của một ngày âm lịch, hoặc `null`.
   *
   * Khoá UNIQUE trên cặp (tháng, ngày) bảo đảm nhiều nhất một dòng, nên không cần quyết
   * định "chọn cái nào" ở tầng trên.
   */
  findByLunarDate(
    lunarMonth: number,
    lunarDay: number,
  ): Promise<ILunarHoliday | null>;
  /**
   * Thay TOÀN BỘ danh mục trong một transaction.
   *
   * Thay cả bộ chứ không vá từng dòng, cùng lối `replaceGroupRolePermissions`: một danh mục
   * nửa cũ nửa mới là thứ không ai đọc được khi đi soát lại, và CMS vốn hiện cả bảng rồi
   * lưu cả bảng.
   */
  replaceAll(params: IReplaceLunarHolidaysParams): Promise<ILunarHoliday[]>;
}

export const ILunarHolidayRepository = Symbol('ILunarHolidayRepository');
