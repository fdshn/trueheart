import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostShareCodeLength,
  PostTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetPostParamsDto,
  IGetPostResponseDto,
  IGiftRequestDto,
  IPostAuthorDto,
  IPostContactInfoDto,
  IPostMyTransactionDto,
  IPostShareLinkDto,
  IPublicPostMediaDto,
  IResolvedPostShareDto,
  IResolvePostShareParamsDto,
  IResolvePostShareResponseDto,
  PostDetailCta,
} from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { PostEntity } from '../../../entity/post.entity';
import { GiftRequestDto } from '../gift-request/gift-request.dto';

export class GetPostParamsDto implements IGetPostParamsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh canonical post.',
  })
  @IsUUID()
  postId: string;
}

export class PostShareLinkDto implements IPostShareLinkDto {
  @ApiProperty({ example: 'K7MQ2XRP9A' }) shareCode: string;
  @ApiProperty({
    example: '/p/K7MQ2XRP9A',
    description: 'Đường dẫn tương đối — app bắt cùng đường này làm deep link.',
  })
  sharePath: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://chantam.vn/p/K7MQ2XRP9A',
    description: '`null` khi web công khai chưa cấu hình.',
  })
  shareUrl: string | null;
}

export class ResolvePostShareParamsDto implements IResolvePostShareParamsDto {
  @ApiProperty({
    example: 'K7MQ2XRP9A',
    description: `Mã chia sẻ ${PostShareCodeLength} ký tự; không phân biệt hoa thường.`,
  })
  @IsString()
  @MaxLength(32)
  shareCode: string;
}

export class ResolvedPostShareDto implements IResolvedPostShareDto {
  @ApiProperty({ format: 'uuid' }) postId: string;
  @ApiProperty({ enum: PostTypes }) postType: PostTypes;
  @ApiProperty({ enum: GiftPostStatuses }) status: GiftPostStatuses;
}

export class ResolvePostShareResponseDto implements IResolvePostShareResponseDto {
  @ApiProperty({ type: () => ResolvedPostShareDto })
  post: IResolvedPostShareDto;
}

export class PostAuthorDto implements IPostAuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiPropertyOptional() avatarUrl?: string | null;
  @ApiPropertyOptional() rank?: string;
  @ApiPropertyOptional({ description: 'Thời điểm tạo tài khoản.' })
  joinedAt?: Date | string | null;
}

export class PostContactInfoDto implements IPostContactInfoDto {
  @ApiPropertyOptional({ example: '0901234567' }) phone?: string | null;
  @ApiPropertyOptional({ example: '123 Nguyễn Huệ, Quận 1, TP.HCM' })
  address?: string | null;
}

export class PublicPostMediaDto implements IPublicPostMediaDto {
  @ApiProperty() id: number;
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty() sortOrder: number;
}

export class PostMyTransactionDto implements IPostMyTransactionDto {
  @ApiProperty({ format: 'uuid' }) transactionId: string;
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Request sinh ra lượt trao. `null` ở dữ liệu cũ.',
  })
  requestId: string | null;
  @ApiProperty({ enum: ['ACCEPTED', 'DELIVERING', 'COMPLETED', 'CANCELLED'] })
  status: 'ACCEPTED' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
  @ApiProperty({ example: 2 }) quantity: number;
  @ApiProperty({
    enum: ['GIVER', 'RECEIVER'],
    description: 'Vai của người xem',
  })
  myRole: 'GIVER' | 'RECEIVER';
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  handedOverAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;
}

export class GetPostResponseDto implements IGetPostResponseDto {
  @ApiPropertyOptional({
    description: 'Quyền sửa của chủ bài theo trạng thái và giao dịch thực tế.',
  })
  canEdit?: boolean;
  @ApiProperty({ type: () => PostEntity })
  post: IPostEntity;

  @ApiPropertyOptional({ type: () => PostAuthorDto })
  author?: IPostAuthorDto | null;

  @ApiProperty({ type: () => [PublicPostMediaDto] })
  media: IPublicPostMediaDto[];

