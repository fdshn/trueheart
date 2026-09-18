import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  ICurrentSessionDto,
  ILoginBodyDto,
  ILoginDto,
  ILoginResponseDto,
  ILogoutBodyDto,
  ILogoutDto,
  ILogoutResponseDto,
  IOwnUserDto,
  IRefreshSessionBodyDto,
  IRefreshSessionDto,
  IRefreshSessionResponseDto,
  IRegisterBodyDto,
  IRegisterDto,
  IRegisterResponseDto,
  ISessionTokensDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { MatchesProperty } from '@chantam/service.common-lib/decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

/** Chỉ chữ cái, số, gạch dưới và gạch ngang — để username còn dùng được trong URL. */
const UsernamePattern = /^[a-zA-Z0-9_-]+$/;

export class SessionTokensDto implements ISessionTokensDto {
  @ApiProperty({
    description:
      'JWT gắn vào header `Authorization: Bearer <token>` cho mọi endpoint cần ' +
      'đăng nhập. Sống 15 phút. Bị thu hồi ngay khi đổi mật khẩu hoặc xoá tài khoản.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Chuỗi ngẫu nhiên (KHÔNG phải JWT) để đổi lấy cặp token mới khi access ' +
      'token hết hạn. Sống 30 ngày và XOAY VÒNG: mỗi lần refresh trả về bản mới, ' +
      'bản cũ chết ngay. Lưu ở nơi an toàn nhất mà client có.',
  })
  refreshToken: string;

  @ApiProperty({
    example: 900,
    description: 'Số giây còn lại của access token.',
  })
  expiresIn: number;
}

export class OwnUserDto implements IOwnUserDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh tài khoản. Dùng nó ở mọi nơi, không dùng username.',
  })
  userId: string;

  @ApiProperty({
    example: 'nguyenvanan',
    description:
      'Biệt danh người dùng tự chọn. Không đổi được sau khi đăng ký.',
  })
  username: string;

  @ApiProperty({
    nullable: true,
    description: 'Họ tên đầy đủ. Chưa khai thì null.',
  })
  fullName: string | null;

  @ApiProperty({
    nullable: true,
    description: 'URL ảnh đại diện. Chưa có thì null.',
  })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Email đã gắn. Dùng để đăng nhập và để nhận mã đặt lại mật khẩu.',
  })
  email: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Số điện thoại đã gắn. Cũng dùng để đăng nhập được.',
  })
  phone: string | null;

  @ApiProperty({
    enum: UserRanks,
    description:
      'Bậc thứ hạng, lên theo điểm cống hiến tích luỹ. Quyết định quyền hạn ' +
      'và mức ưu tiên hiển thị.',
  })
  rank: UserRanks;

  @ApiProperty({
    enum: UserStatuses,
    description:
      'Trạng thái tài khoản: đang hoạt động, tạm khoá, hay khoá vĩnh viễn.',
  })
  status: UserStatuses;

  @ApiProperty({
    description:
      'Đã xác minh số điện thoại chưa. Xác minh lần đầu được thưởng điểm.',
  })
  phoneVerified: boolean;

  @ApiProperty({
    description:
      'Đã đủ Họ tên + Avatar + SĐT + Email chưa. `false` thì **chưa đăng bài được** ' +
      '— cổng hoàn thiện hồ sơ sẽ chặn.',
  })
  profileComplete: boolean;
}

class AuthResultDto {
  @ApiProperty({
    type: () => SessionTokensDto,
    description: 'Cặp token của phiên vừa mở.',
  })
  session: ISessionTokensDto;

  @ApiProperty({
    type: () => OwnUserDto,
    description: 'Hồ sơ của chính người đăng nhập.',
  })
  user: IOwnUserDto;
}

// ─── Đăng ký ────────────────────────────────────────────────────────────────

