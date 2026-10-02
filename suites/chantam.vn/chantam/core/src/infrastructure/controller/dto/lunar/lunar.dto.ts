import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LunarHolidayDto {
  @ApiProperty({ minimum: 1, maximum: 12, example: 7 })
  @IsInt()
  @Min(1)
  @Max(12)
  lunarMonth: number;

  @ApiProperty({
    minimum: 1,
    maximum: 30,
    example: 15,
    description: 'Tháng âm lịch có 29 hoặc 30 ngày, không bao giờ 31.',
  })
  @IsInt()
  @Min(1)
  @Max(30)
  lunarDay: number;

  @ApiProperty({ example: 'Đại lễ Vu Lan Báo Hiếu', maxLength: 150 })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    default: true,
    description:
      'Tắt một ngày lễ bằng cờ này thay vì xoá khỏi danh mục — xoá rồi muốn bật lại phải nhập lại từ đầu.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LunarHolidayResponseDto extends LunarHolidayDto {
  @ApiProperty({
    description:
      'Thứ tự hiển thị, do VỊ TRÍ trong mảng khi lưu quyết định — không nhận từ client, vì hai dòng cùng số là chuyện sẽ xảy ra.',
  })
  sortOrder: number;
}

export class ReplaceLunarHolidaysDto {
  @ApiProperty({
    type: () => [LunarHolidayDto],
    description:
      'Thay TOÀN BỘ danh mục. Không được rỗng — một danh mục rỗng nghĩa là app không còn huy hiệu nào, mà UC-LUNAR-01 gọi lịch âm là chức năng BẮT BUỘC của Phase 1.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LunarHolidayDto)
  holidays: LunarHolidayDto[];
}

export class ReplaceLunarHolidaysBodyDto {
  @ApiProperty({ type: () => ReplaceLunarHolidaysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReplaceLunarHolidaysDto)
  lunar: ReplaceLunarHolidaysDto;
}

export class LunarHolidayListResponseDto {
  @ApiProperty({ type: () => [LunarHolidayResponseDto] })
  holidays: LunarHolidayResponseDto[];
}

export class LunarTodayResponseDto {
  @ApiProperty({
    example: '2026-08-27',
    description: 'Ngày dương lịch theo UTC+7, KHÔNG theo múi giờ của máy chạy.',
  })
  solarDate: string;

  @ApiProperty() lunarDay: number;
  @ApiProperty() lunarMonth: number;
  @ApiProperty() lunarYear: number;

  @ApiProperty({
    description: 'Tháng nhuận là tháng LẶP LẠI của tháng trước nó.',
  })
  isLeapMonth: boolean;

  @ApiProperty({ example: 'Bính Ngọ' }) canChi: string;

  @ApiProperty({
    example: '27/08/2026 - 15/07 [Bính Ngọ]',
    description: 'Chuỗi header đúng khuôn UC-LUNAR-01 bước 2.',
  })
  header: string;

  @ApiProperty({
    nullable: true,
    enum: ['FULL_MOON', 'NEW_MOON'],
    description:
      '`FULL_MOON` cho ngày 14 và 15, `NEW_MOON` cho ngày 30 và 1 — mỗi mốc gồm HAI ngày âm lịch đúng như đặc tả nêu, vì lễ chùa diễn ra cả đêm trước.',
  })
  observance: 'FULL_MOON' | 'NEW_MOON' | null;

  @ApiProperty({
    nullable: true,
    description:
      'Biểu ngữ UC-LUNAR-01 bước 4, dựng ở backend. Để client tự ghép là đưa nội dung sản phẩm vào bản app — sửa một dấu phẩy phải chờ Store duyệt.',
  })
  banner: string | null;

  @ApiProperty({ type: () => LunarHolidayResponseDto, nullable: true })
  holiday: LunarHolidayResponseDto | null;
}
