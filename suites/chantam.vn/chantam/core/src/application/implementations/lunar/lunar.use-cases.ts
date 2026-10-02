import {
  IGetLunarTodayCommand,
  IGetLunarTodayUseCase,
  IListLunarHolidaysCommand,
  IListLunarHolidaysUseCase,
  ILunarHolidayListResult,
  ILunarTodayView,
  IReplaceLunarHolidaysCommand,
  IReplaceLunarHolidaysUseCase,
} from '@/application/contracts/lunar';
import {
  IAdminConfigRepository,
  ILunarHolidayRepository,
} from '@/domain/ports/repository';
import {
  canChiOfYear,
  formatLunarHeader,
  lunarDateOf,
  observanceOf,
  vietnamSolarDate,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Hai câu biểu ngữ của UC-LUNAR-01 bước 4.
 *
 * Đặc tả viết một câu chung cho cả hai mốc (*"Hôm nay là Ngày Rằm / Mùng Một – …"*). Tách
 * thành hai vì client không ghép được: nó chỉ biết `observance`, và để nó tự chọn chữ là
 * đưa nội dung sản phẩm vào bản app — sửa một dấu phẩy phải chờ Store duyệt.
 */
const BannerByObservance = {
  FULL_MOON:
    'Hôm nay là Ngày Rằm – Chúc bạn một ngày an lạc và tràn đầy duyên lành sẻ chia!',
  NEW_MOON:
    'Hôm nay là Mùng Một – Chúc bạn một ngày an lạc và tràn đầy duyên lành sẻ chia!',
} as const;

@Injectable()
export class GetLunarTodayUseCase implements IGetLunarTodayUseCase {
  public constructor(
    @Inject(ILunarHolidayRepository)
    private readonly holidays: ILunarHolidayRepository,
  ) {}

  public async handle(
    command: IGetLunarTodayCommand,
  ): Promise<ILunarTodayView> {
    const at = command.at ?? new Date();
    const solar = vietnamSolarDate(at);
    const lunar = lunarDateOf(at);
    const observance = observanceOf(lunar);

    // Tra ngày lễ theo tháng CHÍNH, kể cả khi hôm nay thuộc tháng nhuận: danh mục chuẩn
    // không có ca lễ rơi vào tháng nhuận, và tháng nhuận là tháng lặp lại nên lễ giữ ở
    // tháng chính.
    const holiday = await this.holidays.findByLunarDate(lunar.month, lunar.day);

    const pad = (value: number): string => String(value).padStart(2, '0');

    return {
      solarDate: `${solar.year}-${pad(solar.month)}-${pad(solar.day)}`,
      lunarDay: lunar.day,
      lunarMonth: lunar.month,
      lunarYear: lunar.year,
      isLeapMonth: lunar.isLeapMonth,
      canChi: canChiOfYear(lunar.year),
      header: formatLunarHeader(at),
      observance,
      banner: observance === null ? null : BannerByObservance[observance],
      holiday,
    };
  }
}

@Injectable()
export class ListLunarHolidaysUseCase implements IListLunarHolidaysUseCase {
  public constructor(
    @Inject(ILunarHolidayRepository)
    private readonly holidays: ILunarHolidayRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListLunarHolidaysCommand,
  ): Promise<ILunarHolidayListResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'config.read')))
      throw new ForbiddenException();

    return { holidays: await this.holidays.listAll() };
  }
}

@Injectable()
export class ReplaceLunarHolidaysUseCase implements IReplaceLunarHolidaysUseCase {
  public constructor(
    @Inject(ILunarHolidayRepository)
    private readonly holidays: ILunarHolidayRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IReplaceLunarHolidaysCommand,
  ): Promise<ILunarHolidayListResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'config.write')))
      throw new ForbiddenException();

    // Khử trùng cặp (tháng, ngày) TRƯỚC khi ghi.
    //
    // Khoá `UQ_lunar_holidays_date` sẽ chặn, nhưng nó chặn bằng một lỗi ràng buộc ở giữa
    // vòng chèn — tức transaction rollback và Admin nhận một thông báo nói về tên khoá
    // thay vì nói ngày nào bị trùng.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const holiday of command.holidays) {
      const key = `${holiday.lunarMonth}/${holiday.lunarDay}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    if (duplicates.length > 0)
      throw new ValidationFailedException([
        `trùng ngày âm lịch: ${[...new Set(duplicates)].join(', ')} — mỗi ngày ` +
          'chỉ một ngày lễ, nếu không client không biết hiện huy hiệu nào',
      ]);

    // Danh mục RỖNG bị từ chối.
    //
    // UC-LUNAR-01 gọi lịch âm là "chức năng BẮT BUỘC trong Phase 1", và một danh mục rỗng
    // nghĩa là app không còn huy hiệu nào. Muốn ẩn hết thì tắt từng dòng bằng `isActive`,
    // vẫn giữ được danh mục để bật lại.
    if (command.holidays.length === 0)
      throw new ValidationFailedException([
        'holidays không được rỗng — tắt từng ngày lễ bằng `isActive` thay vì xoá hết',
      ]);

    return {
      holidays: await this.holidays.replaceAll({
        actorUserId: command.actorUserId,
        holidays: command.holidays.map((holiday) => ({
          lunarMonth: holiday.lunarMonth,
          lunarDay: holiday.lunarDay,
          name: holiday.name.trim(),
          description: holiday.description?.trim() || null,
          isActive: holiday.isActive !== false,
        })),
      }),
    };
  }
}
