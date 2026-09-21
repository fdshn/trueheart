import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IConfirmPhoneVerificationBodyDto,
  IConfirmPhoneVerificationDto,
  IConfirmPhoneVerificationResponseDto,
  IEntitlementsSummaryDto,
  IGetOwnProfileResponseDto,
  IOwnProfileDto,
  IPointSummaryDto,
  IProfileReferrerDto,
  IRankSummaryDto,
  IRequestPhoneVerificationResponseDto,
  IUpdateOwnProfileBodyDto,
  IUpdateOwnProfileDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

const PhonePattern = /^\+?[0-9]{8,15}$/;

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
      'Số điện thoại E.164 hoặc chữ số 8–15 ký tự. Đổi số sẽ huỷ trạng thái xác minh cũ.',
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
