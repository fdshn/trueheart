import {
  ContentSubjectTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';

export interface IContentSubjectRef {
  readonly subjectType: ContentSubjectTypes;
  readonly subjectId: string;
}

export interface ISetReactionParams extends IContentSubjectRef {
  readonly userId: string;
  readonly kind: ReactionKinds;
}

export interface IReactionSummary {
  /** Tổng số người đã bày tỏ, đọc từ cột đếm chứ không COUNT(*). */
  readonly total: number;
  /** Số lượt theo từng loại, chỉ gồm loại thực sự có người chọn. */
  readonly breakdown: Partial<Record<ReactionKinds, number>>;
  /** Cảm xúc của chính người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập. */
  readonly myReaction: ReactionKinds | null;
}

export interface IReactionActor {
  readonly userId: string;
  readonly username: string;
  readonly fullName: string | null;
  readonly kind: ReactionKinds;
  readonly reactedAt: Date;
}

export interface IContentReactionRepository {
  /**
   * Đặt hoặc ĐỔI cảm xúc. Bình thái — gọi hai lần cho cùng một kết quả.
   *
   * Số đếm trên chủ thể được cập nhật trong **cùng transaction**, và chỉ tăng
   * khi đây thật sự là lượt bày tỏ mới. Đổi từ `LIKE` sang `LOVE` không được
   * làm tổng tăng thêm một — đó vẫn là một người.
   */
  setReaction(params: ISetReactionParams): Promise<{
    /** `true` khi vừa thêm mới, `false` khi chỉ đổi loại. */
    created: boolean;
    kind: ReactionKinds;
  }>;
  /** Gỡ cảm xúc. Trả `false` khi người này vốn chưa bày tỏ gì. */
  removeReaction(
    params: IContentSubjectRef & { userId: string },
  ): Promise<boolean>;
  /**
   * Tổng hợp cảm xúc của một chủ thể.
   *
   * `total` đọc từ cột đếm; `breakdown` mới phải nhóm từ bảng cảm xúc. Chấp
   * nhận được vì đây là màn chi tiết một bài, không phải vòng lặp bảng tin.
   */
  summarize(
    subject: IContentSubjectRef,
    viewerId: string | null,
  ): Promise<IReactionSummary>;
  /**
   * Cảm xúc của người gọi trên NHIỀU chủ thể cùng lúc.
   *
   * Một truy vấn cho cả trang bảng tin. Hỏi từng bài một là 20 lần đi database
   * mỗi lần cuộn.
   */
  findMyReactions(
    subjectType: ContentSubjectTypes,
    subjectIds: readonly string[],
    viewerId: string,
  ): Promise<Map<string, ReactionKinds>>;
  /** Ai đã bày tỏ, phân trang, lọc theo loại. */
  listActors(params: {
    subject: IContentSubjectRef;
    kind?: ReactionKinds | null;
    skip: number;
    take: number;
  }): Promise<{ items: IReactionActor[]; total: number }>;
}

export const IContentReactionRepository = Symbol('IContentReactionRepository');
