import {
  IGetEntitlementPolicyCommand,
  IGetEntitlementPolicyUseCase,
} from '@/application/contracts/entitlement';
import { IEntitlementRepository } from '@/domain/ports/repository';
import { IGetEntitlementPolicyResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetEntitlementPolicyUseCase implements IGetEntitlementPolicyUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(
    _command: IGetEntitlementPolicyCommand,
  ): Promise<IGetEntitlementPolicyResponseDto> {
    // `actorUserId` không dùng để lọc: chính sách là một bản chung cho cả hệ
    // thống, không phải dữ liệu riêng của người gọi. Quyền đọc do guard
    // `entitlement.read` quyết định trước khi vào tới đây.
    return { policy: await this.entitlementRepository.getPolicyRevision() };
  }
}
