import {
  PresenceSurfaces,
  PresenceTtlSeconds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPresenceHeartbeatBodyDto,
  IPresenceHeartbeatDto,
  IPresenceHeartbeatResponseDto,
  IPresenceHeartbeatResultDto,
  IPresenceSurfaceParamsDto,
  IPresenceSurfaceQueryDto,
  ISurfacePresenceDto,
  ISurfacePresenceResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PublicAuthorSummaryDto } from '../public-author.dto';

export class PresenceHeartbeatDto implements IPresenceHeartbeatDto {
  @ApiProperty({ enum: PresenceSurfaces })
  @IsEnum(PresenceSurfaces)
  surface: PresenceSurfaces;

  @ApiProperty({
    format: 'uuid',
    description:
      'App sinh mỗi lần khởi động — phân biệt nhiều thiết bị của cùng một người.',
  })
  @IsUUID()
  sessionId: string;
}

export class PresenceHeartbeatBodyDto implements IPresenceHeartbeatBodyDto {
  @ApiProperty({ type: () => PresenceHeartbeatDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PresenceHeartbeatDto)
  presence: PresenceHeartbeatDto;
}

export class PresenceHeartbeatResultDto implements IPresenceHeartbeatResultDto {
  @ApiProperty({ enum: PresenceSurfaces }) surface: PresenceSurfaces;
  @ApiProperty({ format: 'uuid' }) sessionId: string;
  @ApiProperty({ example: PresenceTtlSeconds }) expiresInSeconds: number;
  @ApiProperty({
    description:
      '`false` khi bỏ qua: lặp cùng surface sớm hơn 30 giây, hoặc Redis không trả lời. Không phải lỗi.',
  })
  refreshed: boolean;
}

export class PresenceHeartbeatResponseDto implements IPresenceHeartbeatResponseDto {
  @ApiProperty({ type: () => PresenceHeartbeatResultDto })
  presence: IPresenceHeartbeatResultDto;
}

export class PresenceSurfaceParamsDto implements IPresenceSurfaceParamsDto {
  @ApiProperty({ enum: PresenceSurfaces })
  @IsEnum(PresenceSurfaces)
  surface: PresenceSurfaces;
}

export class PresenceSurfaceQueryDto implements IPresenceSurfaceQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 50,
    default: 10,
    description: 'Số người tối đa trong `visibleUsers`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SurfacePresenceDto implements ISurfacePresenceDto {
  @ApiProperty({ enum: PresenceSurfaces }) surface: PresenceSurfaces;

  @ApiProperty({
    example: 24,
    description:
      'Số NGƯỜI (gộp nhiều thiết bị) còn heartbeat trong 120 giây qua.',
  })
  onlineCount: number;

  @ApiProperty({
    type: () => [PublicAuthorSummaryDto],
    description:
      'Người đã bật `showOnlineStatus`, tài khoản đang hoạt động, heartbeat gần nhất trước; không gồm người gọi.',
  })
  visibleUsers: PublicAuthorSummaryDto[];
}

export class SurfacePresenceResponseDto implements ISurfacePresenceResponseDto {
  @ApiProperty({ type: () => SurfacePresenceDto })
  presence: ISurfacePresenceDto;
}
