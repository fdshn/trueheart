import {
  ICharityContributionItemInput,
  ICharityNeedItemInput,
} from '@/application/contracts/charity-campaign';
import { CharityCampaignPhases } from '@/domain/ports/repository';
import {
  CharityApprovalStatuses,
  CharityBeneficiaryRelations,
  CharityCampaignTypes,
  CharityContributionStatuses,
  CharityMediaTypes,
  CharityRejectionReasons,
  CharityReviewRatingMax,
  CharityReviewRatingMin,
  CharityReviewRoles,
  MaxCharityBadgeNameLength,
  MaxCharityDescriptionLength,
  MaxCharityMediaPerCampaign,
  MaxCharityReviewCommentLength,
  MaxCharitySlugLength,
  MaxCharityTargetItems,
  MaxCharityTitleLength,
  MaxContributionConditionNoteLength,
  MaxContributionContactNoteLength,
  MaxContributionItems,
  MaxContributionNoteLength,
  MaxNeedItemNameLength,
  MaxNeedItemQuantity,
  MaxNeedItemUnitLength,
  MaxNeedItemsPerCampaign,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsISO8601,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { NotNullWhenPresent } from '../not-null-when-present';

export class CharityBeneficiaryInputDto {
  @ApiProperty({ maxLength: 200, example: 'Nguyễn Thị B' })
  @IsString()
  @Length(1, 200)
  fullName: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Hàng xóm, sống một mình',
    description: 'Quan hệ CỤ THỂ với người kêu gọi.',
  })
  @IsString()
  @Length(1, 200)
  relationNote: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;

  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED'],
    description:
      '`CONFIRMED` khi người thụ hưởng đã đồng ý cho kêu gọi công khai. Chưa `CONFIRMED` thì hoạt động KHÔNG được public — kể cả khi bạn có quyền public ngay. Chuyển về `PENDING` lúc đang public thì hoạt động tự ẩn.',
  })
  @IsIn(['PENDING', 'CONFIRMED'])
  consentStatus: 'PENDING' | 'CONFIRMED';

  @ApiPropertyOptional({
    maxLength: 1000,
    description:
      'Ghi chú xác minh — ví dụ đã gặp trực tiếp, có xác nhận của địa phương.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  verificationNote?: string;
}

export class CharityBeneficiaryDto {
  @ApiProperty() fullName: string;
  @ApiProperty() relationNote: string;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ type: String, nullable: true }) address: string | null;
  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] }) consentStatus: string;
  @ApiProperty({ type: String, nullable: true }) verificationNote:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class CharityBeneficiaryResponseDto {
  @ApiProperty({
    type: () => CharityBeneficiaryDto,
    nullable: true,
    description:
      'RIÊNG TƯ — chỉ người tổ chức và Admin có `campaign.manage` đọc được.',
  })
  beneficiary: CharityBeneficiaryDto | null;

  @ApiProperty({
    description:
      '`true` khi lượt ghi vừa ẨN hoạt động vì đồng ý không còn `CONFIRMED`.',
  })
  hidden: boolean;
}

export class WriteCharityCampaignDto {
  @ApiProperty({
    example: 'Bếp cơm Vu Lan 2026',
    maxLength: MaxCharityTitleLength,
  })
  @IsString()
  @Length(3, MaxCharityTitleLength)
  title: string;

