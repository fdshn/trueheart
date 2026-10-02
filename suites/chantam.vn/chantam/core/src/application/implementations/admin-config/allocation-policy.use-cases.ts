import {
  IAllocationPolicyView,
  IGetAllocationPolicyCommand,
  IGetAllocationPolicyResult,
  IGetAllocationPolicyUseCase,
  ISetAllocationPolicyCommand,
  ISetAllocationPolicyResult,
  ISetAllocationPolicyUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  AllocationPolicyConfigKey,
  allocationPolicyGaps,
  normalizeAllocationPolicy,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

function toView(raw: unknown): IAllocationPolicyView {
  // `null` là "chưa publish"; một object rỗng là "đã publish một bản rỗng" — hai
  // trạng thái khác nhau, và chỉ cái đầu mới được báo `isConfigured: false`.
  const configured = typeof raw === 'object' && raw !== null;

  return {
    policy: normalizeAllocationPolicy(raw),
    isConfigured: configured,
  };
}

@Injectable()
export class GetAllocationPolicyUseCase implements IGetAllocationPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAllocationPolicyCommand,
  ): Promise<IGetAllocationPolicyResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();

    return toView(
      await this.repository.getConfigValue(AllocationPolicyConfigKey),
    );
  }
}

/**
 * Publish chính sách phân bổ (SRS §6.2.14).
 *
 * Ghi qua `publishSystemConfig` nên hưởng nguyên copy-on-write của `system_configs`:
 * bản cũ đóng lại, bản mới tăng version, `updated_by` và `change_reason` đi thẳng vào
 * audit log. Đổi luật ghép nối mà không truy được ai đổi, lúc nào, vì sao là thứ
 * không chấp nhận được — đây là chính sách quyết định ai thấy bài của ai.
 */
@Injectable()
export class SetAllocationPolicyUseCase implements ISetAllocationPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetAllocationPolicyCommand,
  ): Promise<ISetAllocationPolicyResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    // Chuẩn hoá TRƯỚC khi kiểm và TRƯỚC khi ghi, cùng lối `SetCandidateSelectionUseCase`:
    // lưu đúng thứ sẽ chạy, nhờ vậy đọc config thô cũng thấy đúng chính sách và audit
    // log ghi lại thứ thật sự có hiệu lực. Riêng ở đây việc đó còn cần thiết hơn, vì
    // trọng số bị chia lại: ghi `5/3/2` rồi chuẩn hoá lúc đọc nghĩa là audit log nói
    // một chính sách mà hệ thống chạy một chính sách khác.
    const policy = normalizeAllocationPolicy({
      categoryMatchRequired: command.categoryMatchRequired,
      distanceRule: command.distanceRule,
      keywordMatchEnabled: command.keywordMatchEnabled,
      autoCreateTransaction: command.autoCreateTransaction,
      maxSuggestions: command.maxSuggestions,
      weights: command.weights,
    });

    const gaps = allocationPolicyGaps(policy);
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    await this.repository.publishSystemConfig({
      actorUserId: command.actorUserId,
      key: AllocationPolicyConfigKey,
      value: policy,
      valueType: 'JSON',
      reason: command.reason,
    });

    return toView(policy);
  }
}
