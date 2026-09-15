import {
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
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class RequestPasswordResetDto implements IRequestPasswordResetDto {
  @ApiProperty({ description: 'Username, email hoặc số điện thoại' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;
}

export class RequestPasswordResetBodyDto implements IRequestPasswordResetBodyDto {
  @ApiProperty({ type: () => RequestPasswordResetDto })
  @ValidateNested()
  @Type(() => RequestPasswordResetDto)
  reset: IRequestPasswordResetDto;
}

export class RequestPasswordResetResponseDto implements IRequestPasswordResetResponseDto {
  @ApiProperty({ enum: PasswordResetChannels })
  channel: PasswordResetChannels;

  @ApiProperty({
    nullable: true,
    example: 'ngu***@gmail.com',
    description: 'Đích gửi đã che bớt. null khi kênh là ADMIN_SUPPORT',
  })
  maskedTarget: string | null;

  @ApiProperty({ nullable: true })
  expiresInSeconds: number | null;
}

export class ConfirmPasswordResetDto implements IConfirmPasswordResetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  identifier: string;

  @ApiProperty({ example: '048213', description: 'Mã 6 chữ số' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp phải là 6 chữ số' })
  otp: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  newPassword: string;

  @ApiProperty()
  @IsString()
  @MatchesProperty('newPassword', { message: 'Mật khẩu xác nhận không khớp' })
  confirmPassword: string;
}

export class ConfirmPasswordResetBodyDto implements IConfirmPasswordResetBodyDto {
  @ApiProperty({ type: () => ConfirmPasswordResetDto })
  @ValidateNested()
  @Type(() => ConfirmPasswordResetDto)
  reset: IConfirmPasswordResetDto;
}

export class ConfirmPasswordResetResponseDto implements IConfirmPasswordResetResponseDto {
  @ApiProperty()
  resetAt: Date;

  @ApiProperty({ description: 'Số phiên bị thu hồi trên mọi thiết bị' })
  @IsInt()
  revokedSessions: number;
}

export class DeleteAccountDto implements IDeleteAccountDto {
  @ApiProperty({ description: 'Nhập lại mật khẩu để xác nhận' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  password: string;
}

export class DeleteAccountBodyDto implements IDeleteAccountBodyDto {
  @ApiProperty({ type: () => DeleteAccountDto })
  @ValidateNested()
  @Type(() => DeleteAccountDto)
  account: IDeleteAccountDto;
}

export class DeleteAccountResponseDto implements IDeleteAccountResponseDto {
  @ApiProperty()
  deletedAt: Date;

  @ApiProperty()
  revokedSessions: number;
}