  @ApiPropertyOptional({
    example: 'bep-com-vu-lan-2026',
    maxLength: MaxCharitySlugLength,
    description:
      'Bỏ trống thì sinh từ tiêu đề. Gửi vào thì vẫn bị chuẩn hoá y hệt — không có hai ' +
      'cách viết cho một đường.',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxCharitySlugLength)
  slug?: string;

  @ApiProperty({ maxLength: MaxCharityDescriptionLength })
  @IsString()
  @Length(10, MaxCharityDescriptionLength)
  description: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MaxCharityMediaPerCampaign,
    example: ['users/<userId>/campaign-media/2f0c….webp'],
    description:
      'Key lấy từ `POST /charity-campaigns/media/upload` sau khi PUT lên R2 thành công. ' +
      `1–${MaxCharityMediaPerCampaign} ảnh/video, ít nhất một ảnh. Thứ tự trong mảng là thứ tự hiển thị. ` +
      'KHÔNG nhận URL.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxCharityMediaPerCampaign)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  media: string[];

  @ApiProperty({
    description:
      'Một key trong `media`, phải là ảnh. Server ghi `bannerUrl` từ ảnh này — client không gửi URL bìa.',
  })
  @IsString()
  @Length(1, 500)
  coverKey: string;

  @ApiProperty({
    example: 'Tấm lòng Vu Lan',
    maxLength: MaxCharityBadgeNameLength,
    description: 'Huy hiệu người tham gia nhận được (§6.2.13 `badge_name`).',
  })
  @IsString()
  @Length(1, MaxCharityBadgeNameLength)
  badgeName: string;

  @ApiPropertyOptional({
    example: 500,
    minimum: 0,
    maximum: MaxCharityTargetItems,
    default: 0,
    description:
      'Số phần quà mục tiêu. `0` nghĩa là KHÔNG đặt mục tiêu số lượng, và khi đó ' +
      '`progressPercent` trả `null` thay vì `0%`.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MaxCharityTargetItems)
  targetItemsCount?: number;

  @ApiPropertyOptional({
    example: 10.7797,
    description:
      'Vị trí để hiện trên Map Discovery (UI-CHARITY-01). Phải gửi CÙNG `lng`. Bỏ cả ' +
      'hai với hoạt động không gắn địa điểm — một toạ độ bịa trên bản đồ tệ hơn không ' +
      'có toạ độ nào.',
  })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    example: 106.699,
    description: 'Phải gửi CÙNG `lat`.',
  })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Chùa Vĩnh Nghiêm, Quận 3', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  locationLabel?: string;

  @ApiProperty({ example: '2026-08-20T01:00:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({
    example: '2026-08-20T09:00:00.000Z',
    description:
      'Phải sau `startTime` — `CHK_campaigns_time_order` canh ở database.',
  })
  @IsISO8601()
  endTime: string;

  @ApiProperty({
    enum: CharityCampaignTypes,
    description:
      'Loại hoạt động (F65b §1). `INDIVIDUAL_APPEAL` là kêu gọi cho một cá nhân/gia đình, `ORGANIZED_CAMPAIGN` là hoạt động có tổ chức. ' +
      'Quyết định capability nào gác lượt tạo — Thành viên trở lên mở được kêu gọi cá nhân, hoạt động có tổ chức thì chỉ Kim Cương. ' +
      'Dữ liệu trước 12/10 đều là `ORGANIZED_CAMPAIGN`.',
  })
  @IsIn(CharityCampaignTypes)
  campaignType: (typeof CharityCampaignTypes)[number];

  @ApiPropertyOptional({
    enum: CharityBeneficiaryRelations,
    description:
      'Quan hệ với người thụ hưởng. **Bắt buộc** khi `campaignType = INDIVIDUAL_APPEAL`, và phải **bỏ trống** với `ORGANIZED_CAMPAIGN` — database canh bằng một CHECK nối hai cột, nên gửi sai sẽ bị từ chối chứ không âm thầm bỏ qua. ' +
      'Với `OTHER`, địa chỉ/số điện thoại/tài liệu xác minh của người thụ hưởng luôn là dữ liệu riêng tư và không ra response công khai.',
  })
  @IsOptional()
  @IsIn(CharityBeneficiaryRelations)
  beneficiaryRelation?: (typeof CharityBeneficiaryRelations)[number];

  @ApiPropertyOptional({
    type: () => [CharityNeedItemInputDto],
    maxItems: MaxNeedItemsPerCampaign,
    description:
      'Bảng nhu cầu vật phẩm, ghi trong CÙNG transaction với hoạt động — hai lượt ghi rời sẽ để lại một kêu gọi công khai không nói cần gì. ' +
      'Bỏ trống là hợp lệ: hoạt động chỉ nhận đăng ký tham dự thì không có nhu cầu vật phẩm nào. ' +
      'Thứ tự hiển thị do SERVER đặt theo thứ tự trong mảng này.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxNeedItemsPerCampaign)
  @ValidateNested({ each: true })
  @Type(() => CharityNeedItemInputDto)
  needs?: CharityNeedItemInputDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Cho lượt chấp nhận đề nghị VƯỢT mục tiêu từng dòng (F65b §5). Mặc định `false`: vượt thì `409 CHARITY_NEED_EXCEEDED`. Đóng góp ngoài app thì không bao giờ bị chặn vượt, bất kể cờ này.',
  })
  @IsOptional()
  @IsBoolean()
  allowOverTarget?: boolean;

  @ApiPropertyOptional({
    type: () => CharityBeneficiaryInputDto,
    description:
      'Người thụ hưởng — CHỈ cho `INDIVIDUAL_APPEAL` + `beneficiaryRelation = OTHER`. Dữ liệu này RIÊNG TƯ và không ra response công khai nào. Thiếu, hoặc đồng ý chưa `CONFIRMED`, thì hoạt động vào chờ duyệt.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CharityBeneficiaryInputDto)
  beneficiary?: CharityBeneficiaryInputDto;
}

export class WriteCharityCampaignBodyDto {
  @ApiProperty({ type: () => WriteCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteCharityCampaignDto)
  campaign: WriteCharityCampaignDto;
}

const CharityMediaContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

export class RequestCharityMediaUploadDto {
  @ApiProperty({ enum: CharityMediaContentTypes, example: 'image/webp' })
  @IsIn(CharityMediaContentTypes)
  contentType: string;

  @ApiProperty({
    minimum: 1,
    example: 512_000,
    description:
      'Tối đa 5 MB cho ảnh, 25 MB cho video. Được ký vào URL — PUT lệch một byte là hỏng chữ ký.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentLength: number;
}

export class RequestCharityMediaUploadBodyDto {
  @ApiProperty({ type: () => RequestCharityMediaUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestCharityMediaUploadDto)
  upload: RequestCharityMediaUploadDto;
}

export class CharityMediaUploadDto {
  @ApiProperty() key: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty({ example: 300 }) expiresInSeconds: number;
  @ApiProperty() publicUrl: string;
}

export class RequestCharityMediaUploadResponseDto {
  @ApiProperty({ type: () => CharityMediaUploadDto })
  upload: CharityMediaUploadDto;
}

export class ReplaceCharityMediaDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MaxCharityMediaPerCampaign,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxCharityMediaPerCampaign)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  keys: string[];

  @ApiProperty({ description: 'Một key trong `keys`, phải là ảnh.' })
  @IsString()
  @Length(1, 500)
  coverKey: string;
}

export class ReplaceCharityMediaBodyDto {
  @ApiProperty({ type: () => ReplaceCharityMediaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReplaceCharityMediaDto)
  media: ReplaceCharityMediaDto;
}

export class CharityCampaignMediaDto {
  @ApiProperty() url: string;
  @ApiProperty({ enum: CharityMediaTypes }) type: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isCover: boolean;
}

export class ListCharityCampaignsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    enum: CharityCampaignPhases,
    description:
      '`UPCOMING` chưa bắt đầu · `ONGOING` đang diễn ra · `ENDED` đã kết thúc. Mốc so ' +
      'là `now()` của database, không phải giờ máy client.',
  })
  @IsOptional()
  @IsIn(CharityCampaignPhases as readonly string[])
  phase?: string;
}

export class ListAdminCharityCampaignsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: CharityApprovalStatuses })
  @IsOptional()
  @IsIn(CharityApprovalStatuses as readonly string[])
  approvalStatus?: string;
}

