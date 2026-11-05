import {
  CharityBeneficiaryKinds,
  CharityCallToActions,
  CharityCustomFieldTypes,
  CharityDeliveryMethods,
  CharityFieldVisibilities,
  CharityItemConditions,
  CharityOpenClosed,
  CharityOperationStages,
  CharityPartyRoles,
  CharityPhaseKeys,
  CharityReportModes,
  CharitySectionCompletionStatuses,
  CharitySupplySources,
  CharityTeamRoles,
  CharityVolunteerNeedStatuses,
  CharityVolunteerRegistrationStatuses,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CharityCampaignResponseDto } from './charity-campaign.dto';
import {
  CharityChangedFieldDto,
  CharityCountersDto,
  CharityTaskViewDto,
} from './charity-engagement.dto';
import { CharityEventStepViewDto } from './charity-event.dto';
import {
  CharityFinancialReportViewDto,
  CharityPublicSupportersDto,
  CharitySummaryViewDto,
} from './charity-summary.dto';

const OptionalText = (max: number) => [
  IsOptional(),
  IsString(),
  MaxLength(max),
];
function Text(max: number): PropertyDecorator {
  return (target, key) => {
    for (const decorator of OptionalText(max)) decorator(target, key);
  };
}

// ── Params ────────────────────────────────────────────────────────────────

export class CharityProjectParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
}
export class CharityProjectIdOrSlugParamsDto {
  @ApiProperty({ description: 'Id hoặc slug của dự án' })
  @IsString()
  @Length(1, 200)
  idOrSlug: string;
}
export class CharityProjectAccountParamsDto extends CharityProjectParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() accountId: string;
}
export class CharityProjectNeedItemParamsDto extends CharityProjectParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() needItemId: string;
}
export class CharityProjectFundingParamsDto extends CharityProjectParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() fundingNeedId: string;
}
export class CharityProjectVolunteerParamsDto extends CharityProjectParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() volunteerNeedId: string;
}
export class CharityProjectVolunteerUserParamsDto extends CharityProjectVolunteerParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId: string;
}
export class CharityProjectSectionParamsDto extends CharityProjectParamsDto {
  @ApiProperty({ enum: CharityOperationStages })
  @IsIn(CharityOperationStages)
  sectionKey: (typeof CharityOperationStages)[number];
}

// ── Giai đoạn ────────────────────────────────────────────────────────────

export class CharityStageMoveDto {
  @ApiProperty({ enum: ['EXECUTION', 'EVENT', 'SUMMARY'] })
  @IsIn(['EXECUTION', 'EVENT', 'SUMMARY'])
  to: 'EXECUTION' | 'EVENT' | 'SUMMARY';

  @ApiPropertyOptional({
    maxLength: 500,
    description:
      'Bắt buộc với mọi lần chuyển tay — sớm hơn lịch hay lùi (chốt 05/11, §3.2); người bị ảnh hưởng nhận thông báo kèm lý do.',
  })
  @Text(500)
  reason?: string;
}
export class CharityStageMoveBodyDto {
  @ApiProperty({ type: () => CharityStageMoveDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityStageMoveDto)
  stage: CharityStageMoveDto;
}

// ── Hồ sơ ────────────────────────────────────────────────────────────────

export class CharityProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Text(5000)
  appealPurpose?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Text(5000)
  appealAudience?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Text(5000)
  appealCircumstance?: string | null;
  @ApiPropertyOptional({ enum: CharityCallToActions, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CharityCallToActions, { each: true })
  callToActions?: (typeof CharityCallToActions)[number][];
}
export class CharityProfileBodyDto {
  @ApiProperty({ type: () => CharityProfileDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityProfileDto)
  profile: CharityProfileDto;
}
export class CharityProfileViewDto {
  @ApiProperty({ type: String, nullable: true }) appealPurpose: string | null;
  @ApiProperty({ type: String, nullable: true }) appealAudience: string | null;
  @ApiProperty({ type: String, nullable: true }) appealCircumstance:
    string | null;
  @ApiProperty({ enum: CharityCallToActions, isArray: true })
  callToActions: string[];
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Ghi đè của Admin; `null` = theo cấu hình chung',
  })
  maxBankAccounts: number | null;
}

