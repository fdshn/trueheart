import { DefaultPageSize, MaxPageSize } from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { GetDiscoveryConfigUseCase } from './get-discovery-config.use-case';

describe('GetDiscoveryConfigUseCase', () => {
  it('returns only stable guest discovery policy derived from shared constants', async () => {
    const result = await new GetDiscoveryConfigUseCase().handle({});

    expect(result).toEqual({
      minRadiusMeters: MinSearchRadiusMeters,
      maxRadiusMeters: MaxSearchRadiusMeters,
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: ['OFFER', 'WANTED'],
    });
    expect(result).not.toHaveProperty('database');
    expect(result).not.toHaveProperty('auth');
    expect(result).not.toHaveProperty('storage');
  });
});
