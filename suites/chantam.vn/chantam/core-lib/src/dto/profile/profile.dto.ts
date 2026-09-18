import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { UserRanks, UserStatuses } from '../../consts';
import { IReferralSummaryDto } from '../referral';

export interface IProfileReferrerDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface IUpdateOwnProfileDto {
  fullName?: string;
  /** Key do endpoint presign trả về sau upload, không nhận URL tuỳ ý. */
  avatarKey?: string;
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
  referral?: IReferralSummaryDto | null;
  referrer?: IProfileReferrerDto | null;
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

export interface IRequestPhoneVerificationResponseDto {
  expiresInSeconds: number;
}
export interface IConfirmPhoneVerificationDto {
  otp: string;
}
export interface IConfirmPhoneVerificationBodyDto {
  verification: IConfirmPhoneVerificationDto;
}
export interface IConfirmPhoneVerificationResponseDto {
  verifiedAt: Date;
}
