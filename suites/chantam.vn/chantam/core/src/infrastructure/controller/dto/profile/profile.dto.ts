import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IConfirmEmailVerificationBodyDto,
  IConfirmEmailVerificationDto,
  IConfirmEmailVerificationResponseDto,
  IConfirmPhoneVerificationBodyDto,
  IConfirmPhoneVerificationDto,
  IConfirmPhoneVerificationResponseDto,
  IEntitlementsSummaryDto,
  IGetOwnProfileResponseDto,
  IGiverAccuracySummaryDto,
  IOwnProfileDto,
  IPointSummaryDto,
  IProfileReferrerDto,
  IRankSummaryDto,
  IRequestEmailVerificationResponseDto,
  IRequestPhoneVerificationResponseDto,
  IReviewRatingSummaryDto,
  IUpdateOwnProfileBodyDto,
  IUpdateOwnProfileDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { EntitlementsSummaryDto } from '../entitlement';
import { GeoPointDto } from '../geo-point.dto';
import { PointSummaryDto } from '../point';
import { RankSummaryDto } from '../rank';
import { ReferralSummaryDto } from '../referral';

/**
 * Chỉ loại bỏ thứ rõ ràng không phải số điện thoại.
 *
 * Nới hơn E.164 có chủ ý: người dùng gõ `091 234 5678` hay `(091) 234-5678` là
 * chuyện thường, và chặn ở đây thì họ nhận "số không hợp lệ" cho một số hoàn
 * toàn đúng. Việc nắn về E.164 và phán quyết cuối cùng nằm ở
 * `normalizePhoneNumber` trong use case — một nơi duy nhất, dùng chung cho mọi
 * đường vào.
 */
const PhonePattern = /^[+0-9][0-9\s.\-()]{6,24}$/;

