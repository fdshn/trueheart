import {
  IEntitlementPolicyCapabilityPatch,
  IEntitlementPolicyRankPatch,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementPolicyCapabilityDto,
  IEntitlementPolicyHistoryEntryDto,
  IEntitlementPolicyRankValueDto,
  IEntitlementPolicyRevisionDto,
  IGetEntitlementPolicyHistoryResponseDto,
  IGetEntitlementPolicyResponseDto,
  IPublishEntitlementPolicyResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class EntitlementPolicyRankPatchDto implements IEntitlementPolicyRankPatch {
  @ApiProperty({ enum: UserRanks })
  @IsEnum(UserRanks)
  rank: UserRanks;

  @ApiPropertyOptional({
    description: 'Bỏ trống là giữ nguyên giá trị đang có.',
  })
  @IsOptional()
  @IsBoolean()
  allowed?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 10,
    description:
      'Số lượng tối đa. Gửi null là bỏ giới hạn; gửi 0 là cấm hẳn. Bỏ trống là giữ nguyên.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number | null;
}

export class EntitlementPolicyCapabilityPatchDto implements IEntitlementPolicyCapabilityPatch {
  @ApiProperty({ example: 'POST_SOS' })
  @IsString()
  @Length(1, 100)
  code: string;

  @ApiPropertyOptional({
    description: 'Tắt ở đây là tắt cho mọi rank. Bỏ trống là giữ nguyên.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: () => [EntitlementPolicyRankPatchDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntitlementPolicyRankPatchDto)
  ranks?: EntitlementPolicyRankPatchDto[];
}

export class PublishEntitlementPolicyBodyDto {
  @ApiProperty({
    example: 'Hạ quota Gold xuống 10 theo yêu cầu Bên A ngày 20/09',
    description: 'Bắt buộc — đây là thứ người đọc audit log sẽ thấy.',
  })
  @IsString()
  @Length(1, 500)
  changeReason: string;

  @ApiProperty({ type: () => [EntitlementPolicyCapabilityPatchDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => EntitlementPolicyCapabilityPatchDto)
  capabilities: EntitlementPolicyCapabilityPatchDto[];
}

export class EntitlementPolicyRankValueDto implements IEntitlementPolicyRankValueDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty()
  allowed: boolean;

  @ApiProperty({ nullable: true, example: 10 })
  limit: number | null;
}

export class EntitlementPolicyCapabilityDto implements IEntitlementPolicyCapabilityDto {
  @ApiProperty({ example: 'POST_SOS' })
  code: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: () => [EntitlementPolicyRankValueDto] })
  ranks: EntitlementPolicyRankValueDto[];
}

export class EntitlementPolicyRevisionDto implements IEntitlementPolicyRevisionDto {
  @ApiProperty({ example: 4 })
  revisionId: number;

  @ApiProperty()
  effectiveFrom: Date;

  @ApiProperty({ nullable: true })
  changeReason: string | null;

  @ApiProperty({ type: () => [EntitlementPolicyCapabilityDto] })
  capabilities: EntitlementPolicyCapabilityDto[];
}

export class GetEntitlementPolicyResponseDto implements IGetEntitlementPolicyResponseDto {
  @ApiProperty({ type: () => EntitlementPolicyRevisionDto })
  policy: EntitlementPolicyRevisionDto;
}

export class PublishEntitlementPolicyResponseDto implements IPublishEntitlementPolicyResponseDto {
  @ApiProperty({ type: () => EntitlementPolicyRevisionDto })
  policy: EntitlementPolicyRevisionDto;
}

export class EntitlementPolicyHistoryEntryDto implements IEntitlementPolicyHistoryEntryDto {
  @ApiProperty({ example: 2 })
  revisionId: number;

  @ApiProperty({
    example: 'PUBLISHED',
    description:
      'PUBLISHED là bản đang hiệu lực; ARCHIVED là bản đã bị đóng lại.',
  })
  status: string;

  @ApiProperty()
  effectiveFrom: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'null là bản đang hiệu lực.',
  })
  effectiveTo: Date | null;

  @ApiPropertyOptional({ nullable: true })
  changeReason: string | null;

  @ApiProperty({
    example: 9,
    description: 'Số capability có trong bản đó — để thấy bản nào thêm mã mới.',
  })
  capabilityCount: number;
}

export class GetEntitlementPolicyHistoryResponseDto implements IGetEntitlementPolicyHistoryResponseDto {
  @ApiProperty({ type: () => [EntitlementPolicyHistoryEntryDto] })
  revisions: IEntitlementPolicyHistoryEntryDto[];
}

export class GetEntitlementPolicyHistoryQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
