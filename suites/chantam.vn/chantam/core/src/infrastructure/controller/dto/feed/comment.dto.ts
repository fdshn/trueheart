import {
  CommentStatuses,
  MaxCommentLength,
  MaxContentMediaPerItem,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICommentResponseDto,
  IContentCommentDto,
  IContentCommentWindowDto,
  ICreateCommentBodyDto,
  IListCommentsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

const MaxCommentPageSize = 50;

export class CommentSubjectParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectId: string;
}

export class CommentIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  commentId: string;
}

export class CreateCommentDto {
  @ApiProperty({
    minLength: 0,
    maxLength: MaxCommentLength,
    description:
      'Có thể để rỗng khi gửi kèm ảnh — một bình luận chỉ có ảnh là hợp lệ. Nhưng rỗng cả hai thì bị từ chối.',
  })
  @IsString()
  @Length(0, MaxCommentLength)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MaxContentMediaPerItem,
    description: 'Key ảnh đã tải lên qua `comment-media/upload-url`, tối đa 3.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxContentMediaPerItem)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  mediaKeys?: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Có giá trị thì đây là TRẢ LỜI. Chỉ trả lời được bình luận gốc — không có cấp ba.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateCommentBodyDto implements ICreateCommentBodyDto {
  @ApiProperty({ type: () => CreateCommentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateCommentDto)
  comment: CreateCommentDto;
}

export class EditCommentDto {
  @ApiProperty({ minLength: 1, maxLength: MaxCommentLength })
  @IsString()
  @Length(1, MaxCommentLength)
  body: string;
}

export class EditCommentBodyDto {
  @ApiProperty({ type: () => EditCommentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => EditCommentDto)
  comment: EditCommentDto;
}

export class ContentCommentDto implements IContentCommentDto {
  @ApiProperty({ format: 'uuid' }) commentId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  parentId: string | null;

  @ApiProperty({ format: 'uuid' }) authorId: string;
  @ApiProperty() authorUsername: string;
  @ApiPropertyOptional({ nullable: true }) authorFullName: string | null;

  @ApiProperty({
    description:
      'RỖNG khi bình luận đã bị gỡ hoặc bị ẩn — dòng vẫn còn để chuỗi trả lời không mất ngữ cảnh. Đọc `status` để hiện "bình luận đã bị gỡ".',
  })
  body: string;

  @ApiProperty({ enum: CommentStatuses })
  status: CommentStatuses;

  @ApiProperty() replyCount: number;
  @ApiProperty() reactionCount: number;
  @ApiProperty({ description: 'Bình luận của chính người gọi.' })
  isMine: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Key ảnh đính kèm. Rỗng khi bình luận chỉ có chữ, hoặc khi đã bị gỡ — để ảnh vẫn mở được sau khi gỡ là gỡ nửa vời.',
  })
  mediaKeys: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  editedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ContentCommentWindowDto implements IContentCommentWindowDto {
  @ApiProperty({ example: 30 }) limit: number;

  @ApiPropertyOptional({ nullable: true })
  oldestCursor: string | null;

  @ApiPropertyOptional({ nullable: true })
  newestCursor: string | null;

  @ApiProperty() hasMoreBefore: boolean;
  @ApiProperty() hasMoreAfter: boolean;
}

export class CommentResponseDto implements ICommentResponseDto {
  @ApiProperty({ type: () => ContentCommentDto })
  comment: IContentCommentDto;
}

export class ListCommentsResponseDto implements IListCommentsResponseDto {
  @ApiProperty({ type: () => [ContentCommentDto] })
  comments: IContentCommentDto[];

  @ApiProperty({ type: () => ContentCommentWindowDto })
  window: IContentCommentWindowDto;
}

export class ListCommentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MaxCommentPageSize, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxCommentPageSize)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Lấy bình luận CŨ HƠN con trỏ này. Bỏ trống thì lấy mới nhất.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  before?: string;
}

export class ListRepliesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MaxCommentPageSize, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxCommentPageSize)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Lấy trả lời MỚI HƠN con trỏ này. Trả lời đọc cũ-nhất-trước, ngược chiều với danh sách gốc — một cuộc trao đổi phải đọc từ trên xuống mới hiểu.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  after?: string;
}

const AllowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const MaxMediaBytes = 5 * 1024 * 1024;

export class RequestCommentMediaUploadDto {
  @ApiProperty({ enum: AllowedImageTypes, example: 'image/webp' })
  @IsIn(AllowedImageTypes)
  contentType: string;

  @ApiProperty({ minimum: 1, maximum: MaxMediaBytes, example: 512_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxMediaBytes)
  contentLength: number;
}

export class RequestCommentMediaUploadBodyDto {
  @ApiProperty({ type: () => RequestCommentMediaUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestCommentMediaUploadDto)
  upload: RequestCommentMediaUploadDto;
}

export class CommentMediaUploadDto {
  @ApiProperty() key: string;
  @ApiProperty() uploadUrl: string;
  @ApiProperty({ example: 300 }) expiresInSeconds: number;
  @ApiProperty() publicUrl: string;
}

export class RequestCommentMediaUploadResponseDto {
  @ApiProperty({ type: () => CommentMediaUploadDto })
  upload: CommentMediaUploadDto;
}
