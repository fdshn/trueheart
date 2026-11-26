import {
  CharityMoneyPledgeStatus,
  CharityMoneyPledgeStatuses,
  MaxCharityMoneyPledgeAmount,
  MaxCharityMoneyPledgeHiddenReasonLength,
  MaxCharityMoneyPledgeNoteLength,
  MinCharityMoneyPledgeAmount,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PublicUserProfileDto } from './charity-campaign.dto';

/**
 * Đăng ký ủng hộ tiền cho chiến dịch từ thiện (CR 25/11/2026). Lời khai, hệ thống KHÔNG xác minh;
 * tổng lời khai là số riêng, không cộng vào số thực nhận do ban tổ chức nhập.
 */

// ── Tham số ─────────────────────────────────────────────────────────────

export class CharityMoneyPledgeParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() pledgeId: string;
}

export class CharityMoneyPledgeListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Lọc theo khoản tiền' })
  @IsOptional()
  @IsUUID()
  fundingNeedId?: string;

  @ApiPropertyOptional({ enum: CharityMoneyPledgeStatuses })
  @IsOptional()
  @IsIn(CharityMoneyPledgeStatuses)
  status?: CharityMoneyPledgeStatus;

  @ApiPropertyOptional({ description: 'Lấy từ `nextCursor` của trang trước.' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class MyCharityMoneyPledgesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Lọc theo chiến dịch' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Lấy từ `nextCursor` của trang trước.' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

// ── Body ────────────────────────────────────────────────────────────────

export class DeclareCharityMoneyPledgeDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Khoản tiền (nhu cầu `OPEN`) muốn ủng hộ; bỏ trống = ủng hộ chung',
  })
  @IsOptional()
  @IsUUID()
  fundingNeedId?: string | null;

  @ApiProperty({
    minimum: MinCharityMoneyPledgeAmount,
    maximum: MaxCharityMoneyPledgeAmount,
    description: 'VNĐ, số nguyên',
    example: 500_000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MinCharityMoneyPledgeAmount)
  @Max(MaxCharityMoneyPledgeAmount)
  pledgedAmount: number;

  @ApiPropertyOptional({
    maxLength: MaxCharityMoneyPledgeNoteLength,
    nullable: true,
    description: 'Chỉ ban tổ chức thấy',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MaxCharityMoneyPledgeNoteLength)
  note?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Hiện tên trong danh sách công khai. Bỏ trống = theo cài đặt "hiện tên trong danh sách ủng hộ" của tài khoản',
  })
  @IsOptional()
  @IsBoolean()
  showNamePublicly?: boolean | null;
}

export class DeclareCharityMoneyPledgeBodyDto {
  @ApiProperty({ type: () => DeclareCharityMoneyPledgeDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeclareCharityMoneyPledgeDto)
  pledge: DeclareCharityMoneyPledgeDto;
}

export class HideCharityMoneyPledgeDto {
  @ApiPropertyOptional({
    maxLength: MaxCharityMoneyPledgeHiddenReasonLength,
    nullable: true,
    description: 'Gửi kèm thông báo cho người khai',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MaxCharityMoneyPledgeHiddenReasonLength)
  reason?: string | null;
}

/** Body tuỳ chọn: `{}` hoặc `{ hide: { reason } }`. */
export class HideCharityMoneyPledgeBodyDto {
  @ApiPropertyOptional({ type: () => HideCharityMoneyPledgeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HideCharityMoneyPledgeDto)
  hide?: HideCharityMoneyPledgeDto;
}

// ── Response ────────────────────────────────────────────────────────────

export class CharityMoneyPledgeTransferDto {
  @ApiProperty({
    description:
      'Tài khoản nhận lúc khai đã đóng: `vietQrUrl = null`, app không mời chuyển vào tài khoản này (khai lại để nhận tài khoản mới)',
  })
  accountClosed: boolean;
  @ApiProperty() bankName: string;
  @ApiProperty({ type: String, nullable: true, example: '970436' })
  bankBin: string | null;
  @ApiProperty() accountNo: string;
  @ApiProperty() accountName: string;
  @ApiProperty({ description: 'VNĐ' }) amount: number;
  @ApiProperty({
    example: 'CT 7K2QXA',
    description: 'Nội dung chuyển khoản — để ban tổ chức dò sao kê',
  })
  transferContent: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '`null` khi tài khoản nhận chưa khai BIN ngân hàng',
  })
  vietQrUrl: string | null;
}

export class CharityMoneyPledgeCampaignDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
}