// ── Đơn vị liên quan ─────────────────────────────────────────────────────

export class CharityPartyDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Có = cập nhật đúng dòng đó',
  })
  @IsOptional()
  @IsUUID()
  partyId?: string;
  @ApiProperty({ enum: CharityPartyRoles })
  @IsIn(CharityPartyRoles)
  role: (typeof CharityPartyRoles)[number];
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) name: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) address?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) hotline?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) picName?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) picPhone?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  picUserId?: string;
  @ApiPropertyOptional({
    enum: CharityBeneficiaryKinds,
    description: 'Bắt buộc với BENEFICIARY',
  })
  @IsOptional()
  @IsIn(CharityBeneficiaryKinds)
  beneficiaryKind?: (typeof CharityBeneficiaryKinds)[number];
  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: 'Giấy phép/xác nhận (URL https)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  evidenceUrls?: string[];
}
export class CharityPartiesBodyDto {
  @ApiProperty({ type: () => [CharityPartyDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CharityPartyDto)
  parties: CharityPartyDto[];
}
export class CharityPartyViewDto {
  @ApiProperty({ format: 'uuid' }) partyId: string;
  @ApiProperty({ enum: CharityPartyRoles }) role: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) address: string | null;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) hotline: string | null;
  @ApiProperty({ type: String, nullable: true }) picName: string | null;
  @ApiProperty({ type: String, nullable: true }) picPhone: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) picUserId:
    string | null;
  @ApiProperty({ type: String, nullable: true, enum: CharityBeneficiaryKinds })
  beneficiaryKind: string | null;
  @ApiProperty({
    description:
      'Người thụ hưởng của kêu gọi cá nhân — quản lý qua PUT :id/beneficiary, RIÊNG TƯ',
  })
  isAppealSubject: boolean;
  @ApiProperty({ type: [String] }) evidenceUrls: string[];
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

// ── Tài khoản ngân hàng ──────────────────────────────────────────────────

export class CharityBankAccountDto {
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) label?: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) bankName: string;
  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Matches(/^[0-9A-Za-z-]{4,40}$/)
  accountNo: string;
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  accountName: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Đổi tài khoản: đóng tài khoản này trong cùng lượt',
  })
  @IsOptional()
  @IsUUID()
  replacesAccountId?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) replaceReason?: string;
}
export class CharityBankAccountBodyDto {
  @ApiProperty({ type: () => CharityBankAccountDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityBankAccountDto)
  bankAccount: CharityBankAccountDto;
}
export class CharityCloseDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason: string;
}
export class CharityCloseBodyDto {
  @ApiProperty({ type: () => CharityCloseDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityCloseDto)
  close: CharityCloseDto;
}
export class CharityBankAccountViewDto {
  @ApiProperty({ format: 'uuid' }) accountId: string;
  @ApiProperty({ type: String, nullable: true }) label: string | null;
  @ApiProperty() bankName: string;
  @ApiProperty() accountNo: string;
  @ApiProperty() accountName: string;
  @ApiProperty({ type: String, format: 'date-time' }) validFrom: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '`null` = đang hiệu lực',
  })
  validTo: Date | null;
  @ApiProperty({ type: String, nullable: true }) closeReason: string | null;
}

// ── Ban tổ chức ──────────────────────────────────────────────────────────

export class CharityTeamMemberDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  memberId?: string;
  @ApiProperty({ enum: CharityTeamRoles })
  @IsIn(CharityTeamRoles)
  role: (typeof CharityTeamRoles)[number];
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  displayName: string;
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) address?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) position?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tài khoản Chân Tâm của người này',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
}
export class CharityTeamBodyDto {
  @ApiProperty({ type: () => [CharityTeamMemberDto], maxItems: 60 })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => CharityTeamMemberDto)
  team: CharityTeamMemberDto[];
}
export class CharityTeamMemberViewDto {
  @ApiProperty({ format: 'uuid' }) memberId: string;
  @ApiProperty({ enum: CharityTeamRoles }) role: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ type: String, nullable: true }) address: string | null;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) position: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) userId:
    string | null;
  @ApiProperty({ type: String, nullable: true }) username: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) bankAccountId:
    string | null;
}

