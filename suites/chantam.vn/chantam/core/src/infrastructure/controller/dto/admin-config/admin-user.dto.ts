import {
  IChangeUserStatusDto,
  IDeleteAdminUserDto,
  IReleaseVerifiedPhoneDto,
} from '@/application/contracts/admin-config';
import { IAdminUserSummary } from '@/domain/ports/repository';
import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Query string gửi `?x=true`, nên phải tự đổi chuỗi sang boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class AdminUserParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
}

export class ListAdminUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Khớp một phần, không phân biệt hoa thường.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  username?: string;

  @ApiPropertyOptional({ description: 'Khớp một phần.' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  email?: string;

  @ApiPropertyOptional({ description: 'Khớp một phần.' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string;

  @ApiPropertyOptional({ enum: UserRanks })
  @IsOptional()
  @IsEnum(UserRanks)
  rank?: UserRanks;

  @ApiPropertyOptional({ enum: UserStatuses })
  @IsOptional()
  @IsEnum(UserStatuses)
  status?: UserStatuses;

  @ApiPropertyOptional({
    example: 'SUPER_ADMIN',
    description: 'Chỉ lấy người đang giữ role quản trị này.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  adminRole?: string;

  @ApiPropertyOptional({ description: 'Đã xác minh SĐT hay chưa.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  phoneVerified?: boolean;

  @ApiPropertyOptional({ description: 'Đã xác minh email hay chưa.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({
    description:
      'Chỉ lấy người đang bị gắn cờ xem xét độ chính xác mô tả (F43). Đây là hàng đợi cho cờ đó.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  accuracyReviewRequired?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registeredFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registeredTo?: Date;

  @ApiPropertyOptional({
    description: 'Mặc định ẩn tài khoản đã xoá.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ChangeUserStatusDto implements IChangeUserStatusDto {
  @ApiProperty({ enum: UserStatuses })
  @IsEnum(UserStatuses)
  status: UserStatuses;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Bắt buộc khi tạm khoá; các trạng thái khác bỏ qua.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  suspendedUntil?: Date | null;

  @ApiProperty({
    example: 'Vi phạm quy tắc cộng đồng',
    description: 'Bắt buộc, để audit truy được vì sao tài khoản bị khoá.',
  })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class ChangeUserStatusBodyDto {
  @ApiProperty({ type: () => ChangeUserStatusDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ChangeUserStatusDto)
  statusChange: ChangeUserStatusDto;
}

export class ReleaseVerifiedPhoneDto implements IReleaseVerifiedPhoneDto {
  @ApiProperty({
    example: '0912345678',
    description:
      'Gõ cách nào cũng được — server nắn về E.164 rồi mới tra. Không cần biết tài khoản nào đang giữ số: sổ lưu băm, và tài khoản cũ có thể đã xoá.',
  })
  @IsString()
  @Length(6, 25)
  phone: string;

  @ApiProperty({
    example: 'Người dùng mất tài khoản cũ, đã xác minh CMND qua hỗ trợ',
    description:
      'Bắt buộc. Đây là thao tác mở lại một khoá chống gian lận, nên sẽ bị hỏi lại.',
  })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class ReleaseVerifiedPhoneBodyDto {
  @ApiProperty({ type: () => ReleaseVerifiedPhoneDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ReleaseVerifiedPhoneDto)
  release: ReleaseVerifiedPhoneDto;
}

export class ReleasedPhoneHolderDto {
  @ApiProperty({ format: 'uuid' }) userId: string;

  @ApiProperty() username: string;

  @ApiProperty({ type: String, format: 'date-time' }) verifiedAt: Date;

  @ApiProperty({ description: 'Tài khoản đó đã xoá hay chưa.' })
  holderDeleted: boolean;
}

export class ReleaseVerifiedPhoneResponseDto {
  @ApiProperty({
    example: '+84912345678',
    description: 'Số đã nắn — để Admin đối chiếu mình gõ đúng số chưa.',
  })
  phone: string;

  @ApiProperty({ type: () => ReleasedPhoneHolderDto })
  previousHolder: ReleasedPhoneHolderDto;
}

export class DeleteAdminUserDto implements IDeleteAdminUserDto {
  @ApiProperty({ example: 'Người dùng yêu cầu xoá tài khoản' })
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class DeleteAdminUserBodyDto {
  @ApiProperty({ type: () => DeleteAdminUserDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeleteAdminUserDto)
  deletion: DeleteAdminUserDto;
}

export class AdminUserDto implements IAdminUserSummary {
  @ApiProperty({ format: 'uuid' }) userId: string;

  @ApiProperty() username: string;

  @ApiProperty({ nullable: true }) fullName: string | null;

  @ApiProperty({ nullable: true }) email: string | null;

  @ApiProperty({ nullable: true }) phone: string | null;

  @ApiProperty({ enum: UserRanks }) rank: UserRanks;

  @ApiProperty({ enum: UserStatuses }) status: UserStatuses;

  @ApiProperty() phoneVerified: boolean;

  @ApiProperty() emailVerified: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Độ chính xác mô tả khi tặng (F43). `null` khi chưa đủ số mẫu tối thiểu.',
  })
  giverAccuracyPercent: number | null;

  @ApiProperty({ description: 'Số lượt đánh giá đã tính vào chỉ số trên.' })
  giverAccuracySamples: number;

  @ApiProperty({
    description:
      'Cờ xem xét độ chính xác. CHỈ Admin thấy — cờ là tín hiệu để người thật nhìn qua, không phải phán quyết, nên không bao giờ hiện trên hồ sơ công khai.',
  })
  accuracyReviewRequired: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedUntil: Date | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ type: [String], example: ['POLICY_ADMIN'] })
  adminRoles: string[];
}

export class ListAdminUsersResponseDto {
  @ApiProperty({ type: () => [AdminUserDto] })
  users: IAdminUserSummary[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class AdminUserResponseDto {
  @ApiProperty({ type: () => AdminUserDto })
  user: IAdminUserSummary;
}

export class AdminUserMutationResponseDto {
  @ApiProperty({ type: () => AdminUserDto })
  user: IAdminUserSummary;

  @ApiProperty({
    example: 3,
    description: 'Số phiên đăng nhập bị thu hồi cùng lúc.',
  })
  revokedSessions: number;
}
