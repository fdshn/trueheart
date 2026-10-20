import { MaxEvidencePerKind } from '@chantam.vn/chantam.core-lib/consts';
import {
  AllowedImageContentTypes,
  MediaSizeLimits,
} from '@chantam/service.storage-lib';
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

// Lấy từ storage-lib, nơi ký URL: chép tay ở đây là hai nơi khai một luật,
// và lệch nhau thì DTO cho qua thứ storage từ chối.
const AllowedImageTypes = [...AllowedImageContentTypes];
const MaxEvidenceBytes = MediaSizeLimits.transactionEvidence;

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

export class ConfirmGiftReceiptDto {
  @ApiPropertyOptional({
    type: [String],
    maxItems: MaxEvidencePerKind,
    description:
      'Key ảnh món đồ nhận được (từ `POST /transactions/:id/evidence/upload-url`), tối đa 3. TUỲ CHỌN. Mỗi key phải thuộc chính người nhận và đúng lượt trao này, đã PUT xong — không thì 400 và lượt trao KHÔNG hoàn tất.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MaxEvidencePerKind)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  evidenceKeys?: string[];
}

/**
 * Body TUỲ CHỌN: xác nhận không kèm ảnh vẫn là đường chính, nên `receipt` không bắt
 * buộc — app đang gọi không có body phải chạy y như cũ.
 */
export class ConfirmGiftReceiptBodyDto {
  @ApiPropertyOptional({ type: () => ConfirmGiftReceiptDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmGiftReceiptDto)
  receipt?: ConfirmGiftReceiptDto;
}
