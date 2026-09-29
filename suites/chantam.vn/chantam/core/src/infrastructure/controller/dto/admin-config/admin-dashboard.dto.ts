import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdminDashboardQueryDto {
  @ApiPropertyOptional({
    default: 30,
    minimum: 1,
    maximum: 365,
    description:
      'Cửa sổ cho những con số "trong kỳ". Giá trị ngoài khoảng được KẸP chứ không trả lỗi: nó đến từ một ô nhập trên màn hình Admin, và gõ nhầm 99999 nên ra số liệu của cửa sổ dài nhất còn hợp lý.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;
}

class RankCountDto {
  @ApiProperty() rank: string;
  @ApiProperty() total: number;
}

class CategoryCountDto {
  @ApiProperty() category: string;
  @ApiProperty() total: number;
}

class DashboardUsersDto {
  @ApiProperty() total: number;
  @ApiProperty({ description: 'Người dùng mới trong cửa sổ.' })
  newInWindow: number;

  @ApiProperty({
    description:
      'Số người còn ở VIEWER — đo PHỄU onboarding. VIEWER nghĩa là chưa hoàn tất, và chưa hoàn tất thì không đăng được bài; tỷ lệ cao nghĩa là người ta đến rồi mắc ở đâu đó trên đường vào.',
  })
  viewers: number;

  @ApiProperty({
    type: () => [RankCountDto],
    description:
      'Đọc từ chính `users.rank`, KHÔNG tính lại từ điểm: bảng này phải nói đúng cái mà hệ thống đang DÙNG để cấp quyền, kể cả khi nó đang lệch với điểm. Tính lại sẽ che mất chính xác loại lệch cần thấy.',
  })
  byRank: RankCountDto[];
}

class DashboardPostsDto {
  @ApiProperty() published: number;
  @ApiProperty() reserved: number;
  @ApiProperty() completed: number;
  @ApiProperty({ type: () => [CategoryCountDto] })
  byCategory: CategoryCountDto[];
}

class DashboardTransactionsDto {
  @ApiProperty({ description: 'Đang chạy — ACCEPTED hoặc DELIVERING.' })
  live: number;

  @ApiProperty() completed: number;
  @ApiProperty() completedInWindow: number;
  @ApiProperty() cancelled: number;
}

class DashboardMediaDto {
  @ApiProperty({
    description:
      'SỐ OBJECT, không phải byte. Không bảng nào lưu kích thước — `post_media` có `r2_key`, `chat_message_media` có `storage_key`, và hết. Đo byte thật đòi gọi ra storage cho từng object; trả số object và gọi đúng tên nó, thay vì quy đổi bằng một kích thước trung bình bịa ra.',
  })
  postObjects: number;

  @ApiProperty() chatObjects: number;
}

class DashboardQueuesDto {
  @ApiProperty({ description: 'Báo xấu đang PENDING hoặc IN_REVIEW.' })
  openReports: number;

  @ApiProperty({ description: 'Bình luận đang chờ duyệt.' })
  pendingComments: number;
}

export class AdminDashboardDto {
  @ApiProperty() windowDays: number;
  @ApiProperty({ type: () => DashboardUsersDto }) users: DashboardUsersDto;
  @ApiProperty({ type: () => DashboardPostsDto }) posts: DashboardPostsDto;

  @ApiProperty({ type: () => DashboardTransactionsDto })
  transactions: DashboardTransactionsDto;

  @ApiProperty({ type: () => DashboardMediaDto }) media: DashboardMediaDto;

  @ApiProperty({
    type: () => DashboardQueuesDto,
    description:
      'Khối duy nhất trong bảng mà Admin phải LÀM GÌ ĐÓ với nó, không chỉ để biết.',
  })
  queues: DashboardQueuesDto;
}

export class AdminDashboardResponseDto {
  @ApiProperty({ type: () => AdminDashboardDto }) dashboard: AdminDashboardDto;
}
