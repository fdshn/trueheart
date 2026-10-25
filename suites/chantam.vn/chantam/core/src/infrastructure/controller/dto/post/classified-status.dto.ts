import { ClassifiedStatusActions } from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsEnum, ValidateNested } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';

export class UpdateClassifiedStatusDto {
  @ApiProperty({
    enum: ClassifiedStatusActions,
    description:
      '`ACTIVE` → bài về `PUBLISHED` (đang bán); `RESERVED` (đã có người giữ); `SOLD` (đã bán — điểm cuối); `HIDDEN` (tạm ẩn, mở lại được).',
  })
  @IsEnum(ClassifiedStatusActions)
  status: ClassifiedStatusActions;
}

export class UpdateClassifiedStatusBodyDto {
  @ApiProperty({ type: () => UpdateClassifiedStatusDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateClassifiedStatusDto)
  post: UpdateClassifiedStatusDto;
}

export class UpdateClassifiedStatusResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
