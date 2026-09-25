import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Chân Tâm Quận Cầu Giấy' })
  @IsString()
  @Length(3, 150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({
    example: 'Cầu Giấy, Hà Nội',
    description:
      'Nhãn vùng hiển thị. Tâm và bán kính KHÔNG nhận từ đây — chúng chụp từ Vị trí mặc định và Rank Config.',
  })
  @IsString()
  @Length(2, 200)
  regionLabel: string;
}

export class CreateGroupBodyDto {
  @ApiProperty({ type: () => CreateGroupDto })
  group: CreateGroupDto;
}

export class GroupSummaryDto {
  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  regionLabel: string;

  @ApiProperty({ example: 10, description: 'Snapshot lúc tạo, không đổi được' })
  radiusKm: number;

  @ApiProperty({ enum: GroupStatuses })
  status: GroupStatuses;

  @ApiProperty({ example: 12 })
  memberCount: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'CHỈ Owner nhận được — link mời là cửa vào nhóm',
  })
  inviteCode: string | null;

  @ApiPropertyOptional({ enum: GroupMemberRoles, nullable: true })
  myRole: GroupMemberRoles | null;
}

export class CreateGroupResponseDto {
  @ApiProperty({ type: () => GroupSummaryDto })
  group: GroupSummaryDto;
}

export class GetOwnGroupResponseDto {
  @ApiPropertyOptional({
    type: () => GroupSummaryDto,
    nullable: true,
    description: 'null khi chưa thuộc nhóm nào — client hiện nút Tạo nhóm',
  })
  group: GroupSummaryDto | null;
}

export class GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId: string;
}

export class ListGroupMembersQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GroupMemberItemDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ enum: GroupMemberRoles })
  role: GroupMemberRoles;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  subTeamId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  subTeamName: string | null;

  @ApiProperty()
  joinedAt: Date;
}

export class ListGroupMembersResponseDto {
  @ApiProperty({ type: () => [GroupMemberItemDto] })
  members: GroupMemberItemDto[];

  @ApiProperty({ example: 12 })
  total: number;
}

export class SubTeamItemDto {
  @ApiProperty({ format: 'uuid' })
  subTeamId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 4 })
  memberCount: number;
}

export class ListSubTeamsResponseDto {
  @ApiProperty({ type: () => [SubTeamItemDto] })
  subTeams: SubTeamItemDto[];
}

export class CreateSubTeamDto {
  @ApiProperty({ example: 'Tổ Dịch Vọng' })
  @IsString()
  @Length(2, 150)
  name: string;
}

export class CreateSubTeamBodyDto {
  @ApiProperty({ type: () => CreateSubTeamDto })
  subTeam: CreateSubTeamDto;
}

export class AssignGroupMemberParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  memberId: string;
}

export class AssignGroupMemberDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null để gỡ khỏi tổ. Tổ phải thuộc chính nhóm này.',
  })
  @IsOptional()
  @IsUUID()
  subTeamId?: string | null;

  @ApiPropertyOptional({
    enum: GroupMemberRoles,
    description: 'Bỏ trống để giữ nguyên vai. OWNER không gán được.',
  })
  @IsOptional()
  @IsEnum(GroupMemberRoles)
  role?: GroupMemberRoles;
}

export class AssignGroupMemberBodyDto {
  @ApiProperty({ type: () => AssignGroupMemberDto })
  membership: AssignGroupMemberDto;
}
