import { IUpdateNotificationChannelDto } from '@/application/contracts/admin-config';
import {
  INotificationChannelSummary,
  NotificationChannelCodes,
} from '@/domain/ports/repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const NotificationChannelValues: NotificationChannelCodes[] = [
  'EMAIL',
  'SMS',
  'ZALO',
];

export class NotificationChannelParamsDto {
  @ApiProperty({ enum: NotificationChannelValues })
  @IsIn(NotificationChannelValues)
  channel: NotificationChannelCodes;
}

export class UpdateNotificationChannelDto implements IUpdateNotificationChannelDto {
  @ApiPropertyOptional({ example: 'SMTP' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  provider?: string;

  @ApiPropertyOptional({
    description: 'Chỉ bật được khi kênh đã có secret.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true, example: 'no-reply@chantam.vn' })
  @IsOptional()
  @IsString()
  fromAddress?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Chân Tâm' })
  @IsOptional()
  @IsString()
  fromName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'smtp.example.com' })
  @IsOptional()
  @IsString()
  host?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 587 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'mailer' })
  @IsOptional()
  @IsString()
  username?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    writeOnly: true,
    description:
      'Chỉ ghi vào, không bao giờ đọc ra. Bỏ trống giữ nguyên secret cũ, gửi null để xoá.',
  })
  @IsOptional()
  @IsString()
  secret?: string | null;

  @ApiProperty({
    example: 'Đổi mật khẩu SMTP định kỳ',
    description: 'Bắt buộc, để audit truy được vì sao cấu hình thay đổi.',
  })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class UpdateNotificationChannelBodyDto {
  @ApiProperty({ type: () => UpdateNotificationChannelDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateNotificationChannelDto)
  channelConfig: UpdateNotificationChannelDto;
}

export class NotificationChannelDto implements INotificationChannelSummary {
  @ApiProperty({ enum: NotificationChannelValues })
  channel: NotificationChannelCodes;

  @ApiProperty({ example: 'SMTP' }) provider: string;

  @ApiProperty() enabled: boolean;

  @ApiProperty({ nullable: true }) fromAddress: string | null;

  @ApiProperty({ nullable: true }) fromName: string | null;

  @ApiProperty({ nullable: true }) host: string | null;

  @ApiProperty({ nullable: true }) port: number | null;

  @ApiProperty({ nullable: true }) username: string | null;

  @ApiProperty({
    description:
      'Đã có secret trong hệ thống hay chưa. Giá trị secret không bao giờ được trả về.',
  })
  secretConfigured: boolean;

  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class GetNotificationChannelsResponseDto {
  @ApiProperty({ type: () => [NotificationChannelDto] })
  channels: INotificationChannelSummary[];
}

export class UpdateNotificationChannelResponseDto {
  @ApiProperty({ type: () => NotificationChannelDto })
  channel: INotificationChannelSummary;
}
