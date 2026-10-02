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

  @ApiProperty({
    nullable: true,
    example: 92.3,
    description:
      'Tỷ lệ hoàn tất trong các giao dịch ĐÃ KẾT THÚC. Mẫu số là `completed + cancelled`, KHÔNG phải tổng mọi giao dịch — một giao dịch đang giao chưa thành hay thất bại, đưa nó vào mẫu số là kéo tỷ lệ xuống bằng những ca chưa có kết luận. `null` khi chưa có giao dịch nào kết thúc: `0` ở đó nghĩa là "thử rồi và trượt hết", khác hẳn "chưa có gì để đo".',
  })
  completionRatePercent: number | null;

  @ApiProperty({
    description:
      'Mẫu số của tỷ lệ trên. Trả kèm vì một tỷ lệ trơ không kiểm được: 50% của hai giao dịch và 50% của hai nghìn là hai câu chuyện khác nhau.',
  })
  completionDenominator: number;
}

class RankThresholdBucketDto {
  @ApiProperty() rank: string;
  @ApiProperty() thresholdPoints: number;
  @ApiProperty() users: number;
}

class DashboardPointsDto {
  @ApiProperty({
    description:
      'Tổng số dư đang lưu hành — số điểm hệ thống đang nợ người dùng.',
  })
  totalBalance: number;

  @ApiProperty() issuedInWindow: number;

  @ApiProperty({ description: 'Đã tiêu trong kỳ, trả về số DƯƠNG.' })
  spentInWindow: number;

  @ApiProperty({
    type: () => [RankThresholdBucketDto],
    description:
      'Phân bổ Điểm Cống hiến, cắt theo đúng `rank_tiers.threshold_points` đang hiệu lực — không theo mốc tự nghĩ ra. Nhờ vậy so sánh được trực tiếp với `users.byRank`, và khoảng LỆCH giữa hai bảng mới là thứ đáng xem: `byRank` là hạng hệ thống đang cấp quyền theo, bảng này là hạng mà số dư nói lẽ ra phải là.',
  })
  byRankThreshold: RankThresholdBucketDto[];
}

class DashboardGroupsDto {
  @ApiProperty() total: number;
  @ApiProperty() newInWindow: number;
  @ApiProperty() members: number;
  @ApiProperty() newMembersInWindow: number;
}

class DashboardAffiliateDto {
  @ApiProperty({
    description:
      'Trường quan trọng nhất của khối này. Bộ máy affiliate ship ở trạng thái TẮT, nên mọi con số dưới đây là 0 — và `0` không phân biệt được "chưa ai publish" với "đã publish mà không có hoạt động". Thiếu cờ này thì Admin đọc một bảng toàn số 0 rồi đi tìm lỗi ở chỗ không có lỗi.',
  })
  policyPublished: boolean;

  @ApiProperty() policyEnabled: boolean;
  @ApiProperty() eventsEligible: number;

  @ApiProperty({ description: 'Sự kiện bị loại vì ngoài bán kính vùng nhóm.' })
  eventsRejectedGeo: number;

  @ApiProperty({ description: 'Sự kiện không xác định được toạ độ nào.' })
  eventsNoLocation: number;

  @ApiProperty() pointsAwarded: number;
  @ApiProperty() pointsReversed: number;
}

class DashboardAccuracyDto {
  @ApiProperty({
    description:
      'Ngưỡng đang dùng, đọc từ `accuracy.giver`. Trả kèm vì không có nó thì `belowThreshold` là một con số không ai đọc được là dưới bao nhiêu — và Admin đổi được ngưỡng đó.',
  })
  thresholdPercent: number;

  @ApiProperty() minSamples: number;

  @ApiProperty({
    description:
      'Số người đã đủ mẫu để tính — dưới mức đó thì phần trăm không có nghĩa.',
  })
  measured: number;

  @ApiProperty() belowThreshold: number;

  @ApiProperty({
    description:
      'Đã gắn cờ chờ Admin xem lại — xem `GET /admin/users?accuracyReviewRequired=true`.',
  })
  reviewRequired: number;
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

  @ApiProperty({ type: () => DashboardPointsDto }) points: DashboardPointsDto;
  @ApiProperty({ type: () => DashboardGroupsDto }) groups: DashboardGroupsDto;

  @ApiProperty({ type: () => DashboardAffiliateDto })
  affiliate: DashboardAffiliateDto;

  @ApiProperty({ type: () => DashboardAccuracyDto })
  accuracy: DashboardAccuracyDto;

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
