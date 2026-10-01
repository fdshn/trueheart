import { IListReferralReviewResult } from '@/application/contracts/referral';
import {
  IReferralFingerprintSignals,
  IReferralReviewCandidate,
} from '@/domain/ports/repository';
import { PaginationQueryDto } from '@chantam/service.common-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { ReferralFingerprintSignalsDto } from '../admin-config/admin-user.dto';

export class ListReferralReviewQueryDto extends Mixin(PaginationQueryDto) {}

export class ReferralReviewCandidateDto implements IReferralReviewCandidate {
  @ApiProperty({ format: 'uuid' }) referrerUserId: string;
  @ApiProperty() username: string;
  @ApiProperty({ example: 7 }) qualifiedReferrals: number;
  @ApiProperty({ type: () => ReferralFingerprintSignalsDto })
  signals: IReferralFingerprintSignals;
}

export class ReferralReviewThresholdDto {
  @ApiProperty({
    example: false,
    description:
      'false khi cả hai vế ngưỡng đều 0, tức CHƯA BẬT. Khi đó danh sách rỗng, và cái rỗng đó nghĩa là chưa bật — không phải "không có ai đáng xem".',
  })
  enabled: boolean;

  @ApiProperty({ example: 5 })
  minQualifiedReferrals: number;

  @ApiProperty({ example: 0 })
  minDeviceClusters: number;

  @ApiProperty({ example: 0 })
  minClusterSize: number;
}

export class ListReferralReviewResponseDto implements IListReferralReviewResult {
  @ApiProperty({ type: () => [ReferralReviewCandidateDto] })
  candidates: IReferralReviewCandidate[];

  @ApiProperty({ example: 0 })
  total: number;

  @ApiProperty({ type: () => ReferralReviewThresholdDto })
  threshold: ReferralReviewThresholdDto;
}
