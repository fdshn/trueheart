import { IEntitlementsSummaryDto } from '@chantam.vn/chantam.core-lib/dto';

export interface IEntitlementRepository {
  getOwnEntitlements(userId: string): Promise<IEntitlementsSummaryDto>;
}

export const IEntitlementRepository = Symbol('IEntitlementRepository');
