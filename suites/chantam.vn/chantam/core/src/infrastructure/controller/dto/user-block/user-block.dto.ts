import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IBlockedUserDto,
  IBlockUserBodyDto,
  IBlockUserDto,
  IBlockUserResponseDto,
  IListBlockedUsersResponseDto,
  IUnblockUserResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BlockUserDto implements IBlockUserDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Từ phòng chat (`counterpartId`) hoặc danh sách online.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'cu-si-minh',
    description: 'Từ hồ sơ công khai — nơi không có id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;
}

export class BlockUserBodyDto implements IBlockUserBodyDto {
  @ApiProperty({
    type: () => BlockUserDto,
    description: 'Đúng một trong `userId` hoặc `username`.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => BlockUserDto)
  block: BlockUserDto;
}

export class BlockedUserParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
}

export class ListBlockedUsersQueryDto extends PaginationQueryDto {}

export class BlockedUserDto implements IBlockedUserDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() username: string;
  @ApiProperty({ type: String, nullable: true }) fullName: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ enum: UserRanks }) rank: UserRanks;
  @ApiProperty({ format: 'date-time' }) blockedAt: Date;
}

export class BlockUserResponseDto implements IBlockUserResponseDto {
  @ApiProperty({ type: () => BlockedUserDto }) block: BlockedUserDto;
  @ApiProperty({ description: '`false` khi đã chặn từ trước.' })
  created: boolean;
}

export class UnblockUserResponseDto implements IUnblockUserResponseDto {
  @ApiProperty({ description: '`false` khi vốn không chặn.' })
  unblocked: boolean;
}

export class ListBlockedUsersResponseDto implements IListBlockedUsersResponseDto {
  @ApiProperty({ type: () => [BlockedUserDto] }) blocks: BlockedUserDto[];
  @ApiProperty({ type: () => PaginationMetaDto }) meta: PaginationMetaDto;
}
