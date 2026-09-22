import { MaxEvidencePerKind } from '@chantam.vn/chantam.core-lib/consts';
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

const AllowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const MaxEvidenceBytes = 5 * 1024 * 1024;

export class GiftEvidenceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transactionId: string;
}

export class RequestGiftEvidenceUploadDto {
  @ApiProperty({ enum: AllowedImageTypes, example: 'image/webp' })
  @IsIn(AllowedImageTypes)
  contentType: string;

  @ApiProperty({
    minimum: 1,
    maximum: MaxEvidenceBytes,
    example: 512_000,
    description: 'Kích thước file, tính bằng byte. Tối đa 5 MB.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxEvidenceBytes)
  contentLength: number;
}

export class RequestGiftEvidenceUploadBodyDto {
  @ApiProperty({ type: () => RequestGiftEvidenceUploadDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestGiftEvidenceUploadDto)
  upload: RequestGiftEvidenceUploadDto;
}

export class GiftEvidenceUploadDto {
  @ApiProperty({
    description:
      'Key để gửi lại trong bước trao đồ / xác nhận / báo hoàn hàng. Mang cả userId lẫn transactionId nên không tải nhầm chỗ được.',
  })
  key: string;

  @ApiProperty({
    description: 'PUT thẳng file lên đây, máy chủ không nhận file.',
  })
  uploadUrl: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiProperty({ description: 'Chỉ dùng được sau khi PUT thành công.' })
  publicUrl: string;
}

export class RequestGiftEvidenceUploadResponseDto {
  @ApiProperty({ type: () => GiftEvidenceUploadDto })
  upload: GiftEvidenceUploadDto;
}

export class MarkGiftHandedOverDto {
  @ApiPropertyOptional({
    type: [String],
    maxItems: MaxEvidencePerKind,
    description:
      'Key ảnh đã tải lên, tối đa 3. TUỲ CHỌN — thiếu ảnh thì lượt trao vẫn đi tiếp, chỉ mất quyền báo "người nhận không thanh toán phí ship" về sau.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxEvidencePerKind)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  evidenceKeys?: string[];
}

export class MarkGiftHandedOverBodyDto {
  @ApiProperty({ type: () => MarkGiftHandedOverDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MarkGiftHandedOverDto)
  handover: MarkGiftHandedOverDto;
}