// ── Tiến độ 4 bước ───────────────────────────────────────────────────────

export class CharityPhaseDto {
  @ApiProperty({ enum: CharityPhaseKeys })
  @IsIn(CharityPhaseKeys)
  phase: (typeof CharityPhaseKeys)[number];
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endsAt: Date;
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) picName?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  picUserId?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) hotline?: string;
  @ApiPropertyOptional({
    enum: CharityDeliveryMethods,
    description: 'Chỉ DISTRIBUTION',
  })
  @IsOptional()
  @IsIn(CharityDeliveryMethods)
  deliveryMethod?: (typeof CharityDeliveryMethods)[number];
  @ApiPropertyOptional({
    enum: CharityReportModes,
    description: 'Chỉ REPORTING',
  })
  @IsOptional()
  @IsIn(CharityReportModes)
  reportMode?: (typeof CharityReportModes)[number];
}
export class CharityPhasesBodyDto {
  @ApiProperty({ type: () => [CharityPhaseDto], maxItems: 4 })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CharityPhaseDto)
  phases: CharityPhaseDto[];
}
export class CharityPhaseViewDto {
  @ApiProperty({ enum: CharityPhaseKeys }) phase: string;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endsAt: Date;
  @ApiProperty({ type: String, nullable: true }) picName: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) picUserId:
    string | null;
  @ApiProperty({ type: String, nullable: true }) hotline: string | null;
  @ApiProperty({ type: String, nullable: true, enum: CharityDeliveryMethods })
  deliveryMethod: string | null;
  @ApiProperty({ type: String, nullable: true, enum: CharityReportModes })
  reportMode: string | null;
}

// ── Hiện vật ─────────────────────────────────────────────────────────────

export class CharityItemNeedProfileDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Đơn giá VNĐ',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  unitPrice?: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Giá trị ước tính VNĐ khi không có đơn giá',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  estimatedValue?: number | null;
  @ApiPropertyOptional({ enum: CharityItemConditions })
  @IsOptional()
  @IsIn(CharityItemConditions)
  itemCondition?: (typeof CharityItemConditions)[number];
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) conditionNote?: string;
  @ApiPropertyOptional({ enum: CharitySupplySources })
  @IsOptional()
  @IsIn(CharitySupplySources)
  supplySource?: (typeof CharitySupplySources)[number];
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  intakeDeadline?: Date;
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) dropoffAddress?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @Text(1000)
  deliveryInstruction?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) receiverName?: string;
  @ApiPropertyOptional({ maxLength: 30 }) @Text(30) receiverPhone?: string;
  @ApiPropertyOptional({
    enum: CharityOpenClosed,
    default: 'OPEN',
    description: 'CLOSED = ngừng tiếp nhận dòng này',
  })
  @IsOptional()
  @IsIn(CharityOpenClosed)
  intakeStatus?: (typeof CharityOpenClosed)[number];

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Mục tiêu mới. Thấp hơn số đã nhận thì bắt buộc `surplusExplanation` (công khai, ghi lịch sử — §3.18). Bỏ trống giữ nguyên.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetQuantity?: number;

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description:
      'Giải trình công khai phần dư / đổi mục đích sử dụng phần dư. Bỏ trống giữ nguyên, `null` xoá.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  surplusExplanation?: string | null;
}
export class CharityItemNeedBodyDto {
  @ApiProperty({ type: () => CharityItemNeedProfileDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityItemNeedProfileDto)
  itemNeed: CharityItemNeedProfileDto;
}
export class CharityItemNeedViewDto {
  @ApiProperty({ format: 'uuid' }) needItemId: string;
  @ApiProperty() itemName: string;
  @ApiProperty() unit: string;
  @ApiProperty() targetQuantity: number;
  @ApiProperty({ description: 'Đang chờ ban tổ chức quyết' })
  registeredQuantity: number;
  @ApiProperty() approvedQuantity: number;
  @ApiProperty() receivedInAppQuantity: number;
  @ApiProperty() receivedExternalQuantity: number;
  @ApiProperty() remainingQuantity: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: Number, nullable: true }) unitPrice: number | null;
  @ApiProperty({ type: Number, nullable: true }) estimatedValue: number | null;
  @ApiProperty({ type: String, nullable: true, enum: CharityItemConditions })
  itemCondition: string | null;
  @ApiProperty({ type: String, nullable: true }) conditionNote: string | null;
  @ApiProperty({ type: String, nullable: true, enum: CharitySupplySources })
  supplySource: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  intakeDeadline: Date | null;
  @ApiProperty({ type: String, nullable: true }) dropoffAddress: string | null;
  @ApiProperty({ type: String, nullable: true }) deliveryInstruction:
    string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '`null` trên bản công khai',
  })
  receiverName: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '`null` trên bản công khai',
  })
  receiverPhone: string | null;
  @ApiProperty({ enum: CharityOpenClosed }) intakeStatus: string;
  @ApiProperty({ type: String, nullable: true }) surplusExplanation:
    string | null;
}

