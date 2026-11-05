import {
  CharityDisputeParties,
  CharityDisputeReasons,
  CharityDisputeStatuses,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Tranh chấp đóng góp — đợt 5c, chốt 05/11 (CHARITY-PROJECT-LIFECYCLE §3.18). */

export class CharityContributionIdParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
}
export class CharityDisputeParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() disputeId: string;
}
export class CharityDisputesQueryDto {
  @ApiPropertyOptional({ enum: CharityDisputeStatuses })
  @IsOptional()
  @IsIn(CharityDisputeStatuses)
  status?: (typeof CharityDisputeStatuses)[number];
}

export class CharityDisputeInputDto {
  @ApiProperty({ enum: CharityDisputeReasons })
  @IsIn(CharityDisputeReasons)
  reason: (typeof CharityDisputeReasons)[number];

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: 'https://',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  evidenceUrls?: string[];
}
export class CharityDisputeBodyDto {
  @ApiProperty({ type: () => CharityDisputeInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityDisputeInputDto)
  dispute: CharityDisputeInputDto;
}

export class CharityDisputeDecisionDto {
  @ApiProperty({
    enum: ['RESOLVE', 'WITHDRAW'],
    description:
      '`RESOLVE`: bên kia của người mở (người đóng góp ↔ ban tổ chức) hoặc Admin `report.resolve`, bắt buộc `resolution`. `WITHDRAW`: chỉ người mở.',
  })
  @IsIn(['RESOLVE', 'WITHDRAW'])
  action: 'RESOLVE' | 'WITHDRAW';

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}
export class CharityDisputeDecisionBodyDto {
  @ApiProperty({ type: () => CharityDisputeDecisionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityDisputeDecisionDto)
  decision: CharityDisputeDecisionDto;
}

export class CharityDisputeDto {
  @ApiProperty({ format: 'uuid' }) disputeId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ format: 'uuid' }) contributionId: string;
  @ApiProperty({ format: 'uuid' }) contributorId: string;
  @ApiProperty({ format: 'uuid' }) openedBy: string;
  @ApiProperty({ enum: CharityDisputeParties }) openedByParty: string;
  @ApiProperty({ enum: CharityDisputeReasons }) reason: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ enum: CharityDisputeStatuses }) status: string;
  @ApiProperty({ type: String, nullable: true }) resolution: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  closedBy: string | null;
  @ApiProperty({ type: Date, nullable: true }) closedAt: Date | null;
  @ApiProperty() createdAt: Date;
}
export class CharityDisputeResponseDto {
  @ApiProperty({ type: () => CharityDisputeDto }) dispute: CharityDisputeDto;
}
export class CharityDisputesResponseDto {
  @ApiProperty({ type: () => [CharityDisputeDto] })
  disputes: CharityDisputeDto[];
}
