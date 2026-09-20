import { SmartMatchMaxResults } from '@/domain/consts';
import {
  IGetSmartMatchesResponseDto,
  ISmartMatchDto,
  SmartMatchReason,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
} from '@chantam/service.persistency-lib/geo';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetSmartMatchesQueryDto {
  @ApiPropertyOptional({
    minimum: MinSearchRadiusMeters,
    maximum: MaxSearchRadiusMeters,
    description: 'Bán kính tìm bài ghép. Bỏ trống dùng mặc định 20km.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MinSearchRadiusMeters)
  @Max(MaxSearchRadiusMeters)
  radiusMeters?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: SmartMatchMaxResults })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SmartMatchMaxResults)
  take?: number;
}

export class SmartMatchDto implements ISmartMatchDto {
  @ApiProperty()
  post: IPostEntity;

  @ApiProperty({
    description: 'Đã làm tròn theo bậc, không phải khoảng cách chính xác.',
  })
  distanceMeters: number;

  @ApiProperty({ example: true })
  isLocationApproximate: true;

  @ApiProperty({
    example: 0.86,
    description:
      'Độ khớp trong [0, 1]: cùng danh mục 0.5, trùng từ khoá 0.3, gần 0.2.',
  })
  score: number;

  @ApiProperty({
    isArray: true,
    enum: ['SAME_CATEGORY', 'KEYWORD_MATCH', 'NEARBY'],
    description: 'Vì sao bài này được gợi ý.',
  })
  reasons: SmartMatchReason[];
}

export class GetSmartMatchesResponseDto implements IGetSmartMatchesResponseDto {
  @ApiProperty()
  sourcePostId: string;

  @ApiProperty()
  radiusMeters: number;

  @ApiProperty({ type: () => [SmartMatchDto] })
  matches: SmartMatchDto[];
}