export class CharityCampaignIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class ReviewCharityCampaignDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Người được đánh giá. Người tổ chức chấm người tham gia, người tham gia chấm ' +
      'người tổ chức — và CHỈ hai chiều đó. Hai người tham gia không chấm nhau được.',
  })
  @IsUUID()
  revieweeId: string;

  @ApiProperty({
    minimum: CharityReviewRatingMin,
    maximum: CharityReviewRatingMax,
    example: 5,
  })
  @IsInt()
  @Min(CharityReviewRatingMin)
  @Max(CharityReviewRatingMax)
  rating: number;

  @ApiPropertyOptional({ maxLength: MaxCharityReviewCommentLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxCharityReviewCommentLength)
  comment?: string;
}

export class ReviewCharityCampaignBodyDto {
  @ApiProperty({ type: () => ReviewCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewCharityCampaignDto)
  review: ReviewCharityCampaignDto;
}

export class DecideCharityApprovalDto {
  @ApiProperty({
    description:
      '`true` duyệt · `false` từ chối. Cả hai đều ghi `approvedBy` và mốc thời gian.',
  })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({
    maxLength: 1_000,
    description:
      'Lý do, hiện cho người gửi hồ sơ. Từ chối mà không nói vì sao là buộc họ gửi lại ' +
      'đúng hồ sơ đó.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 1_000)
  note?: string;
}

export class DecideCharityApprovalBodyDto {
  @ApiProperty({ type: () => DecideCharityApprovalDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DecideCharityApprovalDto)
  approval: DecideCharityApprovalDto;
}

export class UpdateCharityProgressDto {
  @ApiProperty({
    minimum: 0,
    maximum: MaxCharityTargetItems,
    example: 480,
    description:
      'Số phần quà ĐÃ TRAO, theo lời khai của người tổ chức. BR-CHARITY-02: hệ thống ' +
      'không đối soát con số này với giao dịch nào.',
  })
  @IsInt()
  @Min(0)
  @Max(MaxCharityTargetItems)
  currentItemsCount: number;
}

export class UpdateCharityProgressBodyDto {
  @ApiProperty({ type: () => UpdateCharityProgressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateCharityProgressDto)
  progress: UpdateCharityProgressDto;
}

export class SetCharityCampaignActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class SetCharityCampaignActiveBodyDto {
  @ApiProperty({ type: () => SetCharityCampaignActiveDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetCharityCampaignActiveDto)
  campaign: SetCharityCampaignActiveDto;
}

export class DeleteCharityCampaignDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Hồ sơ tạo trùng',
    description: 'Bắt buộc — đi vào audit log.',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class DeleteCharityCampaignBodyDto {
  @ApiProperty({ type: () => DeleteCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeleteCharityCampaignDto)
  deletion: DeleteCharityCampaignDto;
}

export class DeleteCharityCampaignResponseDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
}

/**
 * Admin sửa nội dung. Bỏ trống một trường là GIỮ NGUYÊN. `null` chỉ hợp lệ ở
 * `locationLabel` và cặp `lat`/`lng` (xoá); ở các trường còn lại `null` → 400.
 */
export class UpdateAdminCharityCampaignDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: MaxCharityTitleLength })
  @NotNullWhenPresent()
  @IsString()
  @MaxLength(MaxCharityTitleLength)
  title?: string;

  @ApiPropertyOptional({
    minLength: 10,
    maxLength: MaxCharityDescriptionLength,
  })
  @NotNullWhenPresent()
  @IsString()
  @MaxLength(MaxCharityDescriptionLength)
  description?: string;

  @ApiPropertyOptional({ maxLength: MaxCharityBadgeNameLength })
  @NotNullWhenPresent()
  @IsString()
  @MaxLength(MaxCharityBadgeNameLength)
  badgeName?: string;

  @ApiPropertyOptional({ minimum: 0, description: '`0` = không đặt mục tiêu.' })
  @NotNullWhenPresent()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  targetItemsCount?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Gửi CÙNG `lng`. Cả hai `null` là xoá vị trí.',
  })
  @IsOptional()
  @IsLatitude()
  lat?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsLongitude()
  lng?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationLabel?: string | null;

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Sửa lỗi chính tả tiêu đề',
    description: 'Bắt buộc — đi vào audit log.',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class UpdateAdminCharityCampaignBodyDto {
  @ApiProperty({ type: () => UpdateAdminCharityCampaignDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateAdminCharityCampaignDto)
  campaign: UpdateAdminCharityCampaignDto;
}

export class CharityCampaignResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
  @ApiProperty() description: string;
  @ApiProperty({
    description: 'URL ảnh bìa — do server ghi từ media được chọn làm bìa.',
  })
  bannerUrl: string;
  @ApiProperty() badgeName: string;

  @ApiProperty({ description: '`0` nghĩa là không đặt mục tiêu số lượng.' })
  targetItemsCount: number;

  @ApiProperty({
    description:
      'LỜI KHAI của người tổ chức, không phải số đo. BR-CHARITY-02: hệ thống không đối ' +
      'soát với `gift_transactions` hay bất cứ bảng giao dịch nào, và không có hook nào ' +
      'tự tăng nó.',
  })
  currentItemsCount: number;

  @ApiProperty({
    nullable: true,
    description:
      '`null` khi `targetItemsCount = 0` — hiện "0%" cho hoạt động như vậy là nói sai.',
  })
  progressPercent: number | null;

  @ApiProperty({ nullable: true }) lat: number | null;
  @ApiProperty({ nullable: true }) lng: number | null;
  @ApiProperty({ nullable: true }) locationLabel: string | null;
  @ApiProperty() startTime: Date;
  @ApiProperty() endTime: Date;
  @ApiProperty() isActive: boolean;

  @ApiProperty({ enum: CharityApprovalStatuses })
  approvalStatus: string;

  @ApiProperty({ nullable: true }) approvalNote: string | null;
  @ApiProperty({ nullable: true }) approvedAt: Date | null;
  @ApiProperty({ nullable: true }) approvedBy: string | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  @ApiProperty({
    description: 'Số người đang đăng ký — đếm lúc đọc, không phải cột lưu sẵn.',
  })
  participantCount: number;

  @ApiProperty({
    type: () => [CharityCampaignMediaDto],
    description:
      'Ảnh/video theo thứ tự hiển thị. Rỗng với hoạt động tạo trước khi có media — khi đó chỉ có `bannerUrl`.',
  })
  media: CharityCampaignMediaDto[];

  @ApiProperty({ enum: CharityCampaignTypes })
  campaignType: (typeof CharityCampaignTypes)[number];

  @ApiProperty({
    enum: CharityBeneficiaryRelations,
    nullable: true,
    description:
      'Chỉ `INDIVIDUAL_APPEAL` có; `ORGANIZED_CAMPAIGN` luôn `null`. Thông tin người thụ hưởng KHÔNG nằm ở đây.',
  })
  beneficiaryRelation: (typeof CharityBeneficiaryRelations)[number] | null;

  @ApiProperty({
    description:
      'Chấp nhận đề nghị vượt mục tiêu từng dòng nhu cầu. Mặc định `false`.',
  })
  allowOverTarget: boolean;

  @ApiProperty({
    nullable: true,
    description:
      '`null` trên đường công khai (không có ai để hỏi), `true`/`false` trên các đường ' +
      'cần token. `null` KHÔNG đồng nghĩa `false`.',
  })
  isJoined: boolean | null;
}

export class CharityReviewResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() campaignId: string;
  @ApiProperty() reviewerId: string;
  @ApiProperty() revieweeId: string;