export class RegisterDto implements IRegisterDto {
  @ApiProperty({
    example: 'nguyenvanan',
    minLength: 3,
    maxLength: 50,
    description:
      'Chỉ chữ cái, số, gạch dưới và gạch ngang — để username còn dùng được ' +
      'trong URL. Không đổi được về sau, và tài khoản đã xoá cũng không giải ' +
      'phóng tên (chống mạo danh).',
  })
  @IsString()
  @Length(3, 50)
  @Matches(UsernamePattern, {
    message: 'username chỉ được dùng chữ cái, số, gạch dưới và gạch ngang',
  })
  username: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    description: 'Mật khẩu. Tối thiểu 8 ký tự.',
  })
  @IsString()
  @Length(8, 128)
  password: string;

  @ApiProperty({
    description: 'Nhập lại đúng `password`, nếu không sẽ bị từ chối.',
  })
  @IsString()
  @MatchesProperty('password', { message: 'Mật khẩu xác nhận không khớp' })
  confirmPassword: string;

  @ApiProperty({
    example: 'android-8f3a1c',
    description:
      'Định danh thiết bị do client tự sinh và GIỮ NGUYÊN qua các lần đăng ' +
      'nhập. Mỗi thiết bị một phiên: đăng nhập lại trên cùng thiết bị sẽ thu ' +
      'hồi phiên cũ của đúng thiết bị đó, không đụng máy khác.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  deviceId: string;

  @ApiPropertyOptional({
    description:
      'Token Firebase Cloud Messaging để nhận thông báo đẩy. Bỏ trống nếu ' +
      'client chưa xin quyền thông báo.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fcmToken?: string;

  @ApiPropertyOptional({
    example: 'AB12CD34EF',
    minLength: 10,
    maxLength: 12,
    description: 'Mã giới thiệu cá nhân; chỉ áp dụng lúc tạo tài khoản mới.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{10,12}$/)
  referralCode?: string;
}

export class RegisterBodyDto implements IRegisterBodyDto {
  @ApiProperty({
    type: () => RegisterDto,
    description:
      'Đăng ký chỉ cần username + mật khẩu; email và SĐT bổ sung sau.',
  })
  @ValidateNested()
  @Type(() => RegisterDto)
  registration: IRegisterDto;
}

/** Trả về khi đăng ký thành công — đăng ký xong tự đăng nhập luôn. */
export class RegisterResponseDto
  extends AuthResultDto
  implements IRegisterResponseDto {}

// ─── Đăng nhập ──────────────────────────────────────────────────────────────

export class LoginDto implements ILoginDto {
  @ApiProperty({
    example: 'nguyenvanan',
    description:
      'Username, email hoặc số điện thoại — cái nào cũng được, hệ thống tự nhận ra.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;

  @ApiProperty({
    description:
      'Mật khẩu. Sai quá 5 lần thì định danh này bị tạm khoá 15 phút (mã 778).',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  password: string;

  @ApiProperty({
    example: 'android-8f3a1c',
    description:
      'Định danh thiết bị. Dùng LẠI đúng giá trị của lần đăng ký/đăng nhập ' +
      'trước trên máy này, nếu không mỗi lần đăng nhập sẽ tạo thêm một phiên mới.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Token Firebase Cloud Messaging để nhận thông báo đẩy.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fcmToken?: string;
}

export class LoginBodyDto implements ILoginBodyDto {
  @ApiProperty({
    type: () => LoginDto,
    description:
      'Sai mật khẩu và tài khoản không tồn tại trả lời GIỐNG HỆT nhau — cố ý, ' +
      'để không ai dùng endpoint này dò xem username nào có thật.',
  })
  @ValidateNested()
  @Type(() => LoginDto)
  credentials: ILoginDto;
}

export class LoginResponseDto
  extends AuthResultDto
  implements ILoginResponseDto {}

// ─── Làm mới phiên ──────────────────────────────────────────────────────────

export class RefreshSessionDto implements IRefreshSessionDto {
  @ApiProperty({
    description:
      'Refresh token của phiên hiện tại. Gọi xong sẽ nhận CẶP MỚI và token vừa ' +
      'gửi lên chết ngay — dùng lại lần nữa sẽ bị từ chối.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  refreshToken: string;
}

export class RefreshSessionBodyDto implements IRefreshSessionBodyDto {
  @ApiProperty({
    type: () => RefreshSessionDto,
    description:
      'Endpoint này công khai vì lúc gọi thì access token đã hết hạn rồi.',
  })
  @ValidateNested()
  @Type(() => RefreshSessionDto)
  session: IRefreshSessionDto;
}

export class RefreshSessionResponseDto
  extends AuthResultDto
  implements IRefreshSessionResponseDto {}

// ─── Đăng xuất ──────────────────────────────────────────────────────────────

export class LogoutDto implements ILogoutDto {
  @ApiProperty({
    description:
      'Refresh token của thiết bị muốn đăng xuất. Chỉ thiết bị đó bị thu hồi, ' +
      'các máy khác vẫn đăng nhập bình thường.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  refreshToken: string;
}

export class LogoutBodyDto implements ILogoutBodyDto {
  @ApiProperty({
    type: () => LogoutDto,
    description:
      'Cần kèm access token ở header: `userId` lấy từ token chứ không tin body, ' +
      'nếu không ai cũng đăng xuất hộ người khác được.',
  })
  @ValidateNested()
  @Type(() => LogoutDto)
  session: ILogoutDto;
}

export class LogoutResponseDto implements ILogoutResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Thời điểm thu hồi phiên. Endpoint trả 200 cả khi token không tồn tại — ' +
      'đăng xuất là thao tác an toàn, không cần báo lỗi.',
  })
  loggedOutAt: Date;
}

export class CurrentSessionDto implements ICurrentSessionDto {
  @ApiProperty({ format: 'uuid', description: 'Định danh tài khoản.' })
  userId: string;

  @ApiProperty({ example: 'nguyenvanan', description: 'Biệt danh người dùng.' })
  username: string;

  @ApiProperty({
    enum: UserRanks,
    description:
      'Hạng tại thời điểm PHÁT HÀNH token, không phải hiện tại. Đổi hạng thì ' +
      'giá trị này còn cũ tới 15 phút — đừng phân quyền dựa vào nó.',
  })
  rank: string;

  @ApiProperty({
    enum: UserStatuses,
    description:
      'Trạng thái tại thời điểm phát hành token. Cũng là ảnh chụp như `rank`.',
  })
  status: string;
}
