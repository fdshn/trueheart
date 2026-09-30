import { DefaultPageSize, MaxPageSize } from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { GetDiscoveryConfigUseCase } from './get-discovery-config.use-case';

describe('GetDiscoveryConfigUseCase', () => {
  /** Cấu hình theo khoá, đúng hình ba khoá discovery đang seed. */
  function makeConfig(values: Record<string, unknown>) {
    return {
      getConfigValue: jest.fn(async (key: string) => values[key] ?? null),
    };
  }

  it('đọc CẢ BA khoá discovery, không chỉ khoá max', async () => {
    // Tới 30/09 chỉ `discovery.max_radius_meters` được đọc; `min` và `default` có
    // dòng trong `system_configs` mà không ai chạm — Admin sửa được và không gì
    // thay đổi.
    const adminConfig = makeConfig({
      'discovery.min_radius_meters': 500,
      'discovery.max_radius_meters': 5_000,
      'discovery.default_radius_meters': 3_000,
    });
    const result = await new GetDiscoveryConfigUseCase(
      adminConfig as never,
    ).handle({});

    expect(result).toEqual({
      minRadiusMeters: 500,
      maxRadiusMeters: 5_000,
      defaultRadiusMeters: 3_000,
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: ['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'],
    });
    expect(result).not.toHaveProperty('database');
    expect(result).not.toHaveProperty('auth');
    expect(result).not.toHaveProperty('storage');
    for (const key of [
      'discovery.min_radius_meters',
      'discovery.max_radius_meters',
      'discovery.default_radius_meters',
    ])
      expect(adminConfig.getConfigValue).toHaveBeenCalledWith(key);
  });

  it('kẹp mặc định vào khoảng min–max, không chỉ vào cận kỹ thuật', async () => {
    // Một mặc định lớn hơn trần cho khách là client mở app đã bị 422.
    const result = await new GetDiscoveryConfigUseCase(
      makeConfig({
        'discovery.max_radius_meters': 5_000,
        'discovery.default_radius_meters': 40_000,
      }) as never,
    ).handle({});

    expect(result.defaultRadiusMeters).toBe(5_000);
  });

  it('min hỏng thì về sàn KỸ THUẬT, không về 0', async () => {
    // 0 m là một truy vấn không trả gì; sàn kỹ thuật tồn tại để không lộ vị trí
    // quá chi tiết.
    const result = await new GetDiscoveryConfigUseCase(
      makeConfig({ 'discovery.min_radius_meters': 'hỏng' }) as never,
    ).handle({});

    expect(result.minRadiusMeters).toBe(MinSearchRadiusMeters);
  });

  it('falls back to the technical maximum when config is invalid', async () => {
    const result = await new GetDiscoveryConfigUseCase({
      getConfigValue: jest.fn().mockResolvedValue('broken'),
    } as never).handle({});

    expect(result.maxRadiusMeters).toBe(MaxSearchRadiusMeters);
  });
});
