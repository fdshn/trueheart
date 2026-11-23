import {
  IPostAuthorDto,
  IPublicAuthorSummaryDto,
  IPublicUserProfileDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';

type AuthorSource = Pick<
  IUserEntity,
  'globalId' | 'username' | 'fullName' | 'avatarUrl' | 'rank' | 'createdAt'
>;

function displayName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Tác giả bài đăng. MỘT chỗ dựng, dùng cho chi tiết bài, quanh đây và Smart Match — trước
 * 25/10 có ba bản viết tay, và một bản thiếu trường là ba màn hình hiện tác giả ba kiểu.
 */
export function toPublicAuthor(user: AuthorSource): IPostAuthorDto {
  return {
    id: user.globalId,
    username: user.username,
    fullName: displayName(user.fullName),
    avatarUrl: user.avatarUrl,
    rank: user.rank,
    joinedAt: user.createdAt,
  };
}

/** Bốn trường của author summary chuẩn — bình luận, Diễn đàn, bảng xếp hạng. */
export function toPublicAuthorSummary(
  user: Pick<IUserEntity, 'username' | 'fullName' | 'avatarUrl' | 'rank'>,
): IPublicAuthorSummaryDto {
  return {
    username: user.username,
    fullName: displayName(user.fullName),
    avatarUrl: user.avatarUrl,
    rank: user.rank,
  };
}

/** Năm trường hồ sơ công khai (CR 22/11/2026) — `displayName` = họ tên, trống thì `username`. */
export function toPublicUserProfile(
  user: Pick<
    IUserEntity,
    'globalId' | 'username' | 'fullName' | 'avatarUrl' | 'rank'
  >,
): IPublicUserProfileDto {
  const summary = toPublicAuthorSummary(user);
  return {
    userId: user.globalId,
    username: summary.username,
    displayName: summary.fullName ?? summary.username,
    avatarUrl: summary.avatarUrl,
    rank: summary.rank,
  };
}
