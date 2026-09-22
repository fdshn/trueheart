import { ReactionKinds } from '@chantam.vn/chantam.core-lib/consts';
import {
  IListReactionsResponseDto,
  IReactionActorDto,
  IReactionSummaryDto,
  ISetReactionBodyDto,
  ISetReactionResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Mixin } from 'ts-mixer';

export class ReactionSubjectParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectId: string;
}

export class SetReactionDto {
  @ApiProperty({
    enum: ReactionKinds,
    description:
      'Cố ý không có ANGRY: đây là nền tảng cho–nhận đồ, một nút phẫn nộ trên bài của người đang cần giúp không phục vụ ai.',
  })
  @IsEnum(ReactionKinds)
  kind: ReactionKinds;
}

export class SetReactionBodyDto implements ISetReactionBodyDto {
  @ApiProperty({ type: () => SetReactionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetReactionDto)
  reaction: SetReactionDto;
}

export class ReactionSummaryDto implements IReactionSummaryDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({
    example: { LIKE: 8, LOVE: 4 },
    description:
      'Chỉ gồm loại thực sự có người chọn. Trả về loại có số 0 là bắt giao diện tự lọc và làm payload bảng tin phình lên.',
  })
  breakdown: Partial<Record<ReactionKinds, number>>;

  @ApiPropertyOptional({
    enum: ReactionKinds,
    nullable: true,
    description: 'Cảm xúc của chính người gọi.',
  })
  myReaction: ReactionKinds | null;
}

export class ReactionActorDto implements IReactionActorDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() username: string;
  @ApiPropertyOptional({ nullable: true }) fullName: string | null;
  @ApiProperty({ enum: ReactionKinds }) kind: ReactionKinds;
  @ApiProperty({ type: String, format: 'date-time' }) reactedAt: Date;
}

export class SetReactionResponseDto implements ISetReactionResponseDto {
  @ApiProperty({ type: () => ReactionSummaryDto })
  reaction: IReactionSummaryDto;
}

export class ListReactionsQueryDto extends Mixin(PaginationQueryDto) {
  @ApiPropertyOptional({
    enum: ReactionKinds,
    description: 'Lọc theo một loại cảm xúc. Bỏ trống thì lấy tất cả.',
  })
  @IsOptional()
  @IsEnum(ReactionKinds)
  kind?: ReactionKinds;
}

export class ListReactionsResponseDto implements IListReactionsResponseDto {
  @ApiProperty({ type: () => ReactionSummaryDto })
  summary: IReactionSummaryDto;

  @ApiProperty({ type: () => [ReactionActorDto] })
  actors: IReactionActorDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
