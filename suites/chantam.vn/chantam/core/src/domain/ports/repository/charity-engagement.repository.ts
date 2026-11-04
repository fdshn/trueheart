import {
  CharityAnnouncementKind,
  CharityOperationStage,
  CharityRevisionEntity,
  CharityTaskKey,
  CharityTaskStatus,
  CharityTaskUpdateMode,
  ICharityRevisionDraft,
} from '@chantam.vn/chantam.core-lib/models';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 2 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4, §3.7,
 * §3.10, §3.13): lịch sử sửa, checklist tab B, quan tâm, thống kê, outbox thông báo, bản in.
 */

export interface ICharityRevision {
  revisionId: string;
  entity: CharityRevisionEntity;
  entityId: string | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  isPublic: boolean;
  isImportant: boolean;
  changedBy: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Field đã đổi kể từ lúc duyệt — app tô đỏ. Mỗi `entity/entityId/field` một dòng, lần mới nhất. */
export interface ICharityChangedField {
  entity: CharityRevisionEntity;
  entityId: string | null;
  field: string;
  changedAt: Date;
}

export interface ICharityTask {
  taskId: string;
  taskKey: CharityTaskKey;
  scheduledAt: Date | null;
  workNote: string | null;
  remark: string | null;
  picName: string | null;
  picUserId: string | null;
  updateMode: CharityTaskUpdateMode | null;
  status: CharityTaskStatus;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: Date;
}

/** Field bỏ trống (`undefined`) giữ nguyên; `null` là xoá. */
export interface ICharityTaskPatch {
  scheduledAt?: Date | null;
  workNote?: string | null;
  remark?: string | null;
  picName?: string | null;
  picUserId?: string | null;
  updateMode?: CharityTaskUpdateMode | null;
  status?: CharityTaskStatus;
}

export interface ICharityEngagementCounters {
  reactionCount: number;
  commentCount: number;
  followerCount: number;
}

export interface ICharityInternalStats extends ICharityEngagementCounters {
  contributions: {
    pendingReview: number;
    accepted: number;
    partiallyAccepted: number;
    rejected: number;
    withdrawn: number;
    /** Người có ít nhất một đóng góp được chấp nhận (đủ hoặc một phần). */
    acceptedContributors: number;
  };
  participants: { registered: number; cancelled: number };
  volunteers: { registered: number; confirmed: number; cancelled: number };
  reports: { open: number; total: number };
  shares: number;
}

export interface ICharityExport {
  exportId: string;
  campaignId: string;
  sectionKey: CharityOperationStage | null;
  snapshot: Record<string, unknown>;
  lastRevisionId: string | null;
  generatedBy: string | null;
  generatedAt: Date;
}

export interface ICharityAnnouncement {
  announcementId: string;
  campaignId: string;
  kind: CharityAnnouncementKind;
  payload: Record<string, unknown>;
  actorId: string | null;
  createdAt: Date;
}

export interface ICharityPreEventCandidate {
  campaignId: string;
  distributionStartsAt: Date;
}

export interface ICharityEngagementRepository {
  // ── Lịch sử sửa ───────────────────────────────────────────────────────
  /** Mới nhất trước; `beforeRevisionId` là con trỏ trang. */
  listRevisions(params: {
    campaignId: string;
    publicOnly: boolean;
    beforeRevisionId: string | null;
    limit: number;
  }): Promise<ICharityRevision[]>;
  listChangedFields(params: {
    campaignId: string;
    publicOnly: boolean;
  }): Promise<ICharityChangedField[]>;
  lastRevisionId(campaignId: string): Promise<string | null>;

  // ── Checklist tab B ───────────────────────────────────────────────────
  /** Tạo 7 việc mẫu nếu chưa có (idempotent — gọi bao lần cũng chỉ một bộ). */
  ensureTasks(params: {
    campaignId: string;
    schedule: Partial<Record<CharityTaskKey, Date>>;
  }): Promise<void>;
  listTasks(campaignId: string): Promise<ICharityTask[]>;
  /** Đổi trạng thái/mốc ghi revision `TASK` trong cùng transaction. `null` khi không có việc đó. */
  updateTask(params: {
    campaignId: string;
    taskId: string;
    actorId: string;
    patch: ICharityTaskPatch;
  }): Promise<ICharityTask | null>;
  /** Mốc gợi ý cho checklist: hạn nhận hiện vật sớm nhất và giờ bắt đầu bước trao. */
  taskScheduleInputs(campaignId: string): Promise<{
    earliestIntakeDeadline: Date | null;
    distributionStartsAt: Date | null;
  }>;

  // ── Quan tâm, đếm, thống kê ───────────────────────────────────────────
  /** `true` khi vừa thêm; `false` khi đã quan tâm từ trước. */
  follow(campaignId: string, userId: string): Promise<boolean>;
  /** `true` khi vừa bỏ; `false` khi vốn không quan tâm. */
  unfollow(campaignId: string, userId: string): Promise<boolean>;
  isFollowing(campaignId: string, userId: string): Promise<boolean>;
  counters(campaignId: string): Promise<ICharityEngagementCounters>;
  internalStats(campaignId: string): Promise<ICharityInternalStats>;

  // ── Outbox thông báo ──────────────────────────────────────────────────
  /** `false` khi trùng `dedupeKey` (đã xếp từ trước). */
  enqueueAnnouncement(params: {
    campaignId: string;
    kind: CharityAnnouncementKind;
    payload: Record<string, unknown>;
    dedupeKey: string | null;
    actorId: string | null;
  }): Promise<boolean>;
  /** Dự án đã duyệt, chưa đình chỉ, còn ≤ `hours` giờ tới bước trao. */
  listPreEventCandidates(params: {
    hours: number;
    limit: number;
  }): Promise<ICharityPreEventCandidate[]>;
  /** Khoá và trả lô chưa xử lý (`FOR UPDATE SKIP LOCKED` — hai job chạy chồng không gửi đôi). */
  processPendingAnnouncements(
    limit: number,
    handler: (announcement: ICharityAnnouncement) => Promise<number>,
  ): Promise<number>;
  /**
   * Người nhận thông báo theo dự án: người tham gia (đăng ký tham gia hoặc tuyển người còn
   * hiệu lực), người có đóng góp được chấp nhận, người quan tâm. Không trùng, không gồm
   * `excludeUserId` (người vừa gây ra thay đổi).
   */
  listAudience(params: {
    campaignId: string;
    excludeUserId: string | null;
  }): Promise<string[]>;

  // ── Bản in ────────────────────────────────────────────────────────────
  createExport(params: {
    campaignId: string;
    sectionKey: CharityOperationStage | null;
    snapshot: Record<string, unknown>;
    generatedBy: string;
  }): Promise<ICharityExport>;
  findExport(
    campaignId: string,
    exportId: string,
  ): Promise<ICharityExport | null>;
  listExports(campaignId: string, limit: number): Promise<ICharityExport[]>;
}

export const ICharityEngagementRepository = Symbol(
  'ICharityEngagementRepository',
);

export type { ICharityRevisionDraft };
