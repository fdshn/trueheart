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
  @ApiProperty({
    example: 84,
    description: 'Số điểm TIÊU ĐƯỢC. Kẹp ở 0, không bao giờ âm.',
  })
  balance: number;

  @ApiProperty({
    example: -30,
    description:
      'Giá trị THẬT sau mọi lần cộng/trừ, có thể âm. Bằng balance trong trường hợp bình thường; chỉ khác khi có khoản phạt lớn hơn số dư lúc đó.',
  })
  rawBalance: number;

  @ApiProperty({ example: 140 })
  lifetime: number;

  @ApiProperty({ example: 5, description: 'Số lần được cộng điểm.' })
  creditCount: number;

  @ApiProperty({ example: 1, description: 'Số lần bị trừ điểm.' })
  debitCount: number;
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

  @ApiProperty({
    example: 0,
    description: 'Số tiêu được ngay sau bút toán này. Kẹp ở 0.',
  })
  balanceAfter: number;

  @ApiProperty({
    example: -30,
    description:
      'Giá trị thật ngay sau bút toán này, có thể âm. Đọc cùng `delta` để dựng một dòng như "trừ 50 điểm, đang âm 30".',
  })
  rawBalanceAfter: number;

  @ApiProperty({
    example: '-50 điểm, đang âm 30 điểm',
    description:
      'Câu mô tả dựng sẵn ở máy chủ cho cột log điểm, để web và app không diễn đạt khác nhau.',
  })
  note: string;

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
