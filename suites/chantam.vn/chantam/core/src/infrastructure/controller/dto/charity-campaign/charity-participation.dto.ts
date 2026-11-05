import {
  CharityParticipationDecisions,
  CharityParticipationStatuses,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CharityUserBriefDto } from './charity-event.dto';

/** Vòng đời participant — đợt 5a, chốt 05/11 (CHARITY-PROJECT-LIFECYCLE §3.11). */

export class CharityParticipationParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() participationId: string;
}

export class CharityParticipationsQueryDto {
  @ApiPropertyOptional({ enum: CharityParticipationStatuses })
  @IsOptional()
  @IsIn(CharityParticipationStatuses)
  status?: (typeof CharityParticipationStatuses)[number];
}

export class CharityParticipationDecisionDto {
  @ApiProperty({
    enum: CharityParticipationDecisions,
    description:
      '`CONFIRM` (từ chờ duyệt / danh sách chờ / đã từ chối), `WAITLIST`, `REJECT` (bắt buộc `reason`), `NO_SHOW` (đã xác nhận mà không đến — bắt buộc `reason`), `COMPLETE` (đã check-in).',
  })
  @IsIn(CharityParticipationDecisions)
  action: (typeof CharityParticipationDecisions)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class CharityParticipationDecisionBodyDto {
  @ApiProperty({ type: () => CharityParticipationDecisionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityParticipationDecisionDto)
  decision: CharityParticipationDecisionDto;
}

class CharityParticipationPositionDto {
  @ApiProperty({ format: 'uuid' }) volunteerNeedId: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: ['REGISTERED', 'CONFIRMED'] }) status: string;
}

export class CharityParticipationDto {
  @ApiProperty({ format: 'uuid' }) participationId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ type: () => CharityUserBriefDto }) user: CharityUserBriefDto;
  @ApiProperty({
    enum: CharityParticipationStatuses,
    description:
      '`REGISTERED` = đã đăng ký, chờ ban tổ chức duyệt. Chỉ `CHECKED_IN`/`COMPLETED` được đăng ảnh/clip sự kiện và được chấm mức hoàn thành.',
  })
  status: string;
  @ApiProperty() registeredAt: Date;
  @ApiProperty({ type: Date, nullable: true }) statusChangedAt: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  statusChangedBy: string | null;
  @ApiProperty({ type: String, nullable: true }) statusReason: string | null;
  @ApiProperty({ type: Date, nullable: true }) checkedInAt: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  checkedInBy: string | null;
  @ApiProperty({ type: Date, nullable: true }) cancelledAt: Date | null;
  @ApiProperty({
    type: () => [CharityParticipationPositionDto],
    description: 'Vị trí tuyển người đang nhận (§3.11)',
  })
  positions: CharityParticipationPositionDto[];
}
export class CharityParticipationResponseDto {
  @ApiProperty({ type: () => CharityParticipationDto })
  participation: CharityParticipationDto;
}
export class CharityMyParticipationResponseDto {
  @ApiProperty({ type: () => CharityParticipationDto, nullable: true })
  participation: CharityParticipationDto | null;
}
export class CharityParticipationsResponseDto {
  @ApiProperty({ type: () => [CharityParticipationDto] })
  participations: CharityParticipationDto[];
}