// ── Tiền ────────────────────────────────────────────────────────────────

export class CharityFundingNeedDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) title: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @Text(2000) description?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bên thụ hưởng (party BENEFICIARY) của dự án',
  })
  @IsOptional()
  @IsUUID()
  beneficiaryPartyId?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @Text(200) receivingUnit?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tài khoản nhận ĐANG hiệu lực của dự án',
  })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
  @ApiProperty({ description: 'Mục tiêu VNĐ' })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  targetAmount: number;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
  @ApiPropertyOptional({
    description: 'Số ban tổ chức đã xác nhận nhận được (chỉ khi sửa)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  confirmedAmount?: number;
  @ApiPropertyOptional({ description: 'Số nhận từ nguồn ngoài (chỉ khi sửa)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  externalAmount?: number;
  @ApiPropertyOptional({ enum: CharityOpenClosed })
  @IsOptional()
  @IsIn(CharityOpenClosed)
  status?: (typeof CharityOpenClosed)[number];
}
export class CharityFundingNeedBodyDto {
  @ApiProperty({ type: () => CharityFundingNeedDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityFundingNeedDto)
  fundingNeed: CharityFundingNeedDto;
}
export class CharityFundingNeedViewDto {
  @ApiProperty({ format: 'uuid' }) fundingNeedId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  beneficiaryPartyId: string | null;
  @ApiProperty({ type: String, nullable: true }) receivingUnit: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) bankAccountId:
    string | null;
  @ApiProperty() targetAmount: number;
  @ApiProperty() confirmedAmount: number;
  @ApiProperty() externalAmount: number;
  @ApiProperty() remainingAmount: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deadline: Date | null;
  @ApiProperty({ enum: CharityOpenClosed }) status: string;
  @ApiProperty() sortOrder: number;
}

// ── Nhân lực ─────────────────────────────────────────────────────────────

export class CharityVolunteerNeedDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) title: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @Text(2000) description?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @Text(2000) requirements?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100_000) neededCount: number;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) locationLabel?: string;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
  @ApiPropertyOptional({
    enum: CharityVolunteerNeedStatuses,
    description: 'Chỉ khi sửa',
  })
  @IsOptional()
  @IsIn(CharityVolunteerNeedStatuses)
  status?: (typeof CharityVolunteerNeedStatuses)[number];
}
export class CharityVolunteerNeedBodyDto {
  @ApiProperty({ type: () => CharityVolunteerNeedDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityVolunteerNeedDto)
  volunteerNeed: CharityVolunteerNeedDto;
}
export class CharityVolunteerNeedViewDto {
  @ApiProperty({ format: 'uuid' }) volunteerNeedId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String, nullable: true }) requirements: string | null;
  @ApiProperty() neededCount: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endsAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) locationLabel: string | null;
  @ApiProperty({ enum: CharityVolunteerNeedStatuses }) status: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() registeredCount: number;
  @ApiProperty() confirmedCount: number;
  @ApiProperty() remainingCount: number;
}
export class CharityVolunteerRegistrationDto {
  @ApiPropertyOptional({ maxLength: 500 }) @Text(500) note?: string;
}
export class CharityVolunteerRegistrationBodyDto {
  @ApiPropertyOptional({ type: () => CharityVolunteerRegistrationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharityVolunteerRegistrationDto)
  registration?: CharityVolunteerRegistrationDto;
}
export class CharityVolunteerRegistrationViewDto {
  @ApiProperty({ format: 'uuid' }) volunteerNeedId: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() username: string;
  @ApiProperty({ enum: CharityVolunteerRegistrationStatuses }) status: string;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

// ── Mục + form mở ────────────────────────────────────────────────────────

export class CharityCustomFieldDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) label: string;
  @ApiProperty({ enum: CharityCustomFieldTypes })
  @IsIn(CharityCustomFieldTypes)
  fieldType: (typeof CharityCustomFieldTypes)[number];
  @ApiPropertyOptional({ enum: CharityFieldVisibilities, default: 'PUBLIC' })
  @IsOptional()
  @IsIn(CharityFieldVisibilities)
  visibility?: (typeof CharityFieldVisibilities)[number];
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
  @ApiPropertyOptional({
    type: [String],
    maxItems: 50,
    description: 'Lựa chọn cho SELECT',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];
  @ApiPropertyOptional({
    description: 'Giá trị theo kiểu: chuỗi, số, boolean, ngày ISO, URL',
  })
  @IsOptional()
  value?: unknown;
}
export class CharityCustomSectionDto {
  @ApiProperty({ enum: CharityOperationStages })
  @IsIn(CharityOperationStages)
  parentSection: (typeof CharityOperationStages)[number];
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) title: string;
  @ApiPropertyOptional({ enum: CharityFieldVisibilities, default: 'PUBLIC' })
  @IsOptional()
  @IsIn(CharityFieldVisibilities)
  visibility?: (typeof CharityFieldVisibilities)[number];
  @ApiProperty({ type: () => [CharityCustomFieldDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CharityCustomFieldDto)
  fields: CharityCustomFieldDto[];
}
export class CharityCustomSectionsBodyDto {
  @ApiProperty({ type: () => [CharityCustomSectionDto], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CharityCustomSectionDto)
  customSections: CharityCustomSectionDto[];
}
export class CharityCustomFieldViewDto {
  @ApiProperty({ format: 'uuid' }) customFieldId: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: CharityCustomFieldTypes }) fieldType: string;
  @ApiProperty({ enum: CharityFieldVisibilities }) visibility: string;
  @ApiProperty() required: boolean;
  @ApiProperty({ type: [String] }) options: string[];
  @ApiProperty({ nullable: true }) value: unknown;
}
export class CharityCustomSectionViewDto {
  @ApiProperty({ format: 'uuid' }) customSectionId: string;
  @ApiProperty({ enum: CharityOperationStages }) parentSection: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: CharityFieldVisibilities }) visibility: string;
  @ApiProperty({ type: () => [CharityCustomFieldViewDto] })
  fields: CharityCustomFieldViewDto[];
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}
export class CharitySectionViewDto {
  @ApiProperty({ enum: CharityOperationStages }) sectionKey: string;
  @ApiProperty({ example: 'Kế hoạch' }) label: string;
  @ApiProperty({ enum: CharitySectionCompletionStatuses })
  completionStatus: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  savedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) updatedBy:
    string | null;
}
export class CharityStageEventViewDto {
  @ApiProperty({ enum: CharityOperationStages }) fromStage: string;
  @ApiProperty({ enum: CharityOperationStages }) toStage: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '`null` = hệ thống',
  })
  actorId: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}
