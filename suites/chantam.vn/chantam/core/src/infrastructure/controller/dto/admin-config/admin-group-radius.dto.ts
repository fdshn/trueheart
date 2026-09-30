import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class GroupRadiusRungDto {
  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({ description: 'Đơn vị MÉT.' })
  meters: number;

  @ApiProperty({
    description:
      'true khi bậc này chưa có khoá riêng và đang thừa hưởng defaultMeters.',
  })
  inherited: boolean;

  @ApiProperty({
    description:
      'true khi bậc này thật sự tạo được nhóm. Hôm nay chỉ Kim Cương — ba bậc dưới là số chờ sẵn, không phải vùng đang hoạt động.',
  })
  canCreateGroup: boolean;
}

export class GroupRadiusBoundsDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
}

export class GroupRadiusPolicyDto {
  @ApiProperty() defaultMeters: number;
  @ApiProperty() minMeters: number;
  @ApiProperty() maxMeters: number;

  @ApiProperty({
    type: () => GroupRadiusBoundsDto,
    description:
      'Cận TUYỆT ĐỐI của cột groups.radius_km, không nới bằng cấu hình. Nới thật thì phải sửa CHECK trong một migration.',
  })
  columnBoundsMeters: GroupRadiusBoundsDto;

  @ApiProperty({ type: () => [GroupRadiusRungDto] })
  ladder: GroupRadiusRungDto[];
}

export class GetGroupRadiusPolicyResponseDto {
  @ApiProperty({ type: () => GroupRadiusPolicyDto })
  radiusPolicy: GroupRadiusPolicyDto;
}

export class GroupRadiusRungInputDto {
  @ApiProperty({ enum: UserRanks, example: UserRanks.DIAMOND })
  @IsEnum(UserRanks)
  rank: UserRanks;

  @ApiProperty({ example: 10_000, description: 'Đơn vị MÉT.' })
  @IsInt()
  @Min(1)
  meters: number;
}

export class PublishGroupRadiusPolicyDto {
  @ApiPropertyOptional({
    example: 10_000,
    description:
      'Bán kính mặc định cho bậc chưa có số riêng. Đổi nó kéo theo mọi bậc đang thừa hưởng, và phép kiểm đơn điệu tính cả ảnh hưởng đó.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultMeters?: number;

  @ApiProperty({
    type: () => [GroupRadiusRungInputDto],
    description:
      'Chỉ cần gửi bậc muốn đổi. Phép kiểm đơn điệu chạy trên thang SAU KHI trộn với giá trị đang có — sửa một bậc cũng làm lệch quan hệ với ba bậc kia.',
  })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => GroupRadiusRungInputDto)
  ladder: GroupRadiusRungInputDto[];

  @ApiProperty({
    example: 'Bên A chốt thang bán kính 3/5/7/10 km, ngày 30/09',
    description: 'Bắt buộc — đây là thứ người đọc audit log sẽ thấy.',
  })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class PublishGroupRadiusPolicyBodyDto {
  @ApiProperty({ type: () => PublishGroupRadiusPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PublishGroupRadiusPolicyDto)
  radiusPolicy: PublishGroupRadiusPolicyDto;
}
