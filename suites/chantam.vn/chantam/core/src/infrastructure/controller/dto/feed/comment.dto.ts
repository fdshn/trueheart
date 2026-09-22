import {
  CommentStatuses,
  MaxCommentLength,
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
  IsDefined,
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
  @ApiProperty({ minLength: 1, maxLength: MaxCommentLength })
  @IsString()
  @Length(1, MaxCommentLength)
  body: string;

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
