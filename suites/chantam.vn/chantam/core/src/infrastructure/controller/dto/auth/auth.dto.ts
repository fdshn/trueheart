import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
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
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ description: 'Số giây còn lại của access token' })
  expiresIn: number;
}

export class OwnUserDto implements IOwnUserDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ nullable: true })
  fullName: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ nullable: true })
  email: string | null;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ enum: UserRanks })
  rank: UserRanks;

  @ApiProperty({ enum: UserStatuses })
  status: UserStatuses;

  @ApiProperty()
  phoneVerified: boolean;

  @ApiProperty({
    description: 'Đủ Họ tên + Avatar + SĐT + Email để đăng bài chưa',
  })
  profileComplete: boolean;
}

class AuthResultDto {
  @ApiProperty({ type: () => SessionTokensDto })
  session: ISessionTokensDto;

  @ApiProperty({ type: () => OwnUserDto })
  user: IOwnUserDto;
}

// ─── Đăng ký ────────────────────────────────────────────────────────────────

export class RegisterDto implements IRegisterDto {
  @ApiProperty({ example: 'nguyenvanan', minLength: 3, maxLength: 50 })
  @IsString()
  @Length(3, 50)
  @Matches(UsernamePattern, {
    message: 'username chỉ được dùng chữ cái, số, gạch dưới và gạch ngang',
  })
  username: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  password: string;

  @ApiProperty({ description: 'Phải trùng password' })
  @IsString()
  @MatchesProperty('password', { message: 'Mật khẩu xác nhận không khớp' })
  confirmPassword: string;

  @ApiProperty({ description: 'Định danh thiết bị do client sinh' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  deviceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fcmToken?: string;
}

export class RegisterBodyDto implements IRegisterBodyDto {
  @ApiProperty({ type: () => RegisterDto })
  @ValidateNested()
  @Type(() => RegisterDto)
  registration: IRegisterDto;
}

export class RegisterResponseDto
  extends AuthResultDto
  implements IRegisterResponseDto {}

// ─── Đăng nhập ──────────────────────────────────────────────────────────────

export class LoginDto implements ILoginDto {
  @ApiProperty({ description: 'Username, email hoặc số điện thoại' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  deviceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fcmToken?: string;
}

export class LoginBodyDto implements ILoginBodyDto {
  @ApiProperty({ type: () => LoginDto })
  @ValidateNested()
  @Type(() => LoginDto)
  credentials: ILoginDto;
}

export class LoginResponseDto
  extends AuthResultDto
  implements ILoginResponseDto {}

// ─── Làm mới phiên ──────────────────────────────────────────────────────────

export class RefreshSessionDto implements IRefreshSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  refreshToken: string;
}

export class RefreshSessionBodyDto implements IRefreshSessionBodyDto {
  @ApiProperty({ type: () => RefreshSessionDto })
  @ValidateNested()
  @Type(() => RefreshSessionDto)
  session: IRefreshSessionDto;
}

export class RefreshSessionResponseDto
  extends AuthResultDto
  implements IRefreshSessionResponseDto {}

// ─── Đăng xuất ──────────────────────────────────────────────────────────────

export class LogoutDto implements ILogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  refreshToken: string;
}

export class LogoutBodyDto implements ILogoutBodyDto {
  @ApiProperty({ type: () => LogoutDto })
  @ValidateNested()
  @Type(() => LogoutDto)
  session: ILogoutDto;
}

export class LogoutResponseDto implements ILogoutResponseDto {
  @ApiProperty()
  loggedOutAt: Date;
}
