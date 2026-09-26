import { IAdminComment } from '@/domain/ports/repository';
import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { PaginationQueryDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

/** Chỉ hai trạng thái này là quyết định của Admin. */
const ModerationDecisions = [
  CommentStatuses.VISIBLE,
  CommentStatuses.REMOVED,
] as const;

export class ListAdminCommentsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({
    enum: CommentStatuses,
    description:
      'Bỏ trống thì trả mọi bình luận chưa bị gỡ. Dùng `PENDING_REVIEW` để lấy đúng hàng đợi của bộ lọc từ ngữ.',
  })
  @IsOptional()
  @IsIn(Object.values(CommentStatuses))
  status?: CommentStatuses;
}

export class AdminCommentDto implements IAdminComment {
  @ApiProperty({ format: 'uuid' }) commentId: string;

  @ApiProperty({ enum: ContentSubjectTypes })
  subjectType: ContentSubjectTypes;

  @ApiProperty({ format: 'uuid' }) subjectId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Tiêu đề bài chứa bình luận. `null` với chủ thể không phải bài.',
  })
  subjectTitle: string | null;

  @ApiProperty({ format: 'uuid' }) authorId: string;

  @ApiProperty() authorUsername: string;

  @ApiProperty() body: string;

  @ApiProperty({ enum: CommentStatuses }) status: CommentStatuses;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Từ ngữ bộ lọc bắt được — lý do bình luận nằm trong hàng đợi.',
  })
  flaggedTerms: string | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ListAdminCommentsResponseDto {
  @ApiProperty({ type: () => [AdminCommentDto] })
  comments: IAdminComment[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  meta: unknown;
}

export class AdminCommentParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  commentId: string;
}

export class ModerateAdminCommentDto {
  @ApiProperty({
    enum: ModerationDecisions,
    description: '`VISIBLE` cho hiện lại, `REMOVED` gỡ hẳn.',
  })
  @IsIn(ModerationDecisions)
  decision: CommentStatuses.VISIBLE | CommentStatuses.REMOVED;

  @ApiProperty({
    example: 'Chỉ là tiếng lóng, không vi phạm',
    description: 'Bắt buộc — đây là quyết định sẽ bị hỏi lại.',
  })
  @Length(1, 500)
  reason: string;
}

export class ModerateAdminCommentBodyDto {
  @ApiProperty({ type: () => ModerateAdminCommentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ModerateAdminCommentDto)
  moderation: ModerateAdminCommentDto;
}

export class ModerateAdminCommentResponseDto {
  @ApiProperty({ type: () => AdminCommentDto })
  comment: IAdminComment;
}