export class CharityWorkspaceCapabilitiesDto {
  @ApiProperty() canEdit: boolean;
  @ApiProperty() canSave: boolean;
  @ApiProperty() canPublish: boolean;
  @ApiProperty() canSubmit: boolean;
  @ApiProperty() canAdvanceStage: boolean;
  @ApiProperty() canManageVolunteers: boolean;
  @ApiProperty({ description: 'Cập nhật checklist tab B (dự án đã duyệt)' })
  canUpdateTasks: boolean;
  @ApiProperty() canViewStats: boolean;
  @ApiProperty() canExportPdf: boolean;
  @ApiProperty() canShare: boolean;
}

export class CharityWorkspaceDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;
  @ApiProperty({ type: () => CharityProfileViewDto })
  profile: CharityProfileViewDto;
  @ApiProperty() maxBankAccountsEffective: number;
  @ApiProperty({ type: () => [CharityPartyViewDto] })
  parties: CharityPartyViewDto[];
  @ApiProperty({ type: () => [CharityBankAccountViewDto] })
  bankAccounts: CharityBankAccountViewDto[];
  @ApiProperty({ type: () => [CharityTeamMemberViewDto] })
  team: CharityTeamMemberViewDto[];
  @ApiProperty({ type: () => [CharityPhaseViewDto] })
  phases: CharityPhaseViewDto[];
  @ApiProperty({ type: () => [CharityItemNeedViewDto] })
  itemNeeds: CharityItemNeedViewDto[];
  @ApiProperty({ type: () => [CharityFundingNeedViewDto] })
  fundingNeeds: CharityFundingNeedViewDto[];
  @ApiProperty({ type: () => [CharityVolunteerNeedViewDto] })
  volunteerNeeds: CharityVolunteerNeedViewDto[];
  @ApiProperty({ type: () => [CharityVolunteerRegistrationViewDto] })
  volunteerRegistrations: CharityVolunteerRegistrationViewDto[];
  @ApiProperty({ type: () => [CharityStageEventViewDto] })
  stageEvents: CharityStageEventViewDto[];
  @ApiProperty({ type: () => [CharitySectionViewDto] })
  sections: CharitySectionViewDto[];
  @ApiProperty({ type: () => [CharityCustomSectionViewDto] })
  customSections: CharityCustomSectionViewDto[];
  @ApiProperty({
    type: () => [CharityTaskViewDto],
    description: 'Checklist tab B — rỗng tới khi dự án được duyệt',
  })
  tasks: CharityTaskViewDto[];
  @ApiProperty({
    type: () => [CharityEventStepViewDto],
    description: 'Timeline tab C — rỗng tới khi dự án được duyệt',
  })
  eventSteps: CharityEventStepViewDto[];
  @ApiProperty({
    type: () => [CharityChangedFieldDto],
    description: 'Field đã sửa kể từ lúc duyệt (cả field riêng tư) — tô đỏ',
  })
  changedFields: CharityChangedFieldDto[];
  @ApiProperty({ type: () => CharityCountersDto })
  counters: CharityCountersDto;
  @ApiProperty({ type: () => CharityWorkspaceCapabilitiesDto })
  capabilities: CharityWorkspaceCapabilitiesDto;
}
export class CharityWorkspaceResponseDto {
  @ApiProperty({ type: () => CharityWorkspaceDto })
  workspace: CharityWorkspaceDto;
}