  @ApiProperty({
    description: 'Toạ độ luôn bị làm nhiễu với kênh đọc công khai.',
  })
  isLocationApproximate: boolean;

  @ApiPropertyOptional({
    example: 3,
    description: 'Số lượng yêu cầu đang hoạt động',
  })
  requestCount?: number;

  @ApiPropertyOptional({
    enum: GiftRequestStatuses,
    nullable: true,
    description: 'Trạng thái yêu cầu của người dùng hiện tại',
  })
  myRequestStatus?: GiftRequestStatuses | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Người dùng hiện tại đã gửi yêu cầu chưa',
  })
  hasRequested?: boolean;

  @ApiPropertyOptional({ example: 10, description: 'Tổng số món của bài' })
  totalQuantity?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Số món còn nhận request',
  })
  remainingQuantity?: number;

  @ApiPropertyOptional({
    type: () => GiftRequestDto,
    nullable: true,
    description:
      'Request đang hiệu lực của người xem: PENDING / STANDBY, hoặc ACCEPTED khi lượt trao của nó còn chạy.',
  })
  myActiveRequest?: IGiftRequestDto | null;

  @ApiPropertyOptional({
    type: () => GiftRequestDto,
    nullable: true,
    description:
      'Request MỚI NHẤT của người xem (mọi trạng thái). Rút rồi gửi lại là request mới.',
  })
  myLatestRequest?: IGiftRequestDto | null;

  @ApiPropertyOptional({
    type: () => PostMyTransactionDto,
    nullable: true,
    description:
      'Lượt trao đang chạy (ACCEPTED / DELIVERING) của người xem — nguồn của process line.',
  })
  myActiveTransaction?: IPostMyTransactionDto | null;

  @ApiPropertyOptional({
    type: () => [PostMyTransactionDto],
    description:
      'Mọi lượt trao của người xem trên bài, mới nhất trước. Không có lượt của người khác.',
  })
  myTransactions?: IPostMyTransactionDto[];

  @ApiPropertyOptional({
    description: 'Người xem gửi được request mới ngay bây giờ.',
  })
  canRequest?: boolean;

  @ApiPropertyOptional({
    enum: [
      'OWNER',
      'REQUEST',
      'WAITING',
      'STANDBY',
      'TRANSACTION',
      'COMPLETED',
      'UNAVAILABLE',
    ],
    description:
      'Nút chính backend đã tính: OWNER (chủ bài), REQUEST (gửi request — khách thì mời đăng nhập), ' +
      'WAITING (đang chờ duyệt — rút / giảm số lượng), STANDBY (thiếu hàng — giảm số lượng / rút / chờ, xem `myActiveRequest.statusReason`), ' +
      'TRANSACTION (lượt trao đang chạy), COMPLETED (bài đã trao xong), UNAVAILABLE (không nhận request).',
  })
  cta?: PostDetailCta;

  @ApiPropertyOptional({
    type: () => PostContactInfoDto,
    nullable: true,
    description:
      'Thông tin liên lạc của người cho (chỉ hiển thị khi là receiver được chọn)',
  })
  contactInfo?: IPostContactInfoDto | null;

  @ApiProperty({ example: 12, description: 'Số người đã bày tỏ cảm xúc' })
  reactionCount: number;

  @ApiProperty({ example: 3, description: 'Số bình luận gốc còn hiện' })
  commentCount: number;

  @ApiProperty({ example: 1, description: 'Số lần chia sẻ đã ghi nhận' })
  shareCount: number;

  @ApiPropertyOptional({
    enum: ReactionKinds,
    nullable: true,
    description:
      'Cảm xúc của người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập.',
  })
  myReaction: ReactionKinds | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Phân bổ theo loại cảm xúc. Chỉ có trên màn chi tiết — bảng tin chỉ cần tổng số.',
    example: { LIKE: 8, LOVE: 4 },
  })
  reactionBreakdown: Partial<Record<ReactionKinds, number>>;

  @ApiProperty({ type: () => PostShareLinkDto })
  share: IPostShareLinkDto;
}
