import {
  ICandidateSelectionView,
  IGetCandidateSelectionCommand,
  IGetCandidateSelectionResult,
  IGetCandidateSelectionUseCase,
  ISetCandidateSelectionCommand,
  ISetCandidateSelectionResult,
  ISetCandidateSelectionUseCase,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { CandidateSelectionConfigKey } from '@chantam.vn/chantam.core-lib/consts';
import { normalizeCandidateSelectionOrder } from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Dựng khung nhìn từ giá trị thô trong config.
 *
 * Luôn trả thứ tự ĐÃ CHUẨN HOÁ, không phải thứ Admin gõ vào: đó mới là thứ tự
 * hệ thống thật sự dùng. Hiển thị giá trị thô sẽ khiến Admin đọc một chính sách
 * khác với chính sách đang chạy.
 */
function toView(raw: unknown): ICandidateSelectionView {
  const configured = Array.isArray(raw) ? raw : null;

  return {
    order: normalizeCandidateSelectionOrder(configured).map((code, index) => ({
      code,
      priority: index + 1,
    })),
    isConfigured: configured !== null && configured.length > 0,
  };
}

@Injectable()
export class GetCandidateSelectionUseCase implements IGetCandidateSelectionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetCandidateSelectionCommand,
  ): Promise<IGetCandidateSelectionResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();

    return toView(
      await this.repository.getConfigValue(CandidateSelectionConfigKey),
    );
  }
}

/**
 * Đặt thứ tự ưu tiên chọn người nhận (CH-1).
 *
 * Ghi qua `publishSystemConfig` nên được hưởng nguyên cơ chế copy-on-write:
 * bản cũ đóng lại, bản mới tăng version, và `updated_by` cùng `change_reason`
 * đi thẳng vào audit. Quyết định "ai được nhận quà" đổi theo thời gian mà không
 * truy được ai đổi, lúc nào, vì sao là thứ không chấp nhận được.
 */
@Injectable()
export class SetCandidateSelectionUseCase implements ISetCandidateSelectionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetCandidateSelectionCommand,
  ): Promise<ISetCandidateSelectionResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    // Chuẩn hoá TRƯỚC khi ghi: lưu đúng thứ tự sẽ chạy, thay vì lưu thứ Admin
    // gõ rồi chuẩn hoá lại mỗi lần đọc. Nhờ vậy đọc config thô cũng thấy đúng
    // chính sách, và audit log ghi lại thứ thật sự có hiệu lực.
    const normalized = normalizeCandidateSelectionOrder(command.order);

    await this.repository.publishSystemConfig({
      actorUserId: command.actorUserId,
      key: CandidateSelectionConfigKey,
      value: normalized,
      valueType: 'JSON',
      reason: command.reason,
    });

    return toView(normalized);
  }
}