export class CharityPublicSectionDto {
  @ApiProperty({ enum: CharityOperationStages }) sectionKey: string;
  @ApiProperty() label: string;
  @ApiProperty({ description: '`false` = chưa cập nhật' }) published: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: Date | null;
  @ApiProperty({
    nullable: true,
    description: 'Bản chụp nội dung công khai lúc publish',
  })
  content: unknown;
}
export class CharityPublicCapabilitiesDto {
  @ApiProperty() canJoinVolunteer: boolean;
  @ApiProperty() canContribute: boolean;
  @ApiProperty() canReport: boolean;
  @ApiProperty({ description: 'Quan tâm được khi dự án còn chạy' })
  canFollow: boolean;
  @ApiProperty() canComment: boolean;
}
export class CharityPublicProjectDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;
  @ApiProperty({ type: String, nullable: true }) appealPurpose: string | null;
  @ApiProperty({ type: String, nullable: true }) appealAudience: string | null;
  @ApiProperty({ type: String, nullable: true }) appealCircumstance:
    string | null;
  @ApiProperty({ enum: CharityCallToActions, isArray: true })
  callToActions: string[];
  @ApiProperty({ type: () => [CharityPublicSectionDto] })
  sections: CharityPublicSectionDto[];
  @ApiProperty({
    type: () => [CharityBankAccountViewDto],
    description: 'Chỉ tài khoản ĐANG hiệu lực',
  })
  bankAccounts: CharityBankAccountViewDto[];
  @ApiProperty({ type: () => [CharityItemNeedViewDto] })
  itemNeeds: CharityItemNeedViewDto[];
  @ApiProperty({ type: () => [CharityFundingNeedViewDto] })
  fundingNeeds: CharityFundingNeedViewDto[];
  @ApiProperty({ type: () => [CharityVolunteerNeedViewDto] })
  volunteerNeeds: CharityVolunteerNeedViewDto[];
  @ApiProperty({
    type: () => [CharityVolunteerRegistrationViewDto],
    nullable: true,
    description: '`null` khi chưa đăng nhập',
  })
  myVolunteerRegistrations: CharityVolunteerRegistrationViewDto[] | null;
  @ApiProperty({
    type: () => [CharityChangedFieldDto],
    description: 'Field CÔNG KHAI đã sửa kể từ lúc duyệt — tô đỏ',
  })
  changedFields: CharityChangedFieldDto[];
  @ApiProperty({
    type: () => [CharityEventStepViewDto],
    description: 'Timeline SỐNG của sự kiện trao',
  })
  eventSteps: CharityEventStepViewDto[];
  @ApiProperty({
    type: () => CharitySummaryViewDto,
    nullable: true,
    description: 'Tổng kết ĐÃ công khai; `null` khi chưa',
  })
  summary: CharitySummaryViewDto | null;
  @ApiProperty({
    type: () => [CharityFinancialReportViewDto],
    description: 'Chỉ có khi tổng kết đã công khai',
  })
  financialReports: CharityFinancialReportViewDto[];
  @ApiProperty({ type: () => CharityPublicSupportersDto })
  supporters: CharityPublicSupportersDto;
  @ApiProperty({ type: () => CharityCountersDto })
  counters: CharityCountersDto;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: '`null` khi không gửi token',
  })
  isFollowing: boolean | null;
  @ApiProperty({ type: () => CharityPublicCapabilitiesDto })
  capabilities: CharityPublicCapabilitiesDto;
}
export class CharityPublicProjectResponseDto {
  @ApiProperty({ type: () => CharityPublicProjectDto })
  project: CharityPublicProjectDto;
}

