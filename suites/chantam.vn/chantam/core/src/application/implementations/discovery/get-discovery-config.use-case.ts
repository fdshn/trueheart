import {
  IGetDiscoveryConfigCommand,
  IGetDiscoveryConfigResult,
  IGetDiscoveryConfigUseCase,
} from '@/application/contracts/discovery';
import {
  DiscoveryMaxRadiusConfigKey,
  normalizeGuestMaxRadiusMeters,
} from '@/domain/consts';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { PublicDiscoveryPostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { DefaultPageSize, MaxPageSize } from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetDiscoveryConfigUseCase implements IGetDiscoveryConfigUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    _command: IGetDiscoveryConfigCommand,
  ): Promise<IGetDiscoveryConfigResult> {
    return {
      minRadiusMeters: MinSearchRadiusMeters,
      maxRadiusMeters: normalizeGuestMaxRadiusMeters(
        await this.adminConfig.getConfigValue(DiscoveryMaxRadiusConfigKey),
        { min: MinSearchRadiusMeters, max: MaxSearchRadiusMeters },
      ),
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: [...PublicDiscoveryPostTypes],
    };
  }
}
