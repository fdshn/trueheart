import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementsSummaryDto,
  IGetOwnEntitlementsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EntitlementDto implements IEntitlementDto {
  @ApiProperty({ example: 'POST_OFFER' })
  code: string;

  @ApiProperty({ example: true })
  allowed: boolean;

  @ApiPropertyOptional({ nullable: true, example: 10 })
  limit: number | null;

  @ApiProperty({ example: 0 })
  used: number;

  @ApiPropertyOptional({ nullable: true, example: 10 })
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
