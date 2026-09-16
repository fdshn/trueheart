import {
  GiftPostCategories,
  GiftPostConditions,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICreateGiftPostBodyDto,
  ICreateGiftPostDto,
  ICreateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { GiftPostEntity } from '../../../entity/gift-post.entity';
import { GeoPointDto } from '../geo-point.dto';

/** Trần số lượng cho một bài đăng — chặn khai khống để cày điểm cống hiến. */
const MaxTotalQuantity = 10_000;
/** Trần giá trị ước tính: 1 tỷ VNĐ. */
const MaxEstimatedValue = 1_000_000_000;

export class CreateGiftPostDto implements ICreateGiftPostDto {
  @ApiProperty({
    example: 'Xe đạp cũ còn dùng tốt',
    minLength: 5,
    maxLength: 200,
    description: 'Tiêu đề hiển thị trên bảng tin.',
  })
  @IsString()
  @Length(5, 200)
  title: string;

  @ApiProperty({
    example: 'Xe đạp địa hình, dùng 3 năm, phanh và líp còn tốt, cần thay săm.',
    minLength: 10,
    maxLength: 5_000,
    description:
      'Mô tả chi tiết: tình trạng thật, khiếm khuyết nếu có, cách nhận. ' +
      'Mô tả càng thật thì càng ít tranh chấp lúc giao nhận.',
  })
  @IsString()
  @Length(10, 5_000)
  description: string;

  @ApiProperty({
    enum: GiftPostCategories,
    description: 'Danh mục để người nhận lọc trên bảng tin.',
  })
  @IsEnum(GiftPostCategories)
  category: GiftPostCategories;

  @ApiProperty({
    enum: GiftPostConditions,
    description: 'Tình trạng món đồ: còn mới, đã dùng, hay cần sửa.',
  })
  @IsEnum(GiftPostConditions)
  condition: GiftPostConditions;

  @ApiProperty({
    example: 1_500_000,
    description: 'Giá trị ước tính (VNĐ). 100.000đ quy đổi 1 điểm cống hiến.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxEstimatedValue)
  estimatedValue: number;

  @ApiProperty({
    type: () => GeoPointDto,
    description:
      'Toạ độ THẬT nơi giao đồ. Hệ thống lưu nguyên vẹn nhưng KHÔNG bao giờ ' +
      'trả nguyên vẹn ra kênh công khai — bảng tin chỉ thấy toạ độ đã làm nhiễu.',
  })
  @ValidateNested()
  @Type(() => GeoPointDto)
  location: GeoPointDto;

  @ApiProperty({
    example: 'Quận 1, TP.HCM',
    minLength: 2,
    maxLength: 200,
    description:
      'Nhãn khu vực hiển thị công khai. Ghi ở mức phường/quận, đừng ghi số nhà ' +
      '— trường này ai cũng đọc được và nó sẽ phá tác dụng của việc làm nhiễu toạ độ.',
  })
  @IsString()
  @Length(2, 200)
  areaLabel: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MaxTotalQuantity,
    description:
      'Số lượng món đồ trong bài. Có trần để không ai khai khống mà cày điểm cống hiến.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxTotalQuantity)
  totalQuantity?: number;

  @ApiProperty({
    format: 'uuid',
    description: 'TẠM THỜI: sẽ lấy từ access token khi có auth-lib',
  })
  @IsUUID()
  giverId: string;
}

export class CreateGiftPostBodyDto implements ICreateGiftPostBodyDto {
  @ApiProperty({
    type: () => CreateGiftPostDto,
    description: 'Nội dung bài đăng, bọc dưới khoá `giftPost`.',
  })
  @ValidateNested()
  @Type(() => CreateGiftPostDto)
  giftPost: ICreateGiftPostDto;
}

export class CreateGiftPostResponseDto implements ICreateGiftPostResponseDto {
  @ApiProperty({
    type: () => GiftPostEntity,
    description:
      'Bài vừa tạo, ở trạng thái `PENDING_REVIEW` — chưa hiện trên bảng tin cho ' +
      'tới khi được kiểm duyệt.',
  })
  giftPost: IGiftPostEntity;
}
