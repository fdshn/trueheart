import {
  DharmaThreadStatuses,
  MaxDedicateeNameLength,
  MaxDedicationTextLength,
  MaxThreadBodyLength,
  MaxThreadTitleLength,
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
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateThreadDto {
  @ApiProperty({
    maxLength: MaxThreadTitleLength,
    example: 'Hỏi về pháp môn niệm Phật',
  })
  @IsString()
  @Length(5, MaxThreadTitleLength)
  title: string;

  @ApiProperty({
    maxLength: MaxThreadBodyLength,
    description:
      'Một chủ đề rỗng không ai trả lời được, nên tối thiểu 10 ký tự.',
  })
  @IsString()
  @Length(10, MaxThreadBodyLength)
  bodyText: string;

  @ApiPropertyOptional({
    description: 'Chuẩn hoá về slug ở cả lượt ghi và lượt lọc.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  category?: string;
}

export class CreateThreadBodyDto {
  @ApiProperty({ type: () => CreateThreadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateThreadDto)
  thread: CreateThreadDto;
}

export class ListThreadsQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  category?: string;
}

export class ListAdminThreadsQueryDto {
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
    enum: DharmaThreadStatuses,
    description:
      'Lọc `PENDING_REVIEW` để ra hàng đợi kiểm duyệt, cũ nhất trước — ' +
      '`IDX_dharma_threads_pending` phục vụ đúng câu đó.',
  })
  @IsOptional()
  @IsIn(DharmaThreadStatuses as readonly string[])
  status?: string;
}

export class ThreadIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class ModerateThreadDto {
  @ApiPropertyOptional({
    enum: DharmaThreadStatuses,
    description: 'Dùng đúng bốn giá trị của `content_comment_status_enum`.',
  })
  @IsOptional()
  @IsIn(DharmaThreadStatuses as readonly string[])
  status?: string;

  @ApiPropertyOptional({
    description:
      'Khoá bình luận mà KHÔNG ẩn chủ đề (UC-DHARMA-03) — một cuộc tranh luận chệch hướng ' +
      'vẫn đáng đọc lại, chỉ không nên tiếp tục.',
  })
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @ApiPropertyOptional({ description: 'Ghim lên đầu danh sách.' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    maxLength: 1_000,
    description: 'Lý do, lưu kèm dấu vết kiểm duyệt.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 1_000)
  note?: string;
}

export class ModerateThreadBodyDto {
  @ApiProperty({ type: () => ModerateThreadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ModerateThreadDto)
  moderation: ModerateThreadDto;
}

export class CreateDedicationDto {
  @ApiProperty({
    maxLength: MaxDedicationTextLength,
    example: 'Nguyện hồi hướng công đức này...',
  })
  @IsString()
  @Length(5, MaxDedicationTextLength)
  text: string;

  @ApiPropertyOptional({
    maxLength: MaxDedicateeNameLength,
    description:
      'Người được hồi hướng. TUỲ CHỌN — hồi hướng cho tất cả chúng sinh là lời phổ biến ' +
      'nhất và nó không có tên người nhận (UC-DHARMA-04 cho "tạo độc lập").',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxDedicateeNameLength)
  dedicateeName?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Gắn với một lượt tụng kinh. Lượt đó phải là CỦA BẠN — gắn vào lượt của người khác ' +
      'trả 404, vì ai dò id không nên biết người khác đang tụng gì.',
  })
  @IsOptional()
  @IsUUID()
  recitationId?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Mặc định công khai (UI-MERIT-01). Đặt `false` để chỉ mình thấy.',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Ẩn tên trên danh sách công khai. Mặc định TẮT — ẩn danh phải là lựa chọn người dùng ' +
      'bấm. Tên thật KHÔNG ra khỏi tầng repository khi bật.',
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}

export class CreateDedicationBodyDto {
  @ApiProperty({ type: () => CreateDedicationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateDedicationDto)
  dedication: CreateDedicationDto;
}

export class ThreadResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty({ nullable: true }) authorId: string | null;
  @ApiProperty() title: string;
  @ApiProperty() bodyText: string;
  @ApiProperty({ nullable: true }) category: string | null;

  @ApiProperty({ enum: DharmaThreadStatuses })
  status: string;

  @ApiProperty({
    nullable: true,
    description: 'Từ ngữ bộ lọc bắt được, nếu có. Admin đọc nó để quyết nhanh.',
  })
  flaggedTerms: string | null;

  @ApiProperty() isLocked: boolean;
  @ApiProperty() isPinned: boolean;
  @ApiProperty({ nullable: true }) moderatedBy: string | null;
  @ApiProperty({ nullable: true }) moderatedAt: Date | null;
  @ApiProperty({ nullable: true }) moderationNote: string | null;

  @ApiProperty({
    description:
      'Đếm từ `content_comments`, KHÔNG phải cột lưu sẵn — và loại bình luận đã gỡ, vì đếm ' +
      'nó vào là nói "12 câu trả lời" trong khi người đọc chỉ thấy 9.',
  })
  commentCount: number;

  @ApiProperty({
    description: 'Đếm từ `content_reactions`, không phải cột lưu sẵn.',
  })
  reactionCount: number;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class ThreadWrapperResponseDto {
  @ApiProperty({ type: () => ThreadResponseDto })
  thread: ThreadResponseDto;
}

export class ListThreadsResponseDto {
  @ApiProperty({ type: () => [ThreadResponseDto] })
  items: ThreadResponseDto[];

  @ApiProperty() total: number;
}

export class DedicationResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true }) recitationId: string | null;
  @ApiProperty({ nullable: true }) dedicateeName: string | null;
  @ApiProperty() text: string;
  @ApiProperty() isPublic: boolean;
  @ApiProperty() isAnonymous: boolean;
  @ApiProperty() createdAt: Date;
}

export class DedicationWrapperResponseDto {
  @ApiProperty({ type: () => DedicationResponseDto })
  dedication: DedicationResponseDto;
}

export class PublicDedicationResponseDto {
  @ApiProperty() globalId: string;

  @ApiProperty({
    description:
      'Tên hiện công khai, hoặc "Người ẩn danh". Tên thật của người ẩn danh KHÔNG ra khỏi ' +
      'tầng repository — câu SQL không kéo nó về.',
  })
  dedicatorLabel: string;

  @ApiProperty({ nullable: true }) dedicateeName: string | null;
  @ApiProperty() text: string;
  @ApiProperty() createdAt: Date;
}

export class ListPublicDedicationsResponseDto {
  @ApiProperty({ type: () => [PublicDedicationResponseDto] })
  items: PublicDedicationResponseDto[];

  @ApiProperty() total: number;
}

export class ListOwnDedicationsResponseDto {
  @ApiProperty({ type: () => [DedicationResponseDto] })
  items: DedicationResponseDto[];

  @ApiProperty() total: number;
}
