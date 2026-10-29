import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  ContactVisibilities,
  LeaderboardBoards,
  UserRanks,
  UserStatuses,
} from '../../consts';
import { IEntitlementsSummaryDto } from '../entitlement';
import { IProfileBadgeDto } from '../leaderboard';
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
  /** Hiện "Người ẩn danh" trên bảng thành tích tháng. Bỏ trống = giữ nguyên. */
  leaderboardAnonymous?: boolean;
  /** Cho người khác thấy mình online ở từng tab. Tắt là xoá ngay khỏi danh sách. Bỏ trống = giữ nguyên. */
  showOnlineStatus?: boolean;
  /** Bỏ trống = giữ nguyên; `null` hoặc chuỗi trắng = xoá. */
  slogan?: string | null;
  /** Đổi chữ thì ghi lại `todayThoughtUpdatedAt`; gửi lại đúng chữ cũ thì mốc giữ nguyên. */
  todayThought?: string | null;
  emailVisibility?: ContactVisibilities;
  phoneVisibility?: ContactVisibilities;
  /** Key từ `POST /profile/me/intro-video/upload-url` (kind VIDEO). `null` = gỡ clip và ảnh bìa. */
  introVideoKey?: string | null;
  /** Key ảnh bìa (kind THUMBNAIL). Cần hồ sơ đang có — hoặc cùng lúc gửi — clip. */
  introVideoThumbnailKey?: string | null;
}

/** Hồ sơ mở rộng (PR #46 §3) — dùng chung cho hồ sơ của tôi và hồ sơ công khai. */
export interface IProfileShowcaseDto {
  slogan: string | null;
  todayThought: string | null;
  todayThoughtUpdatedAt: Date | null;
  introVideoUrl: string | null;
  introVideoThumbnailUrl: string | null;
}

/** Vị trí tháng hiện tại trên bảng Người cho. `rank: null` khi chưa lên bảng. */
export interface IPublicMonthlyStandingDto {
  /** `YYYY-MM` */
  month: string;
  board: LeaderboardBoards.GIVERS;
  rank: number | null;
  count: number;
}

/** Liên hệ công khai — từng trường `null` trừ khi chủ hồ sơ đặt `PUBLIC`. */
export interface IPublicContactsDto {
  email: string | null;
  phone: string | null;
}

export interface IRequestIntroVideoUploadDto {
  kind: IntroVideoUploadKind;
  contentType: string;
  contentLength: number;
}

export type IntroVideoUploadKind = 'VIDEO' | 'THUMBNAIL';

export interface IRequestIntroVideoUploadBodyDto {
  upload: IRequestIntroVideoUploadDto;
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
  /**
   * Tạo được nhóm chưa, và nếu chưa thì vì sao (SRS 3.7A) — trùng với
   * `GET /me/entitlements` và `GET /groups/me`.
   */
  groupCreation?: { canCreateGroup: boolean; reasonCode: string | null } | null;
  /** Độ chính xác mô tả khi tặng (F43). `null` khi chưa đủ mẫu. */
  accuracy?: IGiverAccuracySummaryDto | null;
  /** Điểm sao 1–5 theo từng vai (F42). */
  rating?: IReviewRatingSummaryDto | null;
  /** Cài đặt ẩn danh trên bảng thành tích tháng. */
  leaderboardAnonymous?: boolean;
  /** Cài đặt hiện trạng thái online (PR #46 §10.5) — chỉ chính chủ thấy. */
  showOnlineStatus?: boolean;
  /** Huy hiệu bảng thành tích còn hạn — gồm cả huy hiệu giành lúc ẩn danh. */
  badges?: IProfileBadgeDto[];
  slogan?: string | null;
  todayThought?: string | null;
  todayThoughtUpdatedAt?: Date | null;
  introVideoUrl?: string | null;
  introVideoThumbnailUrl?: string | null;
  emailVisibility?: ContactVisibilities;
  phoneVisibility?: ContactVisibilities;
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
  /**
   * Độ chính xác mô tả khi tặng (F43). `null` khi chưa đủ mẫu.
   *
   * **Công khai từ 29/09.** Trước đó chỉ chính chủ và Admin thấy được, nên người
   * đang chọn xin nhận giữa hai người tặng không có gì để so — trong khi cả cơ chế
   * "đủ 5 mẫu mới công bố" được dựng ra chính là để con số này ĐƯỢC công bố mà
   * không bôi nhọ ai.
   */
  accuracy: IGiverAccuracySummaryDto | null;
  /** Điểm sao 1–5 theo từng vai (F42). Công khai từ 29/09. */
  rating: IReviewRatingSummaryDto;
  /** Huy hiệu bảng thành tích còn hạn, KHÔNG gồm huy hiệu giành lúc ẩn danh. */
  badges: IProfileBadgeDto[];
  slogan: string | null;
  todayThought: string | null;
  todayThoughtUpdatedAt: Date | null;
  introVideoUrl: string | null;
  introVideoThumbnailUrl: string | null;
  /** `null` khi người này đang ẩn danh trên bảng thành tích. */
  monthlyStanding: IPublicMonthlyStandingDto | null;
  contacts: IPublicContactsDto;
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
/**
 * Điểm sao 1–5, tách theo vai.
 *
 * Hai con số vì hai người khác nhau đi tìm hai câu trả lời khác nhau: người đang
 * chọn xin nhận muốn biết "tặng có tử tế không", còn chủ bài đang duyệt muốn biết
 * "nhận có đàng hoàng không". Gộp lại thành một điểm là trộn hai câu đó.
 */
export interface IReviewRatingSummaryDto {
  /** Điểm khi người này TẶNG — do những người NHẬN chấm. */
  asGiver: { average: number | null; samples: number };
  /** Điểm khi người này NHẬN — do những người TẶNG chấm. */
  asReceiver: { average: number | null; samples: number };
  /** Số mẫu tối thiểu để điểm bắt đầu được công bố. */
  minSamples: number;
}

export interface IGiverAccuracySummaryDto {
  /** `null` khi chưa đủ số mẫu tối thiểu. */
  percent: number | null;
  samples: number;
  /** Số mẫu tối thiểu để chỉ số bắt đầu có nghĩa. */
  minSamples: number;
}
