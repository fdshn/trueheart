import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminDashboardQueryDto } from './admin-dashboard.dto';

/**
 * CMS backlog B9: docs và use case nói `windowDays` ngoài 1–365 được KẸP, nhưng DTO lại
 * chặn bằng 400 trước khi tới use case. Ý đồ kẹp là có chủ đích (ô nhập trên màn hình),
 * nên DTO chỉ đòi số nguyên.
 */
const errorsOf = (windowDays: string) =>
  validateSync(plainToInstance(AdminDashboardQueryDto, { windowDays })).length;

describe('AdminDashboardQueryDto.windowDays', () => {
  it.each(['99999', '0', '-5', '30'])('%s lọt DTO để use case kẹp', (value) => {
    expect(errorsOf(value)).toBe(0);
  });

  it('không phải số nguyên thì vẫn 400', () => {
    expect(errorsOf('abc')).toBe(1);
    expect(errorsOf('1.5')).toBe(1);
  });
});