export class CharityPublicMoneyPledgeDto {
  @ApiProperty({ format: 'uuid' }) pledgeId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fundingNeedId: string | null;
  @ApiProperty({
    type: () => PublicUserProfileDto,
    nullable: true,
    description: '`null` = "Ẩn danh"',
  })
  user: PublicUserProfileDto | null;
  @ApiProperty({ description: 'VNĐ' }) pledgedAmount: number;
  @ApiProperty({
    enum: CharityMoneyPledgeStatuses,
    description:
      '`INTENDED` dự định chuyển · `COMPLETED` người ủng hộ báo đã chuyển — đều là LỜI KHAI',
  })
  status: string;
  @ApiProperty({ type: String, format: 'date-time' }) declaredAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
}

export class CharityManagedMoneyPledgeAccountDto {
  @ApiProperty({ format: 'uuid' }) accountId: string;
  @ApiProperty() bankName: string;
  @ApiProperty() accountNo: string;
  @ApiProperty() accountName: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '`null` = tài khoản còn hiệu lực',
  })
  validTo: Date | null;
}

export class CharityManagedMoneyPledgeDto extends CharityPublicMoneyPledgeDto {
  @ApiProperty({
    type: () => PublicUserProfileDto,
    nullable: true,
    description:
      'Ban tổ chức luôn thấy người khai; `null` khi tài khoản đã xoá',
  })
  declare user: PublicUserProfileDto | null;
  @ApiProperty() showNamePublicly: boolean;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() transferContent: string;
  @ApiProperty({
    type: () => CharityManagedMoneyPledgeAccountDto,
    nullable: true,
    description: 'Tài khoản nhận lúc khai',
  })
  bankAccount: CharityManagedMoneyPledgeAccountDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  hiddenAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) hiddenReason: string | null;
}

export class CharityMyMoneyPledgeDto {
  @ApiProperty({ format: 'uuid' }) pledgeId: string;
  @ApiProperty({ type: () => CharityMoneyPledgeCampaignDto })
  campaign: CharityMoneyPledgeCampaignDto;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fundingNeedId: string | null;
  @ApiProperty({ description: 'VNĐ' }) pledgedAmount: number;
  @ApiProperty({ enum: CharityMoneyPledgeStatuses }) status: string;
  @ApiProperty() showNamePublicly: boolean;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) declaredAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Chủ dự án đã ẩn lời khai này (không công khai, không tính tổng, không cộng điểm)',
  })
  hiddenAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) hiddenReason: string | null;
  @ApiProperty({
    type: () => CharityMoneyPledgeTransferDto,
    nullable: true,
    description: 'Mở lại màn chuyển khoản; `null` khi tài khoản nhận đã bị xoá',
  })
  transfer: CharityMoneyPledgeTransferDto | null;
}

export class DeclareCharityMoneyPledgeResponseDto {
  @ApiProperty({ type: () => CharityMyMoneyPledgeDto })
  pledge: CharityMyMoneyPledgeDto;
  @ApiProperty({ type: () => CharityMoneyPledgeTransferDto })
  transfer: CharityMoneyPledgeTransferDto;
}

export class CharityMyMoneyPledgeResponseDto {
  @ApiProperty({ type: () => CharityMyMoneyPledgeDto })
  pledge: CharityMyMoneyPledgeDto;
}

export class CharityManagedMoneyPledgeResponseDto {
  @ApiProperty({ type: () => CharityManagedMoneyPledgeDto })
  pledge: CharityManagedMoneyPledgeDto;
}

export class CharityPublicMoneyPledgesResponseDto {
  @ApiProperty({ type: () => [CharityPublicMoneyPledgeDto] })
  pledges: CharityPublicMoneyPledgeDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}

export class CharityManagedMoneyPledgesResponseDto {
  @ApiProperty({ type: () => [CharityManagedMoneyPledgeDto] })
  pledges: CharityManagedMoneyPledgeDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}

export class CharityMyMoneyPledgesResponseDto {
  @ApiProperty({ type: () => [CharityMyMoneyPledgeDto] })
  pledges: CharityMyMoneyPledgeDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
