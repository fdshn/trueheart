import { IGetOwnAdminAccessResult } from '@/application/contracts/admin-config';
import { ApiProperty } from '@nestjs/swagger';

export class AdminAccessResponseDto implements IGetOwnAdminAccessResult {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ type: [String], example: ['MODERATOR'] })
  roles: string[];

  @ApiProperty({ type: [String], example: ['admin.access', 'post.read'] })
  permissions: string[];
}