// ── Admin ────────────────────────────────────────────────────────────────

export class CharityLimitsDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 20,
    description: '`null` = theo cấu hình chung',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxBankAccounts: number | null;
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason: string;
}
export class CharityLimitsBodyDto {
  @ApiProperty({ type: () => CharityLimitsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CharityLimitsDto)
  limits: CharityLimitsDto;
}

// ── Response bọc khoá ─────────────────────────────────────────────────────

export class CharityProfileResponseDto {
  @ApiProperty({ type: () => CharityProfileViewDto })
  profile: CharityProfileViewDto;
}

export class CharityPartiesResponseDto {
  @ApiProperty({ type: () => [CharityPartyViewDto] })
  parties: CharityPartyViewDto[];
}

export class CharityBankAccountResponseDto {
  @ApiProperty({ type: () => CharityBankAccountViewDto })
  bankAccount: CharityBankAccountViewDto;
}

export class CharityTeamResponseDto {
  @ApiProperty({ type: () => [CharityTeamMemberViewDto] })
  team: CharityTeamMemberViewDto[];
}

export class CharityPhasesResponseDto {
  @ApiProperty({ type: () => [CharityPhaseViewDto] })
  phases: CharityPhaseViewDto[];
}

export class CharityItemNeedResponseDto {
  @ApiProperty({ type: () => CharityItemNeedViewDto })
  itemNeed: CharityItemNeedViewDto;
}

export class CharityFundingNeedResponseDto {
  @ApiProperty({ type: () => CharityFundingNeedViewDto })
  fundingNeed: CharityFundingNeedViewDto;
}

export class CharityVolunteerNeedResponseDto {
  @ApiProperty({ type: () => CharityVolunteerNeedViewDto })
  volunteerNeed: CharityVolunteerNeedViewDto;
}

export class CharitySectionResponseDto {
  @ApiProperty({ type: () => CharitySectionViewDto })
  section: CharitySectionViewDto;
}

export class CharityCustomSectionsResponseDto {
  @ApiProperty({ type: () => [CharityCustomSectionViewDto] })
  customSections: CharityCustomSectionViewDto[];
}
