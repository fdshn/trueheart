import {
  IRecordShareBodyDto,
  IRecordShareResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class ShareSubjectParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectId: string;
}

export class RecordShareDto {
  @ApiPropertyOptional({
    maxLength: 40,
    example: 'zalo',
    description:
      'Kênh người dùng chọn trên khay hệ điều hành. Không bắt buộc — client có thể chưa biết kênh lúc gọi.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  channel?: string;
}

export class RecordShareBodyDto implements IRecordShareBodyDto {
  @ApiProperty({ type: () => RecordShareDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RecordShareDto)
  share: RecordShareDto;
}

export class ShareResultDto {
  @ApiProperty({
    example: '/posts/11111111-1111-1111-1111-111111111111',
    description:
      'Đường dẫn tương đối. Client ghép tên miền của mình — server không đoán domain.',
  })
  deepLinkPath: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://chantam.vn/posts/11111111-1111-1111-1111-111111111111',
    description:
      'URL tuyệt đối khi `WEB_PUBLIC_BASE_URL` đã cấu hình. `null` khi chưa có web thật.',
  })
  shareUrl: string | null;

  @ApiProperty({
    example: 4,
    description: 'Tổng lượt chia sẻ sau lần ghi này.',
  })
  shareCount: number;
}

export class RecordShareResponseDto implements IRecordShareResponseDto {
  @ApiProperty({ type: () => ShareResultDto })
  share: ShareResultDto;
}
