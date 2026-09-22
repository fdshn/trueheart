import {
  CandidateSelectionCriteria,
  DefaultCandidateSelectionOrder,
} from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class CandidateSelectionCriterionDto {
  @ApiProperty({ enum: CandidateSelectionCriteria })
  code: CandidateSelectionCriteria;

  @ApiProperty({ minimum: 1, description: 'Vị trí ưu tiên, bắt đầu từ 1.' })
  priority: number;
}

export class GetCandidateSelectionResponseDto {
  @ApiProperty({
    type: () => [CandidateSelectionCriterionDto],
    description:
      'Thứ tự ĐANG CÓ HIỆU LỰC, đã chuẩn hoá: mã lạ bị bỏ và tiêu chí thiếu được bổ sung vào cuối. CMS nên hiển thị danh sách này chứ không phải giá trị thô trong config.',
  })
  order: CandidateSelectionCriterionDto[];

  @ApiProperty({
    description:
      'false khi chưa ai cấu hình và hệ thống đang chạy theo thứ tự mặc định.',
  })
  isConfigured: boolean;
}

export class SetCandidateSelectionDto {
  @ApiProperty({
    enum: CandidateSelectionCriteria,
    isArray: true,
    example: DefaultCandidateSelectionOrder,
    description:
      'Phần tử đầu là tiêu chí số 1. Không cần khai đủ — tiêu chí thiếu tự xuống cuối theo thứ tự mặc định.',
  })
  @IsArray()
  @ArrayMinSize(1)
  // Trần bằng đúng số tiêu chí đang có: gửi dài hơn nghĩa là có mã trùng hoặc
  // mã lạ, và im lặng cắt bớt sẽ khiến Admin tưởng đã lưu đúng thứ họ gõ.
  @ArrayMaxSize(Object.keys(CandidateSelectionCriteria).length)
  @IsEnum(CandidateSelectionCriteria, { each: true })
  order: CandidateSelectionCriteria[];

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Ưu tiên người ở gần để giảm chi phí đi lại',
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetCandidateSelectionBodyDto {
  @ApiProperty({ type: () => SetCandidateSelectionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetCandidateSelectionDto)
  selection: SetCandidateSelectionDto;
}

export class SetCandidateSelectionResponseDto extends GetCandidateSelectionResponseDto {}
