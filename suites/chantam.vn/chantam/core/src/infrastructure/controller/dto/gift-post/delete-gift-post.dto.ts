import {
  IDeleteGiftPostParamsDto,
  IDeleteGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DeleteGiftPostParamsDto implements IDeleteGiftPostParamsDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Định danh bài đăng (UUID), lấy từ kết quả tạo bài hoặc từ bảng tin.',
  })
  @IsUUID()
  giftPostId: string;
}

export class DeleteGiftPostResponseDto implements IDeleteGiftPostResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Bài vừa được gỡ.' })
  giftPostId: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Thời điểm gỡ bài. Đây là xoá MỀM: dữ liệu vẫn nằm trong database để giữ ' +
      'lịch sử giao dịch, chỉ không còn hiện ra ở mọi endpoint đọc.',
  })
  deletedAt: Date;
}
