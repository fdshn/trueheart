import {
  CharityEventStepKey,
  CharityEventStepStatus,
  CharityOperationStage,
  CharityPostAuthorRole,
  CharityPostMediaType,
} from '@chantam.vn/chantam.core-lib/models';

/** Dự án từ thiện — đợt 3 (CHARITY-PROJECT-LIFECYCLE §3.5): timeline, bài ảnh/clip, quota. */

export interface ICharityEventStep {
  stepId: string;
  /** Đợt trao (§3.18); `null` = timeline chung của dự án (dự án một đợt). */
  roundId: string | null;
  stepKey: CharityEventStepKey;
  plannedAt: Date | null;
  actualAt: Date | null;
  status: CharityEventStepStatus;
  note: string | null;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: Date;
}

/** `undefined` giữ nguyên, `null` xoá. */
export interface ICharityEventStepPatch {
  plannedAt?: Date | null;
  actualAt?: Date | null;
  status?: CharityEventStepStatus;
  note?: string | null;
}

export interface ICharityUserBrief {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ICharityPostMedia {
  storageKey: string;
  publicUrl: string;
  mediaType: CharityPostMediaType;
  sortOrder: number;
  /** Độ dài clip (giây) client khai lúc xin đường tải; `null` với ảnh. */
  durationSeconds: number | null;
}

export interface ICharityPost {
  postId: string;
  campaignId: string;
  author: ICharityUserBrief;
  authorRole: CharityPostAuthorRole;
  stage: CharityOperationStage;
  body: string | null;
  media: ICharityPostMedia[];
  reactionCount: number;
  commentCount: number;
  createdAt: Date;
  deletedAt: Date | null;
  hiddenAt: Date | null;
}

export type CharityUploadReservation<T> =
  | { status: 'RESERVED'; upload: T }
  | { status: 'QUOTA_EXCEEDED'; used: number };

export interface ICharityEventRepository {
  // ── Timeline ──────────────────────────────────────────────────────────
  /** Tạo đủ 10 bước cho dự án (`roundId` null) hoặc cho một đợt trao. Có rồi thì thôi. */
  ensureEventSteps(campaignId: string, roundId?: string | null): Promise<void>;
  listEventSteps(
    campaignId: string,
    roundId?: string | null,
  ): Promise<ICharityEventStep[]>;
  updateEventStep(params: {
    campaignId: string;
    stepId: string;
    actorId: string;
    patch: ICharityEventStepPatch;
  }): Promise<ICharityEventStep | null>;

  // ── Quyền đăng của participant ────────────────────────────────────
  /** Đã check-in (hoặc đã hoàn thành) ở dự án — đủ điều kiện đăng ảnh/clip sự kiện. */
  isAttendedParticipant(campaignId: string, userId: string): Promise<boolean>;
  /** Lần gần nhất dự án sang Tổng kết (nhật ký giai đoạn); `null` khi chưa ghi. */
  summaryStartedAt(campaignId: string): Promise<Date | null>;

  // ── Quota và đường tải ────────────────────────────────────────────────
  /**
   * Dưới khoá advisory (người + dự án): đếm lượt ký từ `since` của loại media này; còn suất
   * thì gọi `sign` rồi ghi lượt ký — hai lượt ký song song không cùng lọt suất cuối.
   */
  reserveUpload<T extends { key: string }>(params: {
    campaignId: string;
    userId: string;
    mediaType: CharityPostMediaType;
    since: Date;
    quota: number;
    /** Độ dài clip đã kiểm ở tầng trên — lưu để chép sang media của bài. */
    durationSeconds?: number | null;
    sign: () => Promise<T>;
  }): Promise<CharityUploadReservation<T>>;
  usedUploads(params: {
    campaignId: string;
    userId: string;
    since: Date;
  }): Promise<Record<CharityPostMediaType, number>>;

  // ── Bài ───────────────────────────────────────────────────────────────
  /**
   * Tiêu các lượt ký (`consumed_at`) rồi tạo bài, cùng transaction. `MEDIA_INVALID` khi một
   * khoá không phải lượt ký còn mới của chính người này cho dự án này, hoặc sai loại.
   */
  createPost(params: {
    campaignId: string;
    authorId: string;
    authorRole: CharityPostAuthorRole;
    stage: CharityOperationStage;
    body: string | null;
    media: {
      storageKey: string;
      publicUrl: string;
      mediaType: CharityPostMediaType;
    }[];
  }): Promise<ICharityPost | 'MEDIA_INVALID'>;
  /** Bài đang hiện (chưa xoá, chưa ẩn), mới nhất trước. */
  listPosts(params: {
    campaignId: string;
    beforePostId: string | null;
    limit: number;
  }): Promise<ICharityPost[]>;
  /** Kể cả bài đã xoá/ẩn — để kiểm quyền và báo xấu. */
  findPost(postId: string): Promise<ICharityPost | null>;
  deletePost(params: {
    campaignId: string;
    postId: string;
    actorId: string;
  }): Promise<boolean>;
}

export const ICharityEventRepository = Symbol('ICharityEventRepository');