  @ApiProperty({ enum: CharityReviewRoles })
  reviewerRole: string;

  @ApiProperty() rating: number;
  @ApiProperty({ nullable: true }) comment: string | null;
  @ApiProperty() createdAt: Date;
}

export class CharityCampaignDetailResponseDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;

  @ApiProperty({ type: () => [CharityReviewResponseDto] })
  reviews: CharityReviewResponseDto[];

  @ApiProperty() reviewTotal: number;
}

export class ListCharityCampaignsResponseDto {
  @ApiProperty({ type: () => [CharityCampaignResponseDto] })
  items: CharityCampaignResponseDto[];

  @ApiProperty() total: number;
}

export class CharityCampaignWrapperResponseDto {
  @ApiProperty({ type: () => CharityCampaignResponseDto })
  campaign: CharityCampaignResponseDto;
}

export class CharityReviewWrapperResponseDto {
  @ApiProperty({ type: () => CharityReviewResponseDto })
  review: CharityReviewResponseDto;
}

export class CharityNeedItemInputDto implements ICharityNeedItemInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Danh mục của vật phẩm. Bỏ trống được — danh mục bị xoá sau này cũng không làm mất dòng nhu cầu, nó chỉ về `null`.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    maxLength: MaxNeedItemNameLength,
    example: 'Gạo tẻ',
    description:
      'Tên vật phẩm cần. Trùng tên VÀ đơn vị trên cùng chiến dịch bị từ chối.',
  })
  @IsString()
  @Length(1, MaxNeedItemNameLength)
  itemName: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @ApiProperty({
    maxLength: MaxNeedItemUnitLength,
    example: 'kg',
    description:
      'Đơn vị của DÒNG NÀY. Backend không bao giờ cộng số lượng giữa hai đơn vị khác nhau — tiến độ chung là trung bình TỶ LỆ, không phải tổng số lượng.',
  })
  @IsString()
  @Length(1, MaxNeedItemUnitLength)
  unit: string;

  @ApiProperty({
    minimum: 1,
    maximum: MaxNeedItemQuantity,
    example: 100,
    description: 'Số lượng cần. Phải lớn hơn 0 — database cũng chặn.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxNeedItemQuantity)
  targetQuantity: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Cho phép vật phẩm tương đương thay cho đúng món đã khai.',
  })
  @IsOptional()
  @IsBoolean()
  allowAlternative?: boolean;
}

