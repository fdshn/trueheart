import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminRankTierPolicyDto,
  IAdminRankTierPolicyInputDto,
  IGetAdminRankPolicyResponseDto,
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
