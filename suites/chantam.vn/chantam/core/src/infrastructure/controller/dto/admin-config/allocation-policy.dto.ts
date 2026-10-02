import {
  AllocationDistanceRule,
  AllocationDistanceRules,
  DefaultAllocationPolicy,
  MaxAllocationSuggestions,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AllocationMatchWeightsDto {
  @ApiProperty({
    minimum: 0,
    example: 5,
    description:
      'Trọng số "cùng danh mục". Không cần cộng đúng 1 — ba số được chia lại theo tỉ lệ, nên `5/3/2` và `0.5/0.3/0.2` là cùng một chính sách.',
  })
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  sameCategory: number;

  @ApiProperty({ minimum: 0, example: 3 })
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  keyword: number;

  @ApiProperty({ minimum: 0, example: 2 })
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  proximity: number;
}

export class AllocationPolicyDto {
  @ApiProperty({
    description:
      '`true` thì cùng danh mục là điều kiện BẮT BUỘC. `false` thì chỉ cần cùng danh mục HOẶC trùng từ khoá — đây là hành vi mặc định, giữ đúng thứ hệ thống làm từ trước khi có đường cấu hình này.',
  })
  categoryMatchRequired: boolean;

  @ApiProperty({ enum: AllocationDistanceRules })
  distanceRule: AllocationDistanceRule;

  @ApiProperty()
  keywordMatchEnabled: boolean;

  @ApiProperty({
    description:
      'CHƯA HIỆN THỰC — `PUT` sẽ từ chối nếu đặt `true`. Trường có mặt để đúng schema đặc tả, không phải để bật.',
  })
  autoCreateTransaction: boolean;

  @ApiProperty({ minimum: 1, maximum: MaxAllocationSuggestions })
  maxSuggestions: number;

  @ApiProperty({
    type: () => AllocationMatchWeightsDto,
    description:
      'Trọng số ĐÃ CHUẨN HOÁ về tổng bằng 1 — tức con số hệ thống thật sự dùng, không phải con số Admin gõ vào.',
  })
  weights: AllocationMatchWeightsDto;
}

export class GetAllocationPolicyResponseDto {
  @ApiProperty({ type: () => AllocationPolicyDto })
  policy: AllocationPolicyDto;

  @ApiProperty({
    description:
      '`false` khi chưa ai publish. Khi đó hệ thống chạy theo mặc định, và mặc định đó trùng khít hành vi trước khi có đường cấu hình này — nên `false` KHÔNG có nghĩa là tính năng đang tắt.',
  })
  isConfigured: boolean;
}

export class SetAllocationPolicyDto {
  @ApiProperty({ example: DefaultAllocationPolicy.categoryMatchRequired })
  @IsBoolean()
  categoryMatchRequired: boolean;

  @ApiProperty({
    enum: AllocationDistanceRules,
    example: DefaultAllocationPolicy.distanceRule,
    description:
      '`FILTER_ONLY` chỉ dùng bán kính client gửi; `RANK_ONLY` chỉ dùng hạn mức `DISCOVERY_RADIUS` theo hạng; `RANK_OR_FILTER` lấy cái NỚI HƠN của hai. Cả ba vẫn bị kẹp vào cận kỹ thuật 100m–50km.',
  })
  @IsIn(AllocationDistanceRules as readonly string[])
  distanceRule: AllocationDistanceRule;

  @ApiProperty({ example: DefaultAllocationPolicy.keywordMatchEnabled })
  @IsBoolean()
  keywordMatchEnabled: boolean;

  @ApiProperty({
    example: false,
    description: 'Phải là `false` — bật lên bị từ chối vì chưa hiện thực.',
  })
  @IsBoolean()
  autoCreateTransaction: boolean;

  @ApiProperty({
    minimum: 1,
    maximum: MaxAllocationSuggestions,
    example: DefaultAllocationPolicy.maxSuggestions,
    description: `Trần ${MaxAllocationSuggestions} bằng đúng kích cỡ rổ ứng viên truy vấn kéo về; đặt cao hơn là hứa nhiều hơn thứ câu truy vấn trả được.`,
  })
  @IsInt()
  @Min(1)
  @Max(MaxAllocationSuggestions)
  maxSuggestions: number;

  @ApiProperty({ type: () => AllocationMatchWeightsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AllocationMatchWeightsDto)
  weights: AllocationMatchWeightsDto;

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Thắt buộc cùng danh mục để giảm gợi ý lệch nhu cầu',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetAllocationPolicyBodyDto {
  @ApiProperty({ type: () => SetAllocationPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetAllocationPolicyDto)
  allocation: SetAllocationPolicyDto;
}

export class SetAllocationPolicyResponseDto extends GetAllocationPolicyResponseDto {}
