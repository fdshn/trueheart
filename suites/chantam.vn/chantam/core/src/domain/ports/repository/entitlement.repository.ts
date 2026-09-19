import {
  IEntitlementDto,
  IEntitlementsSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';

export interface IEntitlementRepository {
  getOwnEntitlements(userId: string): Promise<IEntitlementsSummaryDto>;
  getCapability(userId: string, code: string): Promise<IEntitlementDto | null>;
}

export const IEntitlementRepository = Symbol('IEntitlementRepository');
