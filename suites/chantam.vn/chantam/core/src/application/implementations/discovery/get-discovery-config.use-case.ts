import {
  IGetDiscoveryConfigCommand,
  IGetDiscoveryConfigResult,
  IGetDiscoveryConfigUseCase,
} from '@/application/contracts/discovery';
import { PublicDiscoveryPostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { DefaultPageSize, MaxPageSize } from '@chantam/service.common-lib/dto';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetDiscoveryConfigUseCase implements IGetDiscoveryConfigUseCase {
  public async handle(
    _command: IGetDiscoveryConfigCommand,
  ): Promise<IGetDiscoveryConfigResult> {
    return {
      minRadiusMeters: MinSearchRadiusMeters,
      maxRadiusMeters: MaxSearchRadiusMeters,
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: [...PublicDiscoveryPostTypes],
    };
  }
}
