import {
  IGetOwnPointLedgerQueryDto,
  IGetOwnPointLedgerResponseDto,
  IGetOwnPointSummaryResponseDto,
  IPointLedgerEntryDto,
  IPointSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';

export class GetOwnPointLedgerQueryDto
  extends Mixin(PaginationQueryDto)
  implements IGetOwnPointLedgerQueryDto {}

export class PointSummaryDto implements IPointSummaryDto {
  @ApiProperty({ example: 84 })
  balance: number;

  @ApiProperty({ example: 140 })
  lifetime: number;
}

export class GetOwnPointSummaryResponseDto implements IGetOwnPointSummaryResponseDto {
  @ApiProperty({ type: () => PointSummaryDto })
  point: IPointSummaryDto;
}

export class PointLedgerEntryDto implements IPointLedgerEntryDto {
  @ApiProperty({ example: 15 })
  entryId: number;

  @ApiProperty({ example: 'PHONE_VERIFIED_FIRST_TIME' })
  ruleCode: string;

  @ApiProperty({ example: 1 })
  ruleVersion: number;

  @ApiProperty({ example: 28 })
  delta: number;

  @ApiProperty({ example: 84 })
  balanceAfter: number;

  @ApiProperty({ example: 140 })
  lifetimeAfter: number;

  @ApiProperty({ example: 'PROFILE' })
  source: string;

  @ApiPropertyOptional({ nullable: true, example: 'Xác minh SĐT lần đầu' })
  reason: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class GetOwnPointLedgerResponseDto implements IGetOwnPointLedgerResponseDto {
  @ApiProperty({ type: () => [PointLedgerEntryDto] })
  entries: IPointLedgerEntryDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
