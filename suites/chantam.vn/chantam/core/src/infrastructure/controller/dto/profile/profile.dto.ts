import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IConfirmPhoneVerificationBodyDto,
  IConfirmPhoneVerificationDto,
  IConfirmPhoneVerificationResponseDto,
  IGetOwnProfileResponseDto,
  IOwnProfileDto,
  IRequestPhoneVerificationResponseDto,
  IUpdateOwnProfileBodyDto,
  IUpdateOwnProfileDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { GeoPointDto } from '../geo-point.dto';

const PhonePattern = /^\+?[0-9]{8,15}$/;

export class UpdateOwnProfileDto implements IUpdateOwnProfileDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 100,
    description: 'Họ tên hiển thị. Bỏ trống thì giữ nguyên.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @ApiPropertyOptional({
    format: 'uri',
    maxLength: 500,
    description:
      'URL avatar đã được upload/confirm bởi storage service. Bỏ trống thì giữ nguyên.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  avatarUrl?: string;

  @ApiPropertyOptional({
    format: 'email',
    maxLength: 255,
    description:
      'Email dùng để đăng nhập và nhận mã khôi phục. Không phân biệt hoa thường.',
  })
  @IsOptional()
  @IsEmail()
  @Length(1, 255)
  email?: string;

  @ApiPropertyOptional({
    example: '+84912345678',
    description:
      'Số điện thoại E.164 hoặc chữ số 8–15 ký tự. Đổi số sẽ huỷ trạng thái xác minh cũ.',
  })
  @IsOptional()
  @IsString()
  @Matches(PhonePattern, { message: 'phone phải là số điện thoại hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({
    type: () => GeoPointDto,
    description:
      'Vị trí mặc định của CHÍNH CHỦ khi tạo bài. Khác Current GPS; không bao giờ lộ qua profile công khai.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  defaultLocation?: GeoPointDto;
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
