import {
  DeliveryMethods,
  GenericMvpPostTypes,
  GiftPostConditions,
  PostSelectionModes,
  PostTypes,
  ShipPayers,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICreatePostBodyDto,
  ICreatePostDto,
  ICreatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { MaxClassifiedPrice } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';
import { GeoPointDto } from '../geo-point.dto';

const MaxTotalQuantity = 10_000;
const MaxEstimatedValue = 1_000_000_000;

/** Trần giá rao bán. Cùng bậc với trần giá trị ước tính để hai bên không lệch. */
/** Dùng lại trần chung ở `models/classified.ts` — trước đây là hai bản rịi nhau. */
const MaxPrice = MaxClassifiedPrice;

export class CreatePostDto implements ICreatePostDto {
  @ApiProperty({ enum: GenericMvpPostTypes })
  @IsEnum(GenericMvpPostTypes)
  postType: PostTypes;

  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @Length(5, 200)
  title: string;

  @ApiProperty({ minLength: 10, maxLength: 5_000 })
  @IsString()
  @Length(10, 5_000)
  description: string;

  @ApiProperty({ format: 'uuid', description: 'Danh mục đang hoạt động.' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({
    enum: GiftPostConditions,
    description: 'Bắt buộc với bài CLASSIFIED, tuỳ chọn với OFFER.',
  })
  @ValidateIf(
    (post) =>
      post.postType === PostTypes.OFFER ||
      post.postType === PostTypes.CLASSIFIED,
  )
  @IsEnum(GiftPostConditions)
  condition?: GiftPostConditions;

  @ApiPropertyOptional({ minimum: 0, maximum: MaxEstimatedValue })
  @ValidateIf((post) => post.postType === PostTypes.OFFER)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxEstimatedValue)
  estimatedValue?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MaxPrice,
    example: 5_200_000,
    description: 'Giá bán tính bằng VND. Bắt buộc với bài CLASSIFIED.',
  })
  @ValidateIf((post) => post.postType === PostTypes.CLASSIFIED)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxPrice)
  price?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MaxPrice,
    description:
      'Giá thị trường do người bán TỰ KHAI, để UI hiện % giảm (UI-MARKET-01). ' +
      'TUỲ CHỌN — không biết giá thị trường thì để trống, và % giảm trả `null` chứ ' +
      'không phải `0`. ' +
      'CHỐT-05: hệ thống **không xác minh** con số này và **không ép** nó lớn hơn `price`. ' +
      'Khai thấp hơn giá bán thì % ra số ÂM, và hiện đúng số âm đó.',
  })
  @IsOptional()
  @ValidateIf((post) => post.postType === PostTypes.CLASSIFIED)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MaxPrice)
  marketPrice?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Có thương lượng giá hay không. Chỉ dùng cho bài CLASSIFIED.',
  })
  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @ApiProperty({ type: () => GeoPointDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointDto)
  location: GeoPointDto;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @Length(2, 200)
  areaLabel: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MaxTotalQuantity })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MaxTotalQuantity)
  totalQuantity?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Bài Cần gấp / SOS. Mở theo capability POST_SOS của Rank; thiếu quyền thì trả POST_SOS_NOT_ALLOWED.',
  })
  @IsOptional()
  @IsBoolean()
  isSos?: boolean;

  @ApiPropertyOptional({
    enum: DeliveryMethods,
    description: 'Hình thức nhận hàng (F78).',
  })
  @IsOptional()
  @IsEnum(DeliveryMethods)
  deliveryMethod?: DeliveryMethods;

  @ApiPropertyOptional({
    enum: ShipPayers,
    description:
      'Bên chịu phí ship. Chỉ khai được khi deliveryMethod là GIVER_SHIPS — tự đến lấy thì không có phí để mà trả. Đây chỉ là DẤU HIỆU ghi bên nào chịu; hệ thống không xử lý thanh toán.',
  })
  @IsOptional()
  @IsEnum(ShipPayers)
  shipPayer?: ShipPayers;

  @ApiPropertyOptional({
    enum: PostSelectionModes,
    default: PostSelectionModes.OPTIMAL,
    description:
      'Chế độ chọn người nhận. Chỉ áp dụng cho bài tặng (OFFER). Mặc định là OPTIMAL.',
  })
  @ValidateIf((post) => post.postType === PostTypes.OFFER)
  @IsOptional()
  @IsEnum(PostSelectionModes)
  selectionMode?: PostSelectionModes;
}

export class CreatePostBodyDto implements ICreatePostBodyDto {
  @ApiProperty({ type: () => CreatePostDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreatePostDto)
  post: ICreatePostDto;
}

export class CreatePostResponseDto implements ICreatePostResponseDto {
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;
}
