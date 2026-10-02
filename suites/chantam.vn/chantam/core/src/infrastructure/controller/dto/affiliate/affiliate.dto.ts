import {
  AffiliateDistributionModes,
  AffiliateEventTypes,
  AffiliateGeoStatuses,
  AffiliateLocationSources,
  AffiliateRewardStatuses,
  MaxAffiliateBeneficiariesPerEvent,
  MaxAffiliateDailyCap,
  MaxAffiliateEventPoints,
} from '@chantam.vn/chantam.core-lib/models';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class AffiliateEventPointsDto {
  @ApiProperty({ example: 2, minimum: 0, maximum: MaxAffiliateEventPoints })
  @IsInt()
  @Min(0)
  @Max(MaxAffiliateEventPoints)
  POST_CREATED: number;

  @ApiProperty({ example: 10, minimum: 0, maximum: MaxAffiliateEventPoints })
  @IsInt()
  @Min(0)
  @Max(MaxAffiliateEventPoints)
  GIFT_COMPLETED: number;
}

export class PublishAffiliatePolicyDto {
  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description: 'Version đang xem. Lệch thì bị TỪ CHỐI, không ghi đè.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number | null;

  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    enum: AffiliateDistributionModes,
    description:
      '**Câu A1 — quyết định kinh tế lớn nhất của phân hệ.** `SPLIT_POOL`: điểm của ' +
      'sự kiện là MỘT GIỎ chia đều, tổng không đổi theo quy mô nhóm. `PER_MEMBER`: ' +
      'mỗi Active Member nhận ĐỦ số đó, nên nhóm 500 người sinh gấp 500 lần nhóm 1 ' +
      'người cho cùng một hành động.',
  })
  @IsIn(AffiliateDistributionModes)
  distributionMode: (typeof AffiliateDistributionModes)[number];

  @ApiProperty({ type: () => AffiliateEventPointsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AffiliateEventPointsDto)
  eventPoints: AffiliateEventPointsDto;

  @ApiProperty({
    example: 50,
    minimum: 0,
    maximum: MaxAffiliateDailyCap,
    description:
      'Câu A4. BẮT BUỘC lớn hơn 0 khi `enabled` — không trần thì một nhóm lớn sinh ' +
      'điểm không giới hạn, và đó là lỗ farm điểm rẻ nhất của cả hệ.',
  })
  @IsInt()
  @Min(0)
  @Max(MaxAffiliateDailyCap)
  dailyCapPerBeneficiary: number;

  @ApiProperty({
    example: 200,
    minimum: 0,
    maximum: MaxAffiliateBeneficiariesPerEvent,
    description:
      'Trần số người nhận cho MỘT sự kiện. Cũng bắt buộc khi bật: một nhóm 5.000 ' +
      'người mà mỗi hành động ghi 5.000 dòng thì bảng reward phình nhanh nhất hệ.',
  })
  @IsInt()
  @Min(0)
  @Max(MaxAffiliateBeneficiariesPerEvent)
  maxBeneficiariesPerEvent: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveAt?: Date;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class PublishAffiliatePolicyBodyDto {
  @ApiProperty({ type: () => PublishAffiliatePolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishAffiliatePolicyDto)
  affiliatePolicy: PublishAffiliatePolicyDto;
}

export class AffiliatePolicyDto {
  @ApiProperty({ example: 2 }) version: number;
  @ApiProperty({ example: false }) enabled: boolean;
  @ApiProperty({ enum: AffiliateDistributionModes }) distributionMode: string;
  @ApiProperty({ type: () => AffiliateEventPointsDto })
  eventPoints: AffiliateEventPointsDto;
  @ApiProperty({ example: 50 }) dailyCapPerBeneficiary: number;
  @ApiProperty({ example: 200 }) maxBeneficiariesPerEvent: number;
  @ApiProperty({ type: String, format: 'date-time' }) effectiveAt: Date;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid', nullable: true }) createdBy: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class GetAffiliatePolicyResponseDto {
  @ApiProperty({
    type: () => AffiliatePolicyDto,
    nullable: true,
    description:
      '`null` khi chưa Admin nào publish — khi đó tính năng coi như TẮT.',
  })
  active: AffiliatePolicyDto | null;

  @ApiProperty({ type: () => [AffiliatePolicyDto] })
  history: AffiliatePolicyDto[];
}

export class PublishAffiliatePolicyResponseDto {
  @ApiProperty({ type: () => AffiliatePolicyDto })
  policy: AffiliatePolicyDto;
}

export class ListAffiliateEventsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    enum: AffiliateGeoStatuses,
    description:
      'Lọc theo kết luận geo. Dùng `NOT_ELIGIBLE_GEO` để xem đúng những sự kiện bị ' +
      'loại — đây là câu hỏi Owner hay mang tới nhất.',
  })
  @IsOptional()
  @IsIn(AffiliateGeoStatuses)
  geoStatus?: (typeof AffiliateGeoStatuses)[number];
}

export class AffiliateEventDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ format: 'uuid' }) groupId: string;
  @ApiProperty({ format: 'uuid' }) sourceUserId: string;
  @ApiProperty({ enum: AffiliateEventTypes }) eventType: string;
  @ApiProperty({ example: 'GIFT_TRANSACTION' }) referenceType: string;
  @ApiProperty() referenceId: string;

  @ApiProperty({ enum: AffiliateGeoStatuses })
  geoStatus: string;

  @ApiProperty({
    enum: AffiliateLocationSources,
    description:
      'Toạ độ nào đã được dùng để xét (F58). Trả cả NGUỒN chứ không chỉ khoảng cách: ' +
      '"cách tâm 7km" chưa trả lời được, vì 7km đo từ vị trí bài đăng và từ Vị trí ' +
      'mặc định của thành viên là hai chuyện khác nhau.',
  })
  locationSource: string;

  @ApiProperty({ example: 2400, nullable: true }) distanceMeters: number | null;
  @ApiProperty({ example: 10000, nullable: true }) radiusMeters: number | null;
  @ApiProperty({ example: 12 }) beneficiaryCount: number;
  @ApiProperty({ example: 10 }) totalPoints: number;
  @ApiProperty({ example: 2 }) policyVersion: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ListAffiliateEventsResponseDto {
  @ApiProperty({ type: () => [AffiliateEventDto] })
  events: AffiliateEventDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: unknown;
}

export class AffiliateRewardDto {
  @ApiProperty({ format: 'uuid' }) beneficiaryUserId: string;
  @ApiProperty({ enum: AffiliateRewardStatuses }) rewardStatus: string;

  @ApiProperty({
    example: 3,
    description:
      'Số điểm của dòng này. `REVERSED` GIỮ số gốc — nó trả lời "đã thu hồi bao ' +
      'nhiêu", và ép về 0 là xoá đúng thông tin cần nhất lúc đối soát.',
  })
  pointDelta: number;

  @ApiProperty({ example: 93, nullable: true }) pointLedgerId: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reversedAt: Date | null;
}

export class GetAffiliateEventRewardsResponseDto {
  @ApiProperty({ type: () => [AffiliateRewardDto] })
  rewards: AffiliateRewardDto[];
}

export class ReverseAffiliateEventDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReverseAffiliateEventBodyDto {
  @ApiProperty({ type: () => ReverseAffiliateEventDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReverseAffiliateEventDto)
  reversal: ReverseAffiliateEventDto;
}

export class ReverseAffiliateEventResponseDto {
  @ApiProperty({ example: 12 }) reversedCount: number;
  @ApiProperty({ example: 10 }) pointsReclaimed: number;
}
