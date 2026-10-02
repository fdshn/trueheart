/**
 * Âm lịch Việt Nam (UC-LUNAR-01, F46).
 *
 * ## Vì sao backend cần bộ chuyển đổi, dù SRS nói client tự làm
 *
 * UC-LUNAR-01 bước 1 ghi *"Flutter Client gọi module lunar_calendar_converter"* — tức phần
 * hiển thị là việc của client. Nhưng bước 3 đòi *"đối chiếu ngày Âm lịch với **danh mục
 * Ngày lễ Phật giáo chuẩn**"*, và danh mục đó phải do backend giữ, nếu không mỗi bản app
 * mang một danh mục riêng và sửa một ngày lễ phải chờ Store duyệt.
 *
 * Quan trọng hơn: BR-DHARMA-03 và mục 1507 đòi **thông báo** ngày Rằm/Mùng 1. Một cron
 * không hỏi client được. Nên backend phải tự chuyển đổi được.
 *
 * ## Vì sao viết thuần, không thêm dependency
 *
 * Invariant 7: `core-lib` là contract mà Next.js web/admin sẽ import trực tiếp. Bộ chuyển
 * đổi này là **số học thuần** — không I/O, không bảng tra, không múi giờ hệ thống — nên nó
 * thuộc về đây và không kéo gì vào bundle.
 *
 * Thuật toán theo Hồ Ngọc Đức (bản dùng rộng rãi cho Âm lịch Việt Nam), múi giờ UTC+7.
 * Mọi hằng số dưới đây là hằng số thiên văn, không phải lựa chọn sản phẩm.
 *
 * ## Múi giờ
 *
 * Việt Nam không có DST, nên "ngày âm lịch của hôm nay" = ngày dương lịch theo UTC+7 rồi
 * chuyển. Cùng lối `businessDateOf` của phân hệ điểm danh — và đây là lý do hai chỗ đó
 * phải dùng cùng một quy ước: một bản ghi điểm danh ngày Rằm phải khớp với tấm biểu ngữ
 * ngày Rằm mà người dùng vừa thấy.
 */

/** Lệch múi giờ Việt Nam, đơn vị NGÀY — dùng trực tiếp trong công thức Julian. */
const VietnamTimeZoneOffsetDays = 7 / 24;

export interface ILunarDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
  /** `true` khi đây là tháng nhuận. */
  readonly isLeapMonth: boolean;
}

/** Số ngày Julian của một ngày dương lịch (lịch Gregory). */
export function jdFromDate(day: number, month: number, year: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  // Trước 1582-10-15 là lịch Julius; công thức trên là Gregory. Không ai dùng app này
  // cho năm 1582, nhưng để nhánh đó sai im lặng thì một phép kiểm biên sẽ nói sai.
  if (jd < 2_299_161) {
    jd =
      day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }

  return jd;
}

export function jdToDate(jd: number): {
  day: number;
  month: number;
  year: number;
} {
  let a: number;
  let b: number;
  let c: number;

  if (jd > 2_299_160) {
    a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }

  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);

  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: b * 100 + d - 4800 + Math.floor(m / 10),
  };
}

/**
 * Ngày Julian của kỳ sóc (new moon) thứ `k` kể từ 1900-01-01.
 *
 * Công thức Meeus, rút gọn tới mức đủ chính xác cho việc chia tháng âm lịch.
 */
function newMoonJd(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;

  let Jd1 =
    2_415_020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);

  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;

  let C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) - 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -=
    0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 +=
    0.001 * Math.sin(dr * (2 * F - Mpr)) +
    0.0005 * Math.sin(dr * (2 * Mpr + M));

  const deltat =
    T < -11
      ? 0.001 +
        0.000839 * T +
        0.0002261 * T2 -
        0.00000845 * T3 -
        0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;

  return Jd1 + C1 - deltat;
}

/** Kinh độ Mặt Trời, tính theo bậc 1/30 vòng (dùng để tìm tháng 11 âm lịch). */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2_451_545.0) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL +=
    (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) +
    0.00029 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L *= dr;
  L -= Math.PI * 2 * Math.floor(L / (Math.PI * 2));
  return Math.floor((L / Math.PI) * 6);
}

function newMoonDay(k: number, timeZoneOffsetDays: number): number {
  return Math.floor(newMoonJd(k) + 0.5 + timeZoneOffsetDays);
}

function sunLongitudeAtMidnight(
  dayNumber: number,
  timeZoneOffsetDays: number,
): number {
  return sunLongitude(dayNumber - 0.5 - timeZoneOffsetDays);
}

function lunarMonth11(year: number, timeZoneOffsetDays: number): number {
  const off = jdFromDate(31, 12, year) - 2_415_021;
  const k = Math.floor(off / 29.530588853);
  let nm = newMoonDay(k, timeZoneOffsetDays);
  const sunLong = sunLongitudeAtMidnight(nm, timeZoneOffsetDays);
  if (sunLong >= 9) nm = newMoonDay(k - 1, timeZoneOffsetDays);
  return nm;
}

