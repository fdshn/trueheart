import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';
import { UserRanks } from '../../consts';

/**
 * Chặn người dùng. Chỉ định người bị chặn bằng ĐÚNG MỘT trong hai: `userId` (từ phòng chat,
 * danh sách online) hoặc `username` (từ hồ sơ công khai — nơi không có id).
 */
export interface IBlockUserDto {
  userId?: string;
  username?: string;
}

export interface IBlockUserBodyDto {
  block: IBlockUserDto;
}

/** Người mình đã chặn — chỉ chính chủ thấy danh sách này, nên có `userId` để bỏ chặn. */
export interface IBlockedUserDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
  blockedAt: Date;
}

export interface IBlockUserResponseDto {
  block: IBlockedUserDto;
  /** `false` khi đã chặn từ trước — gọi lại không lỗi. */
  created: boolean;
}

export interface IUnblockUserResponseDto {
  /** `false` khi vốn không chặn — gọi lại không lỗi. */
  unblocked: boolean;
}

export interface IListBlockedUsersResponseDto {
  blocks: IBlockedUserDto[];
  meta: IPaginationMetaDto;
}
