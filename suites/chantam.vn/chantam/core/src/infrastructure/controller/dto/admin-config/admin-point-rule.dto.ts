import {
  IAdminPointRuleDto,
  IGetAdminPointRulesResponseDto,
  IPublishAdminPointRuleBodyDto,
  IPublishAdminPointRuleDto,
  IPublishAdminPointRuleResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class PublishAdminPointRuleDto implements IPublishAdminPointRuleDto {
  @ApiProperty({ example: 'REFERRAL_QUALIFIED' })
  @IsString()
  @Length(1, 100)
  code: string;

  @ApiProperty({ example: 56 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  points: number;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsBoolean()
  affectsLifetime: boolean;

  @ApiProperty({ nullable: true, example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyCap: number | null;

  @ApiProperty({ example: 'Điều chỉnh thưởng referral quý IV' })
  @IsString()
  @Length(1, 500)
  changeReason: string;
}

export class PublishAdminPointRuleBodyDto implements IPublishAdminPointRuleBodyDto {
  @ApiProperty({ type: () => PublishAdminPointRuleDto })
  @ValidateNested()
  @Type(() => PublishAdminPointRuleDto)
  pointRule: PublishAdminPointRuleDto;
}

export class AdminPointRuleDto implements IAdminPointRuleDto {
  @ApiProperty()
  code: string;
  @ApiProperty()
  points: number;
  @ApiProperty()
  enabled: boolean;
  @ApiProperty()
  affectsLifetime: boolean;
  @ApiProperty({ nullable: true })
  dailyCap: number | null;
  @ApiProperty()
  version: number;
  @ApiProperty()
  updatedAt: Date;
}

export class GetAdminPointRulesResponseDto implements IGetAdminPointRulesResponseDto {
  @ApiProperty({ type: () => [AdminPointRuleDto] })
  pointRules: AdminPointRuleDto[];
}

export class PublishAdminPointRuleResponseDto implements IPublishAdminPointRuleResponseDto {
  @ApiProperty({ type: () => AdminPointRuleDto })
  pointRule: AdminPointRuleDto;
}
