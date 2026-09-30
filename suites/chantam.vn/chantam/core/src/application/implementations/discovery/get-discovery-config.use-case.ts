import {
  IGetDiscoveryConfigCommand,
  IGetDiscoveryConfigResult,
  IGetDiscoveryConfigUseCase,
} from '@/application/contracts/discovery';
import {
  DiscoveryDefaultRadiusConfigKey,
  DiscoveryMaxRadiusConfigKey,
  DiscoveryMinRadiusConfigKey,
  normalizeDiscoveryRadiusMeters,
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
    const limits = {
      min: MinSearchRadiusMeters,
      max: MaxSearchRadiusMeters,
    };
    const [minRaw, maxRaw, defaultRaw] = await Promise.all([
      this.adminConfig.getConfigValue(DiscoveryMinRadiusConfigKey),
      this.adminConfig.getConfigValue(DiscoveryMaxRadiusConfigKey),
      this.adminConfig.getConfigValue(DiscoveryDefaultRadiusConfigKey),
    ]);

    const minRadiusMeters = normalizeDiscoveryRadiusMeters(
      minRaw,
      limits,
      MinSearchRadiusMeters,
    );
    const maxRadiusMeters = normalizeGuestMaxRadiusMeters(maxRaw, limits);

    return {
      minRadiusMeters,
      maxRadiusMeters,
      // Mặc định phải nằm TRONG khoảng min–max vừa tính, không chỉ trong cận kỹ
      // thuật: một mặc định lớn hơn trần cho khách là client mở app đã bị 422.
      defaultRadiusMeters: normalizeDiscoveryRadiusMeters(
        defaultRaw,
        { min: minRadiusMeters, max: maxRadiusMeters },
        Math.min(maxRadiusMeters, Math.max(minRadiusMeters, 10_000)),
      ),
      defaultPageSize: DefaultPageSize,
      maxPageSize: MaxPageSize,
      supportedPostTypes: [...PublicDiscoveryPostTypes],
    };
  }
}
