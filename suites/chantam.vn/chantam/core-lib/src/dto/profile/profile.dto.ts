import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { UserRanks, UserStatuses } from '../../consts';

export interface IUpdateOwnProfileDto {
  fullName?: string;
  avatarUrl?: string;
  email?: string;
  phone?: string;
  defaultLocation?: IGeoPoint;
}

export interface IUpdateOwnProfileBodyDto {
  profile: IUpdateOwnProfileDto;
}

/** Hồ sơ đầy đủ chỉ chủ tài khoản được xem. */
export interface IOwnProfileDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  defaultLocation: IGeoPoint | null;
  rank: UserRanks;
  status: UserStatuses;
  phoneVerified: boolean;
  profileComplete: boolean;
}

export interface IGetOwnProfileResponseDto {
  profile: IOwnProfileDto;
}
export interface IUpdateOwnProfileResponseDto {
  profile: IOwnProfileDto;
}

/** Bản tối thiểu, tuyệt đối không có email/SĐT/vị trí mặc định. */
export interface IPublicProfileDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
  publishedGiftPostCount: number;
}
export interface IGetPublicProfileParamsDto {
  username: string;
}
export interface IGetPublicProfileResponseDto {
  profile: IPublicProfileDto;
}
