import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementsSummaryDto,
  IGetOwnEntitlementsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CapabilityKinds } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EntitlementDto implements IEntitlementDto {
  @ApiProperty({ example: 'POST_OPEN' })
  code: string;

  @ApiProperty({
    enum: CapabilityKinds,
    description:
      'Cách đọc ba trường dưới. QUOTA: limit/used/remaining đều có nghĩa. GATE: chỉ allowed có nghĩa, ba trường kia null. VALUE: limit là một con số KHÔNG tiêu dần (ví dụ bán kính theo mét), used và remaining null. Dẫn xuất trong code chứ không phải một ô Admin đặt được — "có bộ đếm hay không" là sự thật về code, không phải một lựa chọn cấu hình.',
  })
  kind: CapabilityKinds;

  @ApiProperty({ example: true })
  allowed: boolean;

  @ApiPropertyOptional({ nullable: true, example: 10 })
  limit: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 2,
    description:
      'Đã dùng bao nhiêu, null khi capability này không có bộ đếm. "Không đếm" và "đã dùng 0" là hai câu khác nhau mà một số 0 không phân biệt được. Trước 01/10 trường này luôn là số và bằng 0 cho mọi capability trừ POST_OPEN.',
  })
  used: number | null;

  @ApiPropertyOptional({ nullable: true, example: 8 })
  remaining: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'RANK_REQUIREMENT_NOT_MET' })
  reasonCode: string | null;
}

export class EntitlementsSummaryDto implements IEntitlementsSummaryDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({ example: 1 })
  policyRevisionId: number;

  @ApiProperty({ type: () => [EntitlementDto] })
  capabilities: IEntitlementDto[];
}

export class GetOwnEntitlementsResponseDto implements IGetOwnEntitlementsResponseDto {
  @ApiProperty({ type: () => EntitlementsSummaryDto })
  entitlements: IEntitlementsSummaryDto;
}
