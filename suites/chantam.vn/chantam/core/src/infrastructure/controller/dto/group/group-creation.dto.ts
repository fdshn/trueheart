import { GroupCreationBlockReasons } from '@/application/contracts/group';
import { ApiProperty } from '@nestjs/swagger';

/** Dùng chung cho `GET /groups/me` và `GET /me/entitlements` (SRS 3.7A). */
export class GroupCreationEligibilityDto {
  @ApiProperty({
    description:
      'Bấm "Tạo nhóm" có thành công không. Cùng bộ luật với `POST /groups`.',
  })
  canCreateGroup: boolean;

  @ApiProperty({
    enum: GroupCreationBlockReasons,
    nullable: true,
    description:
      '`null` khi tạo được. Ngược lại là ĐÚNG tên mã lỗi `POST /groups` sẽ trả, theo thứ tự kiểm: ' +
      '`PROFILE_INCOMPLETE` (hồ sơ chưa đủ) → `ONBOARDING_INCOMPLETE` → `GROUP_CREATE_NOT_ALLOWED` ' +
      '(hạng chưa được tạo nhóm — theo cấu hình hạng, baseline Kim Cương) → `GROUP_ALREADY_MEMBER` ' +
      '(đã sở hữu hoặc đã thuộc một nhóm) → `GROUP_DEFAULT_LOCATION_REQUIRED`.',
  })
  reasonCode: (typeof GroupCreationBlockReasons)[number] | null;
}
