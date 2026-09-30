import {
  IGetOwnReferralResponseDto,
  IReferralInviteeDto,
  IReferralSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

export class ReferralInviteeDto implements IReferralInviteeDto {
  @ApiProperty({ example: 'nguyen-an' })
  username: string;

  @ApiProperty({ nullable: true, example: 'Nguyễn An' })
  fullName: string | null;

  @ApiProperty({
    enum: ['PENDING', 'QUALIFIED'],
    description:
      'PENDING là đã đăng ký bằng mã nhưng chưa hoàn tất onboarding — nhắc họ làm nốt thì lượt giới thiệu mới tính.',
  })
  status: 'PENDING' | 'QUALIFIED';

  @ApiProperty()
  invitedAt: Date;

  @ApiProperty({ nullable: true })
  qualifiedAt: Date | null;

  @ApiProperty({
    nullable: true,
    example: 56,
    description:
      'Số điểm lượt này đã mang lại. null khi chưa tính, hoặc khi đã chạm trần 3 lượt/ngày nên khoản thưởng bị hoãn sang lượt quét sau.',
  })
  awardedPoints: number | null;
}

export class ReferralSummaryDto implements IReferralSummaryDto {
  @ApiProperty({ example: 'AB12CD34EF' })
  code: string;

  @ApiProperty({ example: 4 })
  totalCount: number;

  @ApiProperty({ example: 2 })
  qualifiedCount: number;

  @ApiProperty({ example: 2 })
  rewardedCount: number;

  @ApiProperty({ type: () => [ReferralInviteeDto] })
  invitees: IReferralInviteeDto[];
}

export class GetOwnReferralResponseDto implements IGetOwnReferralResponseDto {
  @ApiProperty({ type: () => ReferralSummaryDto })
  referral: IReferralSummaryDto;
}
