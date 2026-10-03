import {
  BroadcastAudienceTypes,
  BroadcastStatuses,
  MaxBroadcastBodyLength,
  MaxBroadcastTitleLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BroadcastAudienceDto {
  @ApiProperty({
    enum: BroadcastAudienceTypes,
    description:
      '`ALL` toàn hệ thống · `GROUP` thành viên một nhóm · `AREA` người có Vị trí mặc định trong một bán kính. Ba chế độ đúng những gì SRS mục 1507 nêu — không có chế độ lọc theo hạng hay theo điểm, vì đặc tả không nêu.',
  })
  @IsIn(BroadcastAudienceTypes as readonly string[])
  type: string;

  @ApiPropertyOptional({ description: 'Bắt buộc với `GROUP`.' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    example: 10.7724,
    description: 'Bắt buộc với `AREA`.',
  })
  @IsOptional()
  @IsLatitude()
  centerLat?: number;

  @ApiPropertyOptional({
    example: 106.698,
    description: 'Bắt buộc với `AREA`.',
  })
  @IsOptional()
  @IsLongitude()
  centerLng?: number;

  @ApiPropertyOptional({
    example: 5_000,
    minimum: 1,
    description:
      'Mét. Bắt buộc với `AREA`. Bán kính 0 bị từ chối — nó gửi cho đúng những người có toạ độ trùng khít tâm, tức gần như không ai, và Admin sẽ tưởng hệ thống hỏng.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;
}

export class CreateBroadcastDto {
  @ApiProperty({ type: () => BroadcastAudienceDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience: BroadcastAudienceDto;

  @ApiProperty({
    example: 'Mùa Vu Lan Báo Hiếu',
    maxLength: MaxBroadcastTitleLength,
  })
  @IsString()
  @Length(3, MaxBroadcastTitleLength)
  title: string;

  @ApiProperty({
    example: 'Chương trình trao quà Vu Lan bắt đầu từ hôm nay.',
    maxLength: MaxBroadcastBodyLength,
  })
  @IsString()
  @Length(3, MaxBroadcastBodyLength)
  body: string;
}

export class CreateBroadcastBodyDto {
  @ApiProperty({ type: () => CreateBroadcastDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateBroadcastDto)
  broadcast: CreateBroadcastDto;
}

export class ListBroadcastsQueryDto {
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

export class BroadcastResponseDto {
  @ApiProperty() globalId: string;

  @ApiProperty({ type: () => BroadcastAudienceDto })
  audience: BroadcastAudienceDto;

  @ApiProperty({
    example: 'người trong bán kính 5.0 km quanh (10.7724, 106.698)',
    description:
      'Bộ người nhận viết thành chữ. Dựng ở backend một lần — bốn cột toạ độ thô thì mỗi chỗ đọc lại phải tự ghép câu.',
  })
  audienceLabel: string;

  @ApiProperty() notificationType: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;

  @ApiProperty({
    enum: BroadcastStatuses,
    description:
      '`PENDING` chờ CLI · `SENDING` đang gửi (hoặc một lượt chạy đã chết giữa đường — CLI sẽ nhặt lại) · `COMPLETED` · `FAILED`.',
  })
  status: string;

  @ApiProperty({
    description:
      'Số người nhận. Lúc TẠO là con số đếm trước; sau khi gửi là con số thật — hai cái lệch nhau là bình thường, vì số người đổi giữa lúc tạo và lúc gửi.',
  })
  audienceCount: number;

  @ApiProperty() notifiedCount: number;

  @ApiProperty({
    description:
      'Đã có thông báo của lượt gửi này từ trước. Lớn khi chạy lại là DẤU HIỆU TỐT — khoá chống trùng đang làm việc.',
  })
  alreadySentCount: number;

  @ApiProperty() failedCount: number;

  @ApiProperty({
    description:
      'Con trỏ tiếp tục — người cuối đã xử lý. Lượt chạy sau tiếp từ đây thay vì bắt đầu lại.',
  })
  lastUserId: number;

  @ApiProperty({ nullable: true }) failureReason: string | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true }) startedAt: Date | null;
  @ApiProperty({ nullable: true }) completedAt: Date | null;
}

export class CreateBroadcastResponseDto {
  @ApiProperty({ type: () => BroadcastResponseDto })
  broadcast: BroadcastResponseDto;
}

export class ListBroadcastsResponseDto {
  @ApiProperty({ type: () => [BroadcastResponseDto] })
  items: BroadcastResponseDto[];

  @ApiProperty() total: number;
}
