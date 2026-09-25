import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

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
