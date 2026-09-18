import {
  IGetOwnReferralResponseDto,
  IReferralSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

export class ReferralSummaryDto implements IReferralSummaryDto {
  @ApiProperty({ example: 'AB12CD34EF' })
  code: string;

  @ApiProperty({ example: 4 })
  totalCount: number;

  @ApiProperty({ example: 2 })
  qualifiedCount: number;

  @ApiProperty({ example: 2 })
  rewardedCount: number;
}

export class GetOwnReferralResponseDto implements IGetOwnReferralResponseDto {
  @ApiProperty({ type: () => ReferralSummaryDto })
  referral: IReferralSummaryDto;
}