export class CharityNeedItemDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  categoryId: string | null;
  @ApiProperty() itemName: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ example: 'kg' }) unit: string;
  @ApiProperty({ example: 100 }) targetQuantity: number;
  @ApiProperty() allowAlternative: boolean;

  @ApiProperty({
    example: 30,
    description:
      'Đã được chấp nhận nhưng lượt giao nhận chưa xong. Projection do HỆ THỐNG ghi; không endpoint nào nhận con số này từ client.',
  })
  acceptedQuantity: number;

  @ApiProperty({
    example: 20,
    description:
      'Thực nhận, từ lượt giao nhận đã hoàn tất cộng đóng góp ngoài app còn hiệu lực.',
  })
  receivedQuantity: number;

  @ApiProperty({
    example: 50,
    description:
      'Còn thiếu = max(0, target - accepted - received). Đề nghị CHƯA được chấp nhận **không** trừ vào đây: giữ chỗ theo đề nghị thì một loạt đề nghị không thực hiện sẽ làm chiến dịch trông như đã đủ và chặn người tặng thật.',
  })
  remainingQuantity: number;

  @ApiProperty() sortOrder: number;

  @ApiProperty({
    description:
      '`false` khi người tổ chức đã rút dòng này. Vẫn trả về vì nó là lịch sử của những đề nghị đã gửi, nhưng KHÔNG vào phép tính `overallProgressPercent`.',
  })
  isActive: boolean;
}

