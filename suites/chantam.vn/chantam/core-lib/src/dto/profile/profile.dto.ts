import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { UserRanks, UserStatuses } from '../../consts';
import { IEntitlementsSummaryDto } from '../entitlement';
import { IPointSummaryDto } from '../point';
import { IRankSummaryDto } from '../rank';
import { IReferralSummaryDto } from '../referral';

export interface IProfileReferrerDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface IUpdateOwnProfileDto {
  fullName?: string | null;
  /** Key do endpoint presign trả về sau upload, không nhận URL tuỳ ý. */
  avatarKey?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Bỏ trống = giữ nguyên, `null` = xoá hẳn vị trí mặc định đang lưu. */
  defaultLocation?: IGeoPoint | null;
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
  /** Email đã qua OTP chưa — chỉ email đã xác minh mới khôi phục mật khẩu được. */
  emailVerified: boolean;
  profileComplete: boolean;
  referral?: IReferralSummaryDto | null;
  referrer?: IProfileReferrerDto | null;
  /** Số dư tiêu được và điểm tích luỹ, lấy từ projection của ledger. */
  point?: IPointSummaryDto | null;
  /** Tiến độ tới hạng kế tiếp và chu kỳ duy trì đang mở. */
  rankProgress?: IRankSummaryDto | null;
  /** Quyền và hạn mức theo hạng hiện tại. */
  entitlements?: IEntitlementsSummaryDto | null;
  /** Độ chính xác mô tả khi tặng (F43). `null` khi chưa đủ mẫu. */
  accuracy?: IGiverAccuracySummaryDto | null;
}

export interface IGetOwnProfileResponseDto {
  profile: IOwnProfileDto;
}
export interface IUpdateOwnProfileResponseDto {
  profile: IOwnProfileDto;
}

/** Bản tối thiểu, tuyệt đối không có email/SĐT/vị trí mặc định/số dư tiêu được. */
export interface IPublicProfileDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
  publishedGiftPostCount: number;
  /** Điểm tích luỹ quyết định hạng. KHÔNG phải số dư tiêu được. */
  lifetimePoints: number;
  /** `null` khi chưa cấu hình web công khai. */
  shareUrl: string | null;
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

export interface IRequestEmailVerificationResponseDto {
  /** Địa chỉ đã che bớt, đủ để chủ nhận ra mình gõ đúng chưa. */
  maskedEmail: string;
  expiresInSeconds: number;
}
export interface IConfirmEmailVerificationDto {
  otp: string;
}
export interface IConfirmEmailVerificationBodyDto {
  verification: IConfirmEmailVerificationDto;
}
export interface IConfirmEmailVerificationResponseDto {
  verifiedAt: Date;
}

/**
 * Độ chính xác mô tả của người tặng (F43), phần CHÍNH CHỦ được thấy.
 *
 * Cố ý KHÔNG mang cờ `reviewRequired`. Cờ đó là tín hiệu để Admin xem, không
 * phải phán quyết — cho chính chủ thấy "bạn đang bị đánh dấu xem xét" là kết
 * tội trước khi có người thật nhìn qua.
 */
export interface IGiverAccuracySummaryDto {
  /** `null` khi chưa đủ số mẫu tối thiểu. */
  percent: number | null;
  samples: number;
  /** Số mẫu tối thiểu để chỉ số bắt đầu có nghĩa. */
  minSamples: number;
}
