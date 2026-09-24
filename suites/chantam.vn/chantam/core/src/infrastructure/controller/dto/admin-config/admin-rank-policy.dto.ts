import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminMaintenanceTierInputDto,
  IAdminRankTierPolicyDto,
  IAdminRankTierPolicyInputDto,
  IGetAdminRankPolicyResponseDto,
  IPublishAdminMaintenancePolicyBodyDto,
  IPublishAdminMaintenancePolicyDto,
  IPublishAdminMaintenancePolicyResponseDto,
  IPublishAdminRankPolicyBodyDto,
  IPublishAdminRankPolicyDto,
  IPublishAdminRankPolicyResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class AdminRankTierPolicyInputDto implements IAdminRankTierPolicyInputDto {
  @ApiProperty({ enum: UserRanks })
  @IsEnum(UserRanks)
  rank: UserRanks;

  @ApiProperty({ example: 672 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  thresholdPoints: number;

  @ApiProperty({ example: 560 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warningPoints: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requiredGifts: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requiredReferrals: number;
}

export class PublishAdminRankPolicyDto implements IPublishAdminRankPolicyDto {
  @ApiProperty({ example: 'Điều chỉnh ngưỡng theo chính sách quý IV' })
  @IsString()
  @Length(1, 500)
  changeReason: string;

  @ApiProperty({ type: () => [AdminRankTierPolicyInputDto] })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AdminRankTierPolicyInputDto)
  tiers: AdminRankTierPolicyInputDto[];
}

export class PublishAdminRankPolicyBodyDto implements IPublishAdminRankPolicyBodyDto {
  @ApiProperty({ type: () => PublishAdminRankPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishAdminRankPolicyDto)
  rankPolicy: PublishAdminRankPolicyDto;
}

export class AdminRankTierPolicyDto implements IAdminRankTierPolicyDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty()
  thresholdPoints: number;

  @ApiProperty()
  warningPoints: number;

  @ApiProperty()
  requiredGifts: number;

  @ApiProperty()
  requiredReferrals: number;

  @ApiProperty()
  maintenanceGifts: number;

  @ApiProperty()
  maintenanceReferrals: number;

  @ApiProperty({ description: 'Điểm bị trừ khi trượt chu kỳ duy trì' })
  maintenancePenaltyPoints: number;

  @ApiProperty()
  version: number;
}

export class GetAdminRankPolicyResponseDto implements IGetAdminRankPolicyResponseDto {
  @ApiProperty({ type: () => [AdminRankTierPolicyDto] })
  rankPolicy: AdminRankTierPolicyDto[];
}

export class PublishAdminRankPolicyResponseDto
  extends GetAdminRankPolicyResponseDto
  implements IPublishAdminRankPolicyResponseDto {}

export class AdminMaintenanceTierInputDto implements IAdminMaintenanceTierInputDto {
  @ApiProperty({ enum: UserRanks })
  @IsEnum(UserRanks)
  rank: UserRanks;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maintenanceGifts: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maintenanceReferrals: number;

  @ApiProperty({
    example: 224,
    description:
      'Điểm bị trừ khi trượt chu kỳ. Rank do balance quyết nên nhiệm vụ tác động tới hạng gián tiếp qua điểm.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maintenancePenaltyPoints: number;
}

export class PublishAdminMaintenancePolicyDto implements IPublishAdminMaintenancePolicyDto {
  @ApiProperty({ example: 'Điều chỉnh chỉ tiêu duy trì quý IV' })
  @IsString()
  @Length(1, 500)
  changeReason: string;

  @ApiProperty({ type: () => [AdminMaintenanceTierInputDto] })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AdminMaintenanceTierInputDto)
  tiers: AdminMaintenanceTierInputDto[];
}

export class PublishAdminMaintenancePolicyBodyDto implements IPublishAdminMaintenancePolicyBodyDto {
  @ApiProperty({ type: () => PublishAdminMaintenancePolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishAdminMaintenancePolicyDto)
  maintenancePolicy: PublishAdminMaintenancePolicyDto;
}

export class PublishAdminMaintenancePolicyResponseDto
  extends GetAdminRankPolicyResponseDto
  implements IPublishAdminMaintenancePolicyResponseDto {}
