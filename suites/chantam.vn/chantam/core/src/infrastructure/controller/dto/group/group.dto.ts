import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
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
  // Ba decorator, ba việc khác nhau, và thiếu bất kỳ cái nào cũng hỏng:
  // `@IsDefined()` chặn body không có khoá bọc (thiếu nó thì use case đọc
  // `command.group.name` và nổ 500), `@ValidateNested()` bắt validation đi vào
  // bên trong, `@Type()` cho class-transformer biết dựng class nào — thiếu nó
  // thì bên trong vẫn là object trần và mọi decorator ở `CreateGroupDto` bị bỏ
  // qua. Cả ba endpoint nhóm đều thiếu đủ bộ tới 30/09.
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateGroupDto)
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

export class GroupOverviewDto {
  @ApiProperty({ format: 'uuid' }) groupId: string;
  @ApiProperty({ format: 'uuid' }) ownerId: string;
  @ApiProperty() ownerUsername: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  coverUrl: string | null;
  @ApiProperty() regionLabel: string;
  @ApiProperty({ description: 'Đơn vị KM. Snapshot lúc tạo, không đổi được.' })
  radiusKm: number;
  @ApiProperty({ enum: GroupStatuses }) status: GroupStatuses;
  @ApiProperty() activatedAt: Date;
  @ApiProperty() memberCount: number;
  @ApiProperty() subTeamCount: number;
  @ApiProperty({ enum: GroupMemberRoles }) myRole: GroupMemberRoles;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  mySubTeamId: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'CHỈ Owner thấy. Thành viên thường luôn nhận null.',
  })
  inviteCode: string | null;
}

export class GetGroupOverviewResponseDto {
  @ApiProperty({ type: () => GroupOverviewDto })
  group: GroupOverviewDto;
}

export class GroupActivityItemDto {
  @ApiProperty({
    enum: ['MEMBER_JOINED', 'POST_PUBLISHED', 'GIFT_COMPLETED'],
  })
  kind: string;

  @ApiProperty() occurredAt: Date;
  @ApiProperty({ format: 'uuid' }) actorId: string;
  @ApiProperty() actorUsername: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  subjectId: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tiêu đề bài liên quan, nếu loại sự kiện có bài.',
  })
  subjectLabel: string | null;
}

export class ListGroupActivitiesResponseDto {
  @ApiProperty({ type: () => [GroupActivityItemDto] })
  activities: GroupActivityItemDto[];

  @ApiProperty() total: number;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'null khi thấy CẢ nhóm, một id khi chỉ thấy tổ mình. Thiếu trường này thì trưởng tổ thấy danh sách ngắn và không hiểu vì sao thiếu người.',
  })
  scopedToSubTeamId: string | null;
}

export class ListGroupActivitiesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GroupInviteDto {
  @ApiProperty() inviteCode: string;

  @ApiProperty({
    description:
      'Link KHÔNG tự hết hạn và KHÔNG giới hạn lượt dùng (BR-GRP-04). Chỉ thành false khi nhóm rời khỏi ACTIVE.',
  })
  usable: boolean;

  @ApiProperty({ description: 'Không tính Owner.' })
  joinedTotal: number;

  @ApiProperty() joinedLast30Days: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastJoinedAt: Date | null;
}

export class GetGroupInviteResponseDto {
  @ApiProperty({ type: () => GroupInviteDto })
  invite: GroupInviteDto;
}

export class GroupAffiliateDto {
  @ApiProperty({ description: 'Bán kính vùng nhóm, snapshot lúc tạo.' })
  radiusKm: number;

  @ApiProperty({ description: 'Từ `affiliate.active_member_window_days`.' })
  activeMemberWindowDays: number;

  @ApiProperty() memberCount: number;

  @ApiProperty({ description: 'status ACTIVE và có mặt trong cửa sổ.' })
  activeMemberCount: number;

  @ApiProperty({
    description: 'Có Vị trí mặc định và nằm trong bán kính nhóm.',
  })
  insideRadiusCount: number;

  @ApiProperty({
    description:
      'Thoả CẢ HAI — con số bộ máy chia thưởng sẽ dùng. Ba số tách riêng để trả lời được câu "sao nhóm tôi ít người đủ điều kiện": vắng mặt, ngoài vùng, hay cả hai.',
  })
  eligibleCount: number;
}

export class GetGroupAffiliateResponseDto {
  @ApiProperty({ type: () => GroupAffiliateDto })
  affiliate: GroupAffiliateDto;

  @ApiProperty({
    description:
      'false cho tới khi bộ máy chia thưởng ra đời. Có cờ này để Owner không hiểu "0 điểm" là nhóm mình chưa làm được gì.',
  })
  rewardEngineReady: boolean;
}

export class UpdateGroupSettingsDto {
  @ApiPropertyOptional({ example: 'Chân Tâm Quận Cầu Giấy' })
  @IsOptional()
  @IsString()
  @Length(3, 150)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'null tường minh để xoá mô tả. Bỏ trống là giữ nguyên.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrl()
  avatarUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrl()
  coverUrl?: string | null;
}

export class UpdateGroupSettingsBodyDto {
  @ApiProperty({ type: () => UpdateGroupSettingsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateGroupSettingsDto)
  settings: UpdateGroupSettingsDto;
}

export class CreateSubTeamDto {
  @ApiProperty({ example: 'Tổ Dịch Vọng' })
  @IsString()
  @Length(2, 150)
  name: string;
}

export class CreateSubTeamBodyDto {
  @ApiProperty({ type: () => CreateSubTeamDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateSubTeamDto)
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

export class SubTeamParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subTeamId: string;
}

export class AssignGroupMemberDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'BỎ TRỐNG để giữ tổ hiện tại, `null` tường minh để gỡ khỏi tổ. Tổ phải thuộc chính nhóm này.',
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
  @IsDefined()
  @ValidateNested()
  @Type(() => AssignGroupMemberDto)
  membership: AssignGroupMemberDto;
}