export class CampaignNeedsResponseDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;

  @ApiProperty({ type: () => [CharityNeedItemDto] })
  needs: CharityNeedItemDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 75,
    description:
      'Chỉ số TRÌNH BÀY: trung bình tỷ lệ hoàn thành của các dòng đang bật, mỗi tỷ lệ kẹp ở 100%. KHÔNG phải số lượng và không phải nguồn sự thật — nguồn sự thật là từng dòng. `null` khi chiến dịch chưa khai dòng nhu cầu nào, khác `0` nghĩa là "chưa nhận được gì".',
  })
  overallProgressPercent: number | null;

  @ApiProperty({
    enum: ['LEGACY_DECLARED', 'NEED_ITEMS'],
    description:
      'Tiến độ đang đọc từ đâu. `NEED_ITEMS` là từ bảng nhu cầu; `LEGACY_DECLARED` là chiến dịch chưa khai nhu cầu nào và chỉ còn hai cột tổng hợp cũ — vốn là LỜI KHAI của người tổ chức, hệ thống không đối soát. Client đọc cờ này chứ đừng đoán theo việc `needs` rỗng hay không.',
  })
  progressSource: 'LEGACY_DECLARED' | 'NEED_ITEMS';
}

export class CharityContributionItemInputDto implements ICharityContributionItemInput {
  @ApiProperty({
    format: 'uuid',
    description:
      'Dòng nhu cầu muốn tặng. Phải thuộc đúng hoạt động này và còn đang bật — gửi id của hoạt động khác thì `400 CHARITY_NEED_ITEM_INVALID`.',
  })
  @IsUUID()
  needItemId: string;

  @ApiProperty({
    minimum: 1,
    maximum: MaxNeedItemQuantity,
    example: 50,
    description:
      'Số lượng bạn đề nghị tặng, theo ĐƠN VỊ của dòng nhu cầu đó. Đề nghị KHÔNG giữ chỗ: nó không trừ vào phần còn thiếu cho tới khi người tổ chức chấp nhận.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxNeedItemQuantity)
  offeredQuantity: number;

  @ApiPropertyOptional({
    maxLength: MaxContributionConditionNoteLength,
    description: 'Tình trạng vật phẩm, ví dụ "mới", "đã dùng còn tốt".',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxContributionConditionNoteLength)
  conditionNote?: string;
}

export class SubmitCharityContributionBodyDto {
  @ApiProperty({
    type: () => [CharityContributionItemInputDto],
    maxItems: MaxContributionItems,
    description: 'Một hoặc nhiều dòng; mỗi dòng nhu cầu chỉ xuất hiện MỘT lần.',
  })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxContributionItems)
  @ValidateNested({ each: true })
  @Type(() => CharityContributionItemInputDto)
  items: CharityContributionItemInputDto[];

  @ApiPropertyOptional({ maxLength: MaxContributionNoteLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxContributionNoteLength)
  note?: string;

  @ApiPropertyOptional({
    maxLength: MaxContributionContactNoteLength,
    description:
      'Cách liên lạc cho lượt giao nhận. CHỈ người tổ chức của hoạt động và chính bạn đọc được — không ra response công khai.',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxContributionContactNoteLength)
  contactNote?: string;
}

export class UpdateCharityContributionBodyDto {
  @ApiProperty({
    enum: ['REPLACE', 'WITHDRAW'],
    description:
      '`REPLACE` thay TRỌN bộ dòng (bỏ một dòng khỏi mảng là xoá dòng đó); `WITHDRAW` rút đề nghị và bỏ qua mọi trường nội dung. Cả hai chỉ làm được khi chưa có phần nào được chấp nhận.',
  })
  @IsIn(['REPLACE', 'WITHDRAW'])
  action: 'REPLACE' | 'WITHDRAW';

  @ApiPropertyOptional({
    type: () => [CharityContributionItemInputDto],
    maxItems: MaxContributionItems,
    description: 'Bắt buộc khi `action = REPLACE`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxContributionItems)
  @ValidateNested({ each: true })
  @Type(() => CharityContributionItemInputDto)
  items?: CharityContributionItemInputDto[];

  @ApiPropertyOptional({ maxLength: MaxContributionNoteLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxContributionNoteLength)
  note?: string;

  @ApiPropertyOptional({ maxLength: MaxContributionContactNoteLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxContributionContactNoteLength)
  contactNote?: string;
}

export class CharityContributionItemDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ format: 'uuid' }) needItemId: string;
  @ApiProperty({ example: 'Gạo tẻ' }) itemName: string;
  @ApiProperty({ example: 'kg' }) unit: string;
  @ApiProperty({ example: 50 }) offeredQuantity: number;
  @ApiProperty({ type: String, nullable: true }) conditionNote: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 30,
    description:
      '`null` là người tổ chức CHƯA xét dòng này; `0` là đã xét và không nhận. Hai điều khác nhau — đừng gộp chúng ở client.',
  })
  acceptedQuantity: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: CharityRejectionReasons,
    description: 'Chỉ có khi nhận ít hơn số đề nghị.',
  })
  rejectionReason: string | null;
}

export class CharityContributionDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ format: 'uuid' }) contributorId: string;

  @ApiProperty({ enum: CharityContributionStatuses })
  status: string;

  @ApiProperty({ type: String, nullable: true }) note: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Cách liên lạc contributor khai. Chỉ hiện cho người tổ chức của hoạt động và cho chính contributor.',
  })
  contactNote: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;

  @ApiProperty({ type: () => [CharityContributionItemDto] })
  items: CharityContributionItemDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Lượt giao nhận sinh từ đề nghị này; tối đa một.',
  })
  deliveryId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['ACCEPTED', 'COMPLETED', 'CANCELLED'],
  })
  deliveryStatus: string | null;
}

