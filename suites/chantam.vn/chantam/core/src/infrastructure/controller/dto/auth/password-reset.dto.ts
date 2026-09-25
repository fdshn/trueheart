import {
  IChangePasswordBodyDto,
  IChangePasswordDto,
  IConfirmPasswordResetBodyDto,
  IConfirmPasswordResetDto,
  IConfirmPasswordResetResponseDto,
  IDeleteAccountBodyDto,
  IDeleteAccountDto,
  IDeleteAccountResponseDto,
  IRequestPasswordResetBodyDto,
  IRequestPasswordResetDto,
  IRequestPasswordResetResponseDto,
  PasswordResetChannels,
} from '@chantam.vn/chantam.core-lib/dto';
import { MatchesProperty } from '@chantam/service.common-lib/decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class RequestPasswordResetDto implements IRequestPasswordResetDto {
  @ApiProperty({
    example: 'nguyenvanan',
    description:
      'Username, email hoặc số điện thoại của tài khoản cần khôi phục.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;
}

export class RequestPasswordResetBodyDto implements IRequestPasswordResetBodyDto {
  @ApiProperty({
    type: () => RequestPasswordResetDto,
    description:
      'Luôn trả 200 dù tài khoản có thật hay không — khác nhau một chữ là ' +
      'endpoint này thành công cụ dò username. Xem `channel` để biết phải làm gì tiếp.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => RequestPasswordResetDto)
  reset: IRequestPasswordResetDto;
}

export class RequestPasswordResetResponseDto implements IRequestPasswordResetResponseDto {
  @ApiProperty({
    enum: PasswordResetChannels,
    description:
      'Mã đã gửi qua đâu. `EMAIL`/`SMS` thì mời người dùng nhập mã. ' +
      '`ADMIN_SUPPORT` nghĩa là không tự khôi phục được (tài khoản không tồn ' +
      'tại, chưa gắn email/SĐT, đã bị khoá, hoặc hệ thống chưa cắm nhà cung ' +
      'cấp gửi mã) — hướng người dùng liên hệ Admin.',
  })
  channel: PasswordResetChannels;

  @ApiProperty({
    nullable: true,
    example: 'ngu***@gmail.com',
    description:
      'Đích gửi đã che bớt, đủ để chủ tài khoản nhận ra nhưng không đủ để ' +
      'người lạ đọc. `null` khi kênh là `ADMIN_SUPPORT`.',
  })
  maskedTarget: string | null;

  @ApiProperty({
    nullable: true,
    example: 300,
    description: 'Số giây mã còn hiệu lực. `null` khi kênh là `ADMIN_SUPPORT`.',
  })
  expiresInSeconds: number | null;
}

export class ConfirmPasswordResetDto implements IConfirmPasswordResetDto {
  @ApiProperty({
    example: 'nguyenvanan',
    description: 'Đúng định danh đã dùng ở bước xin mã.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;

  @ApiProperty({
    example: '048213',
    description:
      'Mã 6 chữ số vừa nhận. Dùng được ĐÚNG MỘT LẦN và hết hạn sau 5 phút. ' +
      'Nhập sai quá 5 lần thì mã bị huỷ, phải xin mã mới.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp phải là 6 chữ số' })
  otp: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    description: 'Mật khẩu mới, tối thiểu 8 ký tự.',
  })
  @IsString()
  @Length(8, 128)
  newPassword: string;

  @ApiProperty({ description: 'Nhập lại đúng `newPassword`.' })
  @IsString()
  @MatchesProperty('newPassword', { message: 'Mật khẩu xác nhận không khớp' })
  confirmPassword: string;
}

export class ConfirmPasswordResetBodyDto implements IConfirmPasswordResetBodyDto {
  @ApiProperty({
    type: () => ConfirmPasswordResetDto,
    description:
      'Đổi xong sẽ thu hồi TOÀN BỘ phiên trên mọi thiết bị, kể cả access token ' +
      'còn hạn. Người dùng đặt lại mật khẩu thường vì nghi bị chiếm tài khoản.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmPasswordResetDto)
  reset: IConfirmPasswordResetDto;
}

export class ConfirmPasswordResetResponseDto implements IConfirmPasswordResetResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Thời điểm đổi mật khẩu thành công.',
  })
  resetAt: Date;

  @ApiProperty({
    example: 2,
    description:
      'Số phiên vừa bị thu hồi trên mọi thiết bị. Người dùng phải đăng nhập lại.',
  })
  @IsInt()
  revokedSessions: number;
}

export class ChangePasswordDto implements IChangePasswordDto {
  @ApiProperty({
    description:
      'Mật khẩu đang dùng. Bắt nhập lại vì access token có thể đang nằm trong ' +
      'tay người mượn máy.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  currentPassword: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    description:
      'Mật khẩu mới, tối thiểu 8 ký tự, phải KHÁC mật khẩu hiện tại.',
  })
  @IsString()
  @Length(8, 128)
  newPassword: string;

  @ApiProperty({ description: 'Nhập lại đúng `newPassword`.' })
  @IsString()
  @MatchesProperty('newPassword', { message: 'Mật khẩu xác nhận không khớp' })
  confirmPassword: string;

  @ApiProperty({
    example: 'android-8f3a1c',
    description:
      'Thiết bị đang gọi. Đổi mật khẩu thu hồi sạch mọi phiên, rồi cấp lại ' +
      'phiên mới cho ĐÚNG thiết bị này — nên phải gửi đúng giá trị đang dùng.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Token FCM của thiết bị này, để nhận lại thông báo đẩy.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fcmToken?: string;
}

export class ChangePasswordBodyDto implements IChangePasswordBodyDto {
  @ApiProperty({
    type: () => ChangePasswordDto,
    description:
      'Thu hồi TOÀN BỘ phiên trên mọi thiết bị rồi trả về cặp token MỚI cho ' +
      'thiết bị đang gọi. Đây là đường DUY NHẤT để tài khoản chưa gắn email ' +
      'hoặc SĐT đã xác minh đổi được mật khẩu.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => ChangePasswordDto)
  password: IChangePasswordDto;
}

export class DeleteAccountDto implements IDeleteAccountDto {
  @ApiProperty({
    description:
      'Nhập lại mật khẩu để xác nhận. Bắt buộc vì xoá tài khoản không hoàn tác ' +
      'được, mà access token có thể đang nằm trong tay người mượn máy.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  password: string;
}

export class DeleteAccountBodyDto implements IDeleteAccountBodyDto {
  @ApiProperty({
    type: () => DeleteAccountDto,
    description:
      'Xoá MỀM: email, SĐT, họ tên, avatar và vị trí bị ẩn danh, nhưng USERNAME ' +
      'ĐƯỢC GIỮ LẠI để không ai đăng ký đúng tên đó rồi mạo danh trong lịch sử ' +
      'giao dịch cũ. Lịch sử giao dịch và điểm cống hiến vẫn nguyên.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeleteAccountDto)
  account: IDeleteAccountDto;
}

export class DeleteAccountResponseDto implements IDeleteAccountResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Thời điểm xoá tài khoản.',
  })
  deletedAt: Date;

  @ApiProperty({
    example: 1,
    description:
      'Số phiên bị thu hồi, tính cả phiên vừa dùng để gọi chính endpoint này.',
  })
  revokedSessions: number;
}