export class UpdateOwnProfileDto implements IUpdateOwnProfileDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 100,
    nullable: true,
    description: 'Họ tên hiển thị. Bỏ trống thì giữ nguyên.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  fullName?: string | null;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    description:
      'Key trả về từ `PATCH /api/v1/profile/me/avatar-upload` sau khi client PUT thành công. Server xác minh object thuộc đúng tài khoản rồi mới tạo URL avatar; không nhận URL tuỳ ý.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  avatarKey?: string | null;

  @ApiPropertyOptional({
    format: 'email',
    maxLength: 255,
    nullable: true,
    description:
      'Email dùng để đăng nhập và nhận mã khôi phục. Không phân biệt hoa thường.',
  })
  @IsOptional()
  @IsEmail()
  @Length(1, 255)
  email?: string | null;

  @ApiPropertyOptional({
    example: '+84912345678',
    nullable: true,
    description:
      'Nhận cả `0912345678`, `+84912345678` và `091 234 5678` — server tự nắn về E.164 (`+84912345678`) rồi mới lưu và mới so trùng. Đổi số sẽ huỷ trạng thái xác minh cũ.',
  })
  @IsOptional()
  @IsString()
  @Matches(PhonePattern, { message: 'phone phải là số điện thoại hợp lệ' })
  phone?: string | null;

  @ApiPropertyOptional({
    type: () => GeoPointDto,
    nullable: true,
    description:
      'Vị trí mặc định của CHÍNH CHỦ khi tạo bài. Khác Current GPS; không bao giờ lộ qua profile công khai. ' +
      'Bỏ trống để giữ nguyên, gửi null để xoá hẳn.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  defaultLocation?: GeoPointDto | null;
}

export class UpdateOwnProfileBodyDto implements IUpdateOwnProfileBodyDto {
  @ApiProperty({
    type: () => UpdateOwnProfileDto,
    description: 'Chỉ gửi trường muốn đổi; trường không gửi giữ nguyên.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateOwnProfileDto)
  profile: IUpdateOwnProfileDto;
}

export class OwnProfileDto implements IOwnProfileDto {
  @ApiProperty({ format: 'uuid', description: 'Định danh tài khoản.' })
  userId: string;

  @ApiProperty({ description: 'Username không đổi sau đăng ký.' })
  username: string;

  @ApiProperty({ nullable: true, description: 'Họ tên chủ tài khoản.' })
  fullName: string | null;

  @ApiProperty({ nullable: true, description: 'URL avatar chủ tài khoản.' })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Email chỉ chủ tài khoản xem được.',
  })
  email: string | null;

  @ApiProperty({
    nullable: true,
    description: 'SĐT chỉ chủ tài khoản xem được.',
  })
  phone: string | null;

  @ApiProperty({
    type: () => GeoPointDto,
    nullable: true,
    description: 'Vị trí mặc định chỉ chủ tài khoản xem được.',
  })
  defaultLocation: GeoPointDto | null;

  @ApiProperty({ description: 'Hạng hiện tại từ database.' })
  rank: UserRanks;

  @ApiProperty({ description: 'Trạng thái hiện tại từ database.' })
  status: UserStatuses;

  @ApiProperty({ description: 'SĐT hiện tại đã xác minh chưa.' })
  phoneVerified: boolean;

  @ApiProperty({
    description:
      'Email hiện tại đã xác minh chưa. Chỉ email đã xác minh mới dùng để khôi phục mật khẩu được.',
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Đủ Họ tên, avatar, SĐT và email để đăng bài chưa.',
  })
  profileComplete: boolean;

  @ApiProperty({
    type: () => ReferralSummaryDto,
    nullable: true,
    description: 'Thông tin mã giới thiệu và thống kê của chính chủ.',
  })
  referral?: ReferralSummaryDto | null;

  @ApiProperty({
    type: () => ReferrerProfileDto,
    nullable: true,
    description: 'Thông tin người đã giới thiệu tài khoản này.',
  })
  referrer?: IProfileReferrerDto | null;

  @ApiProperty({
    type: () => PointSummaryDto,
    nullable: true,
    description: 'Số dư tiêu được và điểm tích luỹ, trùng với /points/me.',
  })
  point?: IPointSummaryDto | null;

  @ApiProperty({
    type: () => RankSummaryDto,
    nullable: true,
    description: 'Tiến độ hạng và chu kỳ duy trì, trùng với /ranks/me.',
  })
  rankProgress?: IRankSummaryDto | null;

  @ApiProperty({
    type: () => EntitlementsSummaryDto,
    nullable: true,
    description: 'Quyền và hạn mức theo hạng, trùng với /me/entitlements.',
  })
  entitlements?: IEntitlementsSummaryDto | null;

  @ApiProperty({
    type: () => GiverAccuracySummaryDto,
    nullable: true,
    description:
      'Độ chính xác mô tả khi tặng (F43). Cố ý KHÔNG kèm cờ xem xét: cờ là tín hiệu để Admin nhìn qua, không phải phán quyết.',
  })
  accuracy?: IGiverAccuracySummaryDto | null;

  @ApiProperty({
    type: () => ReviewRatingSummaryDto,
    nullable: true,
    description: 'Điểm sao 1–5 theo từng vai (F42).',
  })
  rating?: IReviewRatingSummaryDto | null;
}

export class ReviewRatingSideDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.6,
    description:
      'Điểm trung bình, một chữ số thập phân. `null` khi chưa đủ số mẫu tối thiểu — thang 1–5 chỉ có năm bậc nên làm tròn về số nguyên sẽ bỏ mất gần một phần tư dải giá trị.',
  })
  average: number | null;

  @ApiProperty({ example: 12, description: 'Số lượt chấm đã tính vào.' })
  samples: number;
}

export class ReviewRatingSummaryDto implements IReviewRatingSummaryDto {
  @ApiProperty({
    type: () => ReviewRatingSideDto,
    description: 'Điểm khi người này TẶNG — do những người NHẬN chấm.',
  })
  asGiver: { average: number | null; samples: number };

  @ApiProperty({
    type: () => ReviewRatingSideDto,
    description: 'Điểm khi người này NHẬN — do những người TẶNG chấm.',
  })
  asReceiver: { average: number | null; samples: number };

  @ApiProperty({
    example: 3,
    description:
      'Số mẫu tối thiểu để điểm bắt đầu được công bố (Admin chỉnh được qua `rating.display`).',
  })
  minSamples: number;
}

