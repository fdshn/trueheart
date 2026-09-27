import { DefaultPageSize, MaxPageSize } from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { GetDiscoveryConfigUseCase } from './get-discovery-config.use-case';

describe('GetDiscoveryConfigUseCase', () => {
  it('returns the configured guest radius without exposing infrastructure config', async () => {
    const adminConfig = {
      getConfigValue: jest.fn().mockResolvedValue(5_000),
    };
    const result = await new GetDiscoveryConfigUseCase(
      adminConfig as never,
    ).handle({});

    expect(result).toEqual({
      minRadiusMeters: MinSearchRadiusMeters,
      maxRadiusMeters: 5_000,
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: ['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'],
    });
    expect(result).not.toHaveProperty('database');
    expect(result).not.toHaveProperty('auth');
    expect(result).not.toHaveProperty('storage');
    expect(adminConfig.getConfigValue).toHaveBeenCalledWith(
      'discovery.max_radius_meters',
    );
  });

  it('falls back to the technical maximum when config is invalid', async () => {
    const result = await new GetDiscoveryConfigUseCase({
      getConfigValue: jest.fn().mockResolvedValue('broken'),
    } as never).handle({});

    expect(result.maxRadiusMeters).toBe(MaxSearchRadiusMeters);
  });
});