function leapMonthOffset(a11: number, timeZoneOffsetDays: number): number {
  const k = Math.floor((a11 - 2_415_021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = sunLongitudeAtMidnight(
    newMoonDay(k + i, timeZoneOffsetDays),
    timeZoneOffsetDays,
  );

  do {
    last = arc;
    i += 1;
    arc = sunLongitudeAtMidnight(
      newMoonDay(k + i, timeZoneOffsetDays),
      timeZoneOffsetDays,
    );
  } while (arc !== last && i < 14);

  return i - 1;
}

/**
 * Chuyển một ngày dương lịch sang âm lịch Việt Nam.
 *
 * `day`/`month`/`year` là ngày dương lịch **theo UTC+7** — bên gọi chịu trách nhiệm cắt
 * múi giờ, giống `businessDateOf` của phân hệ điểm danh.
 */
export function solarToLunar(
  day: number,
  month: number,
  year: number,
): ILunarDate {
  const tz = VietnamTimeZoneOffsetDays;
  const dayNumber = jdFromDate(day, month, year);
  const k = Math.floor((dayNumber - 2_415_021.076998695) / 29.530588853);

  let monthStart = newMoonDay(k + 1, tz);
  if (monthStart > dayNumber) monthStart = newMoonDay(k, tz);

  let a11 = lunarMonth11(year, tz);
  let b11 = a11;
  let lunarYear: number;

  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = lunarMonth11(year - 1, tz);
  } else {
    lunarYear = year + 1;
    b11 = lunarMonth11(year + 1, tz);
  }

  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;

  if (b11 - a11 > 365) {
    const leapMonthDiff = leapMonthOffset(a11, tz);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = true;
    }
  }

  if (lunarMonth > 12) lunarMonth -= 12;
  // Tháng 11, 12 của năm âm lịch trước rơi vào đầu năm dương lịch sau.
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;

  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    isLeapMonth: lunarLeap,
  };
}

/**
 * Ngày dương lịch theo UTC+7 của một mốc thời gian.
 *
 * Việt Nam không có DST nên cộng thẳng 7 giờ rồi đọc theo UTC là đủ — không cần thư viện
 * múi giờ, và không phụ thuộc múi giờ của máy chạy. Cùng cách `businessDateOf` làm, và hai
 * chỗ đó PHẢI cùng quy ước: một bản ghi điểm danh ngày Rằm phải khớp tấm biểu ngữ ngày Rằm
 * người dùng vừa thấy.
 */
export function vietnamSolarDate(at: Date): {
  day: number;
  month: number;
  year: number;
} {
  const shifted = new Date(at.getTime() + 7 * 60 * 60 * 1_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

export function lunarDateOf(at: Date): ILunarDate {
  const solar = vietnamSolarDate(at);
  return solarToLunar(solar.day, solar.month, solar.year);
}

export const HeavenlyStems = [
  'Giáp',
  'Ất',
  'Bính',
  'Đinh',
  'Mậu',
  'Kỷ',
  'Canh',
  'Tân',
  'Nhâm',
  'Quý',
] as const;

export const EarthlyBranches = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
] as const;

/**
 * Can Chi của một năm âm lịch — UC-LUNAR-01 bước 2 đòi nó trên header.
 *
 * `+ 6` và `+ 8` là mốc hiệu chỉnh của hệ 60: năm 1984 là Giáp Tý.
 */
export function canChiOfYear(lunarYear: number): string {
  const stem = HeavenlyStems[(lunarYear + 6) % 10];
  const branch = EarthlyBranches[(lunarYear + 8) % 12];
  return `${stem} ${branch}`;
}

/**
 * Mốc Rằm / Mùng Một mà UC-LUNAR-01 bước 4 nêu.
 *
 * Đặc tả ghi *"ngày 14, 15 (Rằm) hoặc ngày 30, 01 (Mùng 1)"* — tức mỗi mốc gồm HAI ngày
 * âm lịch, không phải một. Lý do: lễ chùa diễn ra cả đêm trước, và tháng âm lịch thiếu
 * không có ngày 30 nên ngày 29 là đêm cuối tháng.
 *
 * Giữ đúng danh sách đặc tả nêu, không tự thêm ngày 29: thêm vào là đổi nội dung biểu ngữ
 * người dùng thấy, và đó là quyết định của Bên A.
 */
export const FullMoonLunarDays: readonly number[] = [14, 15];
export const NewMoonLunarDays: readonly number[] = [30, 1];

export type LunarObservance = 'FULL_MOON' | 'NEW_MOON' | null;

export function observanceOf(lunar: ILunarDate): LunarObservance {
  if (FullMoonLunarDays.includes(lunar.day)) return 'FULL_MOON';
  if (NewMoonLunarDays.includes(lunar.day)) return 'NEW_MOON';
  return null;
}

/** Chuỗi header UC-LUNAR-01 bước 2: `dd/MM/yyyy (Dương) - dd/MM (Âm lịch) [Can Chi]`. */
export function formatLunarHeader(at: Date): string {
  const solar = vietnamSolarDate(at);
  const lunar = lunarDateOf(at);
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${pad(solar.day)}/${pad(solar.month)}/${solar.year} - ` +
    `${pad(lunar.day)}/${pad(lunar.month)}${lunar.isLeapMonth ? ' (nhuận)' : ''} ` +
    `[${canChiOfYear(lunar.year)}]`
  );
}
