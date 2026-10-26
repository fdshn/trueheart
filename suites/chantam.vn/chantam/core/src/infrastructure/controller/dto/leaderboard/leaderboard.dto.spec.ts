import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateLeaderboardExclusionDto,
  ListAdminBadgesQueryDto,
  ListLeaderboardExclusionsQueryDto,
  RevokeBadgeDto,
} from './admin-leaderboard.dto';
import { GetMonthlyLeaderboardQueryDto } from './leaderboard.dto';

/**
 * `ValidationPipe` chạy với `whitelist` + `forbidNonWhitelisted`: trường không mang decorator
 * class-validator bị coi là lạ. 24/10, `month` nằm ở lớp thứ hai của `Mixin(...)` với
 * decorator thường (không `decorate()`), nên ts-mixer không chép metadata — `?month=2026-09`
 * bị gạt đi và bảng luôn trả tháng hiện tại.
 */
describe('GetMonthlyLeaderboardQueryDto', () => {
  const errors = (query: Record<string, string>) =>
    validateSync(plainToInstance(GetMonthlyLeaderboardQueryDto, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('giữ month, board và phân trang', () => {
    const dto = plainToInstance(GetMonthlyLeaderboardQueryDto, {
      board: 'GIVERS',
      month: '2026-09',
      page: '2',
    });
    expect(errors({ board: 'GIVERS', month: '2026-09', page: '2' })).toEqual(
      [],
    );
    expect(dto.month).toBe('2026-09');
    expect(dto.page).toBe(2);
  });

  it('board bắt buộc và phải đúng mã', () => {
    expect(errors({}).map((error) => error.property)).toContain('board');
    expect(errors({ board: 'NOPE' }).map((error) => error.property)).toEqual([
      'board',
    ]);
  });
});

describe('tháng ở DTO Admin dùng chung khoảng năm với bảng công khai', () => {
  it.each([
    ['ListAdminBadgesQueryDto', ListAdminBadgesQueryDto],
    ['ListLeaderboardExclusionsQueryDto', ListLeaderboardExclusionsQueryDto],
  ] as const)('%s từ chối năm 0000', (_name, cls) => {
    const errors = validateSync(plainToInstance(cls, { month: '0000-01' }));
    expect(errors.map((error) => error.property)).toEqual(['month']);
  });
});

describe('lý do của Admin không được toàn khoảng trắng', () => {
  // Năm dấu cách qua được `@Length(5, 500)`, rồi đâm vào `CHK_leaderboard_exclusions_reason`
  // thành một 500 — còn ở gỡ huy hiệu thì được lưu thẳng, tức "bắt buộc lý do" mà không có lý do.
  it('lượt loại', () => {
    const errors = validateSync(
      plainToInstance(CreateLeaderboardExclusionDto, {
        month: '2026-10',
        userId: '11111111-1111-4111-8111-111111111111',
        reason: '      ',
      }),
    );
    expect(errors.map((error) => error.property)).toEqual(['reason']);
  });

  it('gỡ huy hiệu', () => {
    const errors = validateSync(
      plainToInstance(RevokeBadgeDto, { reason: '      ' }),
    );
    expect(errors.map((error) => error.property)).toEqual(['reason']);
  });
});

/**
 * `flattenValidationErrors` ở kernel tự ghép "trường: thông báo". Thông báo tự mang tên trường
 * thì response ra "month: month: phải có dạng YYYY-MM".
 */
describe('thông báo validate không tự lặp tên trường', () => {
  const messagesOf = (target: new () => object, input: object) =>
    validateSync(plainToInstance(target, input)).flatMap((error) =>
      Object.values(error.constraints ?? {}).map((message) => ({
        property: error.property,
        message,
      })),
    );

  it.each([
    [ListAdminBadgesQueryDto, { month: '2026-13' }],
    [ListLeaderboardExclusionsQueryDto, { month: 'tháng mười' }],
    [
      CreateLeaderboardExclusionDto,
      { month: '2026-13', board: 'GIVERS', userId: 'x', reason: '   ' },
    ],
    [RevokeBadgeDto, { reason: '   ' }],
  ])('%p', (target, input) => {
    const messages = messagesOf(target as new () => object, input);
    expect(messages.length).toBeGreaterThan(0);
    for (const { property, message } of messages)
      expect(message.startsWith(`${property}:`)).toBe(false);
  });
});
