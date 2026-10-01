import {
  IGetEntitlementPolicyHistoryCommand,
  IGetEntitlementPolicyHistoryUseCase,
} from '@/application/contracts/entitlement';
import { IEntitlementRepository } from '@/domain/ports/repository';
import { IGetEntitlementPolicyHistoryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

/** Trần mặc định: lịch sử chính sách đổi rất thưa, hai mươi bản là đủ xa. */
const DefaultHistoryLimit = 20;
const MaxHistoryLimit = 100;

/**
 * Lịch sử các bản chính sách quyền/quota.
 *
 * Dữ liệu đã đầy đủ từ đầu: `capability_policies.revision_id` trỏ `config_revisions`,
 * và bảng đó giữ `effective_from`/`effective_to` cùng `PUBLISHED`/`ARCHIVED` — đúng cơ
 * chế `system_configs` dùng. Thiếu duy nhất một đường đọc, nên câu *"bài bị từ chối vì
 * quota thì lúc đó quota là bao nhiêu"* chỉ trả lời được bằng SQL tay.
 *
 * Đó là một khoảng cách nhỏ nhưng nó rơi đúng vào lúc tệ nhất: khi có người khiếu nại.
 */
@Injectable()
export class GetEntitlementPolicyHistoryUseCase implements IGetEntitlementPolicyHistoryUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
  ) {}

  public async handle(
    command: IGetEntitlementPolicyHistoryCommand,
  ): Promise<IGetEntitlementPolicyHistoryResponseDto> {
    const limit = Math.min(
      MaxHistoryLimit,
      Math.max(1, Math.trunc(command.limit ?? DefaultHistoryLimit)),
    );

    return {
      revisions: await this.entitlements.listPolicyHistory(limit),
    };
  }
}
