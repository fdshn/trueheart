import { ICharityDispute } from '@/domain/ports/repository';
import {
  CharityDisputeReason,
  CharityDisputeStatus,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Tranh chấp đóng góp (CHARITY-PROJECT-LIFECYCLE §3.18, chốt 05/11): người đóng góp hoặc ban tổ
 * chức mở khi hai bên không thống nhất về một đóng góp đã được chấp nhận; bên kia hoặc Admin
 * giải quyết (bắt buộc kết luận); người mở được rút.
 */

export interface IOpenCharityDisputeCommand {
  readonly userId: string;
  readonly contributionId: string;
  readonly reason: CharityDisputeReason;
  readonly description: string;
  readonly evidenceUrls: string[];
}
export interface IOpenCharityDisputeUseCase extends IUseCase<
  IOpenCharityDisputeCommand,
  ICharityDispute
> {}
export const IOpenCharityDisputeUseCase = Symbol('IOpenCharityDisputeUseCase');

export interface IListCharityDisputesCommand {
  readonly userId: string;
  /** Một trong hai: theo dự án (ban tổ chức / Admin) hoặc theo đóng góp (hai bên). */
  readonly campaignId: string | null;
  readonly contributionId: string | null;
  readonly status: CharityDisputeStatus | null;
}
export interface IListCharityDisputesUseCase extends IUseCase<
  IListCharityDisputesCommand,
  ICharityDispute[]
> {}
export const IListCharityDisputesUseCase = Symbol(
  'IListCharityDisputesUseCase',
);

export interface ICloseCharityDisputeCommand {
  readonly userId: string;
  readonly disputeId: string;
  readonly action: 'RESOLVE' | 'WITHDRAW';
  readonly resolution: string | null;
}
export interface ICloseCharityDisputeUseCase extends IUseCase<
  ICloseCharityDisputeCommand,
  ICharityDispute
> {}
export const ICloseCharityDisputeUseCase = Symbol(
  'ICloseCharityDisputeUseCase',
);
