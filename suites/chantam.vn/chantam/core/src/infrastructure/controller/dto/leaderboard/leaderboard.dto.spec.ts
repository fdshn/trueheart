import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
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