export class GiverAccuracySummaryDto implements IGiverAccuracySummaryDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92,
    description: '`null` khi chưa đủ số mẫu tối thiểu.',
  })
  percent: number | null;

  @ApiProperty({ example: 7, description: 'Số lượt đánh giá đã tính vào.' })
  samples: number;

  @ApiProperty({
    example: 5,
    description:
      'Số mẫu tối thiểu để chỉ số bắt đầu có nghĩa (Admin chỉnh được).',
  })
  minSamples: number;
}

export class ReferrerProfileDto implements IProfileReferrerDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh người đã giới thiệu.',
  })
  userId: string;

  @ApiProperty({ description: 'Username của người đã giới thiệu.' })
  username: string;

  @ApiProperty({ nullable: true, description: 'Họ tên người đã giới thiệu.' })
  fullName: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Avatar của người đã giới thiệu.',
  })
  avatarUrl: string | null;
}

export class GetOwnProfileResponseDto implements IGetOwnProfileResponseDto {
  @ApiProperty({ type: () => OwnProfileDto })
  profile: IOwnProfileDto;
}

export class UpdateOwnProfileResponseDto implements IUpdateOwnProfileResponseDto {
  @ApiProperty({ type: () => OwnProfileDto })
  profile: IOwnProfileDto;
}

export class ConfirmPhoneVerificationDto implements IConfirmPhoneVerificationDto {
  @ApiProperty({
    example: '048213',
    description: 'OTP SMS 6 chữ số gửi tới SĐT hiện tại.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp phải là 6 chữ số' })
  otp: string;
}

export class ConfirmPhoneVerificationBodyDto implements IConfirmPhoneVerificationBodyDto {
  @ApiProperty({ type: () => ConfirmPhoneVerificationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmPhoneVerificationDto)
  verification: ConfirmPhoneVerificationDto;
}

export class RequestPhoneVerificationResponseDto implements IRequestPhoneVerificationResponseDto {
  @ApiProperty({ example: 300, description: 'Số giây OTP còn hiệu lực.' })
  expiresInSeconds: number;
}

export class ConfirmPhoneVerificationResponseDto implements IConfirmPhoneVerificationResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Thời điểm SĐT được xác minh.',
  })
  verifiedAt: Date;
}

export class ConfirmEmailVerificationDto implements IConfirmEmailVerificationDto {
  @ApiProperty({
    example: '048213',
    description: 'OTP 6 chữ số gửi tới địa chỉ email hiện tại trong hồ sơ.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp phải là 6 chữ số' })
  otp: string;
}

export class ConfirmEmailVerificationBodyDto implements IConfirmEmailVerificationBodyDto {
  @ApiProperty({ type: () => ConfirmEmailVerificationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmEmailVerificationDto)
  verification: ConfirmEmailVerificationDto;
}

export class RequestEmailVerificationResponseDto implements IRequestEmailVerificationResponseDto {
  @ApiProperty({
    example: 'ngu***@gmail.com',
    description:
      'Địa chỉ đã che bớt, đủ để chủ tài khoản nhận ra mình gõ đúng chưa.',
  })
  maskedEmail: string;

  @ApiProperty({ example: 300, description: 'Số giây OTP còn hiệu lực.' })
  expiresInSeconds: number;
}

export class ConfirmEmailVerificationResponseDto implements IConfirmEmailVerificationResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Thời điểm email được xác minh.',
  })
  verifiedAt: Date;
}

export class RequestAvatarUploadDto {
  @ApiProperty({
    example: 'image/webp',
    description: 'MIME ảnh: JPEG, PNG hoặc WebP.',
  })
  @IsString()
  contentType: string;

  @ApiProperty({
    example: 123456,
    description: 'Kích thước file byte, tối đa 5 MB.',
  })
  @Type(() => Number)
  @IsInt()
  contentLength: number;
}

export class RequestAvatarUploadResponseDto {
  @ApiProperty({
    description: 'Object key owner-scoped, lưu khi cần audit/confirm.',
  })
  key: string;
  @ApiProperty({
    format: 'uri',
    description: 'Presigned PUT URL, hết hạn sau expiresInSeconds.',
  })
  uploadUrl: string;
  @ApiProperty() expiresInSeconds: number;
  @ApiProperty({
    format: 'uri',
    description: 'URL CDN/public gán vào avatarUrl sau khi upload thành công.',
  })
  publicUrl: string;
}