export class CharityContributionPageDto {
  @ApiProperty({ type: () => [CharityContributionDto] })
  items: CharityContributionDto[];

  @ApiProperty({ example: 12 }) total: number;
}

export class ListContributionsQueryDto {
  @ApiPropertyOptional({ enum: CharityContributionStatuses })
  @IsOptional()
  @IsIn(CharityContributionStatuses)
  status?: (typeof CharityContributionStatuses)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ContributionLineDecisionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Dòng của ĐỀ NGHỊ (không phải dòng nhu cầu).',
  })
  @IsUUID()
  contributionItemId: string;

  @ApiProperty({
    minimum: 0,
    example: 30,
    description:
      'Số nhận, từ 0 tới số người tặng đề nghị. `0` là từ chối cả dòng.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxNeedItemQuantity)
  acceptedQuantity: number;

  @ApiPropertyOptional({
    enum: CharityRejectionReasons,
    description:
      '**Bắt buộc** khi nhận ít hơn đề nghị, và phải **bỏ trống** khi nhận đủ.',
  })
  @IsOptional()
  @IsIn(CharityRejectionReasons)
  rejectionReason?: (typeof CharityRejectionReasons)[number];
}

export class DecideCharityContributionBodyDto {
  @ApiProperty({
    maxLength: 100,
    example: '0f8e2c1a-5b8c-4d7e-9f3a-2b1c0d9e8f7a',
    description:
      'Khoá chống trùng do CLIENT sinh cho MỖI lần bấm (nên là UUID). Bấm đúp hay mạng retry cùng khoá thì nhận lại đúng kết quả cũ (`replayed: true`) và không tạo lượt giao nhận thứ hai.',
  })
  @IsString()
  @Length(8, 100)
  decisionKey: string;

  @ApiProperty({
    type: () => [ContributionLineDecisionDto],
    description:
      'Quyết **mọi** dòng của đề nghị trong một lượt — không quyết dần. Một đề nghị chỉ có một lượt quyết và tối đa một lượt giao nhận.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxContributionItems)
  @ValidateNested({ each: true })
  @Type(() => ContributionLineDecisionDto)
  decisions: ContributionLineDecisionDto[];
}

export class DeliveryReceiptLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  needItemId: string;

  @ApiProperty({
    minimum: 0,
    example: 30,
    description:
      'Số THỰC NHẬN, từ 0 tới số đã chấp nhận. Phần thiếu trở về nhu cầu để người khác tặng tiếp.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxNeedItemQuantity)
  receivedQuantity: number;
}

export class CompleteCharityDeliveryBodyDto {
  @ApiProperty({
    type: () => [DeliveryReceiptLineDto],
    description:
      'Xác nhận **đủ** mọi dòng của lượt giao nhận, mỗi dòng một lần.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxContributionItems)
  @ValidateNested({ each: true })
  @Type(() => DeliveryReceiptLineDto)
  received: DeliveryReceiptLineDto[];
}

export class CancelCharityDeliveryBodyDto {
  @ApiProperty({ maxLength: 500, example: 'Không sắp xếp được thời gian giao' })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class CharityDeliveryItemDto {
  @ApiProperty({ format: 'uuid' }) needItemId: string;
  @ApiProperty({ example: 'Gạo tẻ' }) itemName: string;
  @ApiProperty({ example: 'kg' }) unit: string;
  @ApiProperty({ example: 40 }) acceptedQuantity: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 30,
    description:
      '`null` là chưa xác nhận; `0` là đã xác nhận và không nhận được gì.',
  })
  receivedQuantity: number | null;
}

export class CharityDeliveryDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ format: 'uuid' }) contributionId: string;
  @ApiProperty({ format: 'uuid' }) contributorId: string;
  @ApiProperty({
    format: 'uuid',
    description: 'Người NHẬN — người tổ chức tại lúc quyết định.',
  })
  organizerId: string;
  @ApiProperty({ enum: ['ACCEPTED', 'COMPLETED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason: string | null;
  @ApiProperty({ type: () => [CharityDeliveryItemDto] })
  items: CharityDeliveryItemDto[];
}

export class DecideCharityContributionResponseDto {
  @ApiProperty({ type: () => CharityContributionDto })
  contribution: CharityContributionDto;

  @ApiProperty({
    type: () => CharityDeliveryDto,
    nullable: true,
    description: '`null` khi từ chối mọi dòng — không sinh lượt giao nhận rác.',
  })
  delivery: CharityDeliveryDto | null;

  @ApiProperty({
    description:
      '`true` khi đây là lần retry cùng `decisionKey`: không ghi gì, chỉ trả lại kết quả cũ.',
  })
  replayed: boolean;
}

export class RecordExternalContributionBodyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  needItemId: string;

  @ApiProperty({
    minimum: 1,
    example: 20,
    description: 'Số lượng THỰC NHẬN, theo đơn vị của dòng nhu cầu.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxNeedItemQuantity)
  quantity: number;

  @ApiProperty({
    maxLength: 200,
    example: 'Cô Lan bán tạp hoá đầu hẻm',
    description:
      'Nhãn CHỮ cho nguồn — không phải tài khoản. Bản ghi ngoài app không gắn người dùng nào nên không sinh điểm cho ai.',
  })
  @IsString()
  @Length(1, 200)
  sourceLabel: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Lúc nhận. Không được ở tương lai.',
  })
  @IsISO8601()
  receivedAt: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  evidenceNote?: string;
}

export class AmendExternalContributionBodyDto {
  @ApiProperty({
    enum: ['VOID', 'ADJUST'],
    description:
      '`VOID` huỷ bản ghi. `ADJUST` huỷ bản ghi này và tạo bản THAY THẾ với số mới (`replacesId` trỏ về bản cũ). Không có đường sửa tại chỗ — database từ chối.',
  })
  @IsIn(['VOID', 'ADJUST'])
  action: 'VOID' | 'ADJUST';

  @ApiProperty({ maxLength: 500, example: 'Đếm lại thì thiếu 5 kg' })
  @IsString()
  @Length(1, 500)
  reason: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Bắt buộc khi `ADJUST`, và phải khác số cũ.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxNeedItemQuantity)
  quantity?: number;
}

export class CharityExternalContributionDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ format: 'uuid' }) needItemId: string;
  @ApiProperty() itemName: string;
  @ApiProperty() unit: string;
  @ApiProperty() quantity: number;
  @ApiProperty() sourceLabel: string;
  @ApiProperty({ type: String, format: 'date-time' }) receivedAt: Date;
  @ApiProperty({ type: String, nullable: true }) evidenceNote: string | null;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({
    enum: ['ACTIVE', 'VOIDED'],
    description: 'Chỉ `ACTIVE` tính vào số đã nhận.',
  })
  status: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Bản bị thay bởi bản này.',
  })
  replacesId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  voidedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) voidReason: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class CharityExternalContributionListDto {
  @ApiProperty({ type: () => [CharityExternalContributionDto] })
  items: CharityExternalContributionDto[];
}

export class CloseCharityCampaignResponseDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;

  @ApiProperty({
    example: 3,
    description: 'Đề nghị đang chờ bị từ chối với `CAMPAIGN_CLOSED`.',
  })
  rejectedContributions: number;

  @ApiProperty({
    example: 1,
    description:
      'Lượt giao nhận còn đang chạy. KHÔNG bị huỷ — vẫn hoàn tất được sau khi đóng.',
  })
  openDeliveries: number;
}

export class ExtendCharityCampaignBodyDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'Mốc kết thúc MỚI, phải SAU mốc hiện tại. Rút ngắn thời hạn không đi đường này — đóng hoạt động đi qua `POST .../close`.',
  })
  @IsISO8601()
  endTime: string;

  @ApiProperty({
    maxLength: 500,
    example: 'Còn thiếu gạo, kéo dài thêm hai tuần',
  })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class ExtendCharityCampaignResponseDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty({ type: String, format: 'date-time' }) previousEndTime: Date;
  @ApiProperty({ type: String, format: 'date-time' }) newEndTime: Date;
}

export class GrantCharityCoordinatorBodyDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Người được giao quyền điều phối.',
  })
  @IsUUID()
  userId: string;
}

export class CharityCoordinatorDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ format: 'uuid' }) grantedBy: string;
  @ApiProperty({ type: String, format: 'date-time' }) grantedAt: Date;
}

export class CharityCoordinatorListDto {
  @ApiProperty({ type: () => [CharityCoordinatorDto] })
  coordinators: CharityCoordinatorDto[];
}
