import {
  IContentReactionRepository,
  IContentSubjectRef,
  IReactionActor,
  IReactionSummary,
  ISetReactionParams,
  IToggleLikeResult,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

/**
 * Bảng và cột đếm tương ứng với từng loại chủ thể.
 *
 * Gom vào một chỗ vì đây là phần duy nhất của tính năng cảm xúc còn biết chủ
 * thể là cái gì. Rải `if subjectType === POST` khắp nơi thì thêm Dharma Hub sẽ
 * phải sửa từng chỗ, và chỗ bị quên sẽ im lặng đếm sai.
 *
 * `likeColumn` chỉ bài đăng mới có: `posts.like_count` đếm RIÊNG `kind = LIKE`
 * để `POST /posts/:id/like` trả đúng con số nó vẫn hứa, trong khi
 * `reaction_count` đếm mọi người đã bày tỏ bất kể loại nào. Bình luận không có
 * nút thích riêng nên không cần cột thứ hai.
 */
const CounterTargets: Record<
  ContentSubjectTypes,
  {
    table: string;
    keyColumn: string;
    countColumn: string;
    likeColumn: string | null;
  } | null
> = {
  [ContentSubjectTypes.POST]: {
    table: 'posts',
    keyColumn: 'global_id',
    countColumn: 'reaction_count',
    likeColumn: 'like_count',
  },
  [ContentSubjectTypes.COMMENT]: {
    table: 'content_comments',
    keyColumn: 'global_id',
    countColumn: 'reaction_count',
    likeColumn: null,
  },
  // Chưa có bảng — chỗ dành sẵn, và `null` ở đây khiến việc quên nối số đếm
  // trở thành một dòng đọc được thay vì một lỗi âm thầm.
  [ContentSubjectTypes.DHARMA_THREAD]: null,
};

function isLike(kind: ReactionKinds | null): number {
  return kind === ReactionKinds.LIKE ? 1 : 0;
}

@Injectable()
export class ContentReactionRepository implements IContentReactionRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  private async bumpCounter(
    manager: EntityManager,
    subject: IContentSubjectRef,
    delta: number,
    likeDelta: number,
  ): Promise<void> {
    const target = CounterTargets[subject.subjectType];
    if (!target) return;
    if (delta === 0 && likeDelta === 0) return;

    // GREATEST(0, ...) là lưới an toàn cho ràng buộc `>= 0`: nếu có đường nào
    // đó làm lệch, ta muốn số đếm dừng ở 0 chứ không muốn một câu DELETE hợp lệ
    // vỡ vì một con số sai từ trước. `syncCounters` mới là chỗ sửa cho đúng.
    const assignments = [
      `${target.countColumn} = GREATEST(0, ${target.countColumn} + $2)`,
    ];
    const parameters: unknown[] = [subject.subjectId, delta];

    if (target.likeColumn) {
      assignments.push(
        `${target.likeColumn} = GREATEST(0, ${target.likeColumn} + $3)`,
      );
      parameters.push(likeDelta);
    }

    await manager.query(
      `
        UPDATE ${target.table}
        SET ${assignments.join(', ')}
        WHERE ${target.keyColumn} = $1
      `,
      parameters,
    );
  }

  /**
   * Tính lại cả hai cột đếm từ chính bảng cảm xúc.
   *
   * Đắt hơn cộng trừ nên chỉ dùng khi đường cộng trừ không biết chắc loại cũ —
   * xem ghi chú về đua trong `setReaction`. Cũng là phép toán mà CLI đối soát
   * sẽ gọi lại.
   */
  private async syncCounters(
    manager: EntityManager,
    subject: IContentSubjectRef,
  ): Promise<void> {
    const target = CounterTargets[subject.subjectType];
    if (!target) return;

    const assignments = [
      `${target.countColumn} = (
        SELECT COUNT(*) FROM content_reactions
        WHERE subject_type = $2 AND subject_id = $1
      )`,
    ];
    if (target.likeColumn) {
      assignments.push(
        `${target.likeColumn} = (
          SELECT COUNT(*) FROM content_reactions
          WHERE subject_type = $2 AND subject_id = $1 AND kind = 'LIKE'
        )`,
      );
    }

    await manager.query(
      `
        UPDATE ${target.table}
        SET ${assignments.join(', ')}
        WHERE ${target.keyColumn} = $1
      `,
      [subject.subjectId, subject.subjectType],
    );
  }

  /**
   * Đặt hoặc đổi cảm xúc, trong transaction do bên gọi mở.
   *
   * `prev` đọc loại cũ TRƯỚC khi upsert chạy — cùng một ảnh chụp, nên nó thấy
   * đúng trạng thái mà câu lệnh này sắp ghi đè.
   */
  private async applySet(
    manager: EntityManager,
    params: ISetReactionParams,
  ): Promise<{ created: boolean; previousKind: ReactionKinds | null }> {
    // `xmax = 0` phân biệt INSERT thật với UPDATE do ON CONFLICT: Postgres để
    // xmax bằng 0 trên dòng vừa chèn. Thiếu phép phân biệt này thì đổi cảm
    // xúc từ LIKE sang LOVE sẽ cộng thêm một vào tổng — cùng một người mà
    // thành hai lượt.
    const [row] = await manager.query<
      { inserted: boolean; old_kind: ReactionKinds | null }[]
    >(
      `
        WITH prev AS (
          SELECT kind FROM content_reactions
          WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3
          FOR UPDATE
        ), upserted AS (
          INSERT INTO content_reactions
            (subject_type, subject_id, user_id, kind)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (subject_type, subject_id, user_id)
          DO UPDATE SET kind = EXCLUDED.kind, updated_at = now()
          RETURNING (xmax = 0) AS inserted
        )
        SELECT upserted.inserted, prev.kind AS old_kind
        FROM upserted LEFT JOIN prev ON true
      `,
      [params.subjectType, params.subjectId, params.userId, params.kind],
    );

    if (row.inserted) {
      await this.bumpCounter(manager, params, 1, isLike(params.kind));
      return { created: true, previousKind: null };
    }

    // Không chèn mới nhưng `prev` rỗng nghĩa là có request song song của CHÍNH
    // người này vừa chèn xong sau khi ảnh chụp được lấy. Cộng trừ lúc này sẽ
    // đoán sai loại cũ, nên tính lại cho chắc — hiếm, và rẻ hơn một số đếm sai.
    if (row.old_kind === null) {
      await this.syncCounters(manager, params);
      return { created: false, previousKind: null };
    }

    await this.bumpCounter(
      manager,
      params,
      0,
      isLike(params.kind) - isLike(row.old_kind),
    );
    return { created: false, previousKind: row.old_kind };
  }

  private async applyRemove(
    manager: EntityManager,
    params: IContentSubjectRef & { userId: string },
  ): Promise<ReactionKinds | null> {
    const deleted = await updateReturning<{
      id: string;
      kind: ReactionKinds;
    }>(
      manager,
      `
        DELETE FROM content_reactions
        WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3
        RETURNING id, kind
      `,
      [params.subjectType, params.subjectId, params.userId],
    );
    if (deleted.length === 0) return null;

    await this.bumpCounter(manager, params, -1, -isLike(deleted[0].kind));
    return deleted[0].kind;
  }

  public async setReaction(
    params: ISetReactionParams,
  ): Promise<{ created: boolean; kind: ReactionKinds }> {
    return this.manager.transaction(async (manager) => {
      const { created } = await this.applySet(manager, params);
      return { created, kind: params.kind };
    });
  }

  public async removeReaction(
    params: IContentSubjectRef & { userId: string },
  ): Promise<boolean> {
    return this.manager.transaction(
      async (manager) => (await this.applyRemove(manager, params)) !== null,
    );
  }

  public async toggleLike(
    subjectId: string,
    userId: string,
  ): Promise<IToggleLikeResult> {
    const subject = {
      subjectType: ContentSubjectTypes.POST,
      subjectId,
    } as const;

    return this.manager.transaction(async (manager) => {
      // Đọc và khoá trong cùng transaction với lần ghi, nên hai lần bấm song
      // song xếp hàng thay vì cùng thấy "chưa thích" rồi cùng cộng.
      const [current] = await manager.query<{ kind: ReactionKinds }[]>(
        `
          SELECT kind FROM content_reactions
          WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3
          FOR UPDATE
        `,
        [subject.subjectType, subjectId, userId],
      );

      let liked: boolean;
      if (current?.kind === ReactionKinds.LIKE) {
        await this.applyRemove(manager, { ...subject, userId });
        liked = false;
      } else {
        // Đang để LOVE mà bấm thích thì thành LIKE: vẫn một người bày tỏ, nên
        // `reaction_count` đứng yên còn `like_count` tăng.
        await this.applySet(manager, {
          ...subject,
          userId,
          kind: ReactionKinds.LIKE,
        });
        liked = true;
      }

      const [row] = await manager.query<{ like_count: string | number }[]>(
        `SELECT like_count FROM posts WHERE global_id = $1`,
        [subjectId],
      );

      return { liked, likeCount: Number(row?.like_count ?? 0) };
    });
  }

  public async summarize(
    subject: IContentSubjectRef,
    viewerId: string | null,
  ): Promise<IReactionSummary> {
    const target = CounterTargets[subject.subjectType];
    const [counter] = target
      ? await this.manager.query<{ total: number | string }[]>(
          `
            SELECT ${target.countColumn} AS total
            FROM ${target.table}
            WHERE ${target.keyColumn} = $1
          `,
          [subject.subjectId],
        )
      : [{ total: 0 }];

    const rows = await this.manager.query<
      { kind: ReactionKinds; count: string }[]
    >(
      `
        SELECT kind, COUNT(*) AS count
        FROM content_reactions
        WHERE subject_type = $1 AND subject_id = $2
        GROUP BY kind
      `,
      [subject.subjectType, subject.subjectId],
    );

    const breakdown: Partial<Record<ReactionKinds, number>> = {};
    for (const row of rows) breakdown[row.kind] = Number(row.count);

    let myReaction: ReactionKinds | null = null;
    if (viewerId) {
      const [mine] = await this.manager.query<{ kind: ReactionKinds }[]>(
        `
          SELECT kind FROM content_reactions
          WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3
        `,
        [subject.subjectType, subject.subjectId, viewerId],
      );
      myReaction = mine?.kind ?? null;
    }

    return { total: Number(counter?.total ?? 0), breakdown, myReaction };
  }

  public async findMyReactions(
    subjectType: ContentSubjectTypes,
    subjectIds: readonly string[],
    viewerId: string,
  ): Promise<Map<string, ReactionKinds>> {
    if (subjectIds.length === 0) return new Map();

    const rows = await this.manager.query<
      { subject_id: string; kind: ReactionKinds }[]
    >(
      `
        SELECT subject_id, kind
        FROM content_reactions
        WHERE subject_type = $1
          AND subject_id = ANY($2::uuid[])
          AND user_id = $3
      `,
      [subjectType, [...subjectIds], viewerId],
    );

    return new Map(rows.map((row) => [row.subject_id, row.kind]));
  }

  public async listActors(params: {
    subject: IContentSubjectRef;
    kind?: ReactionKinds | null;
    skip: number;
    take: number;
  }): Promise<{ items: IReactionActor[]; total: number }> {
    // `$3::text` là NULL khi không lọc, và mệnh đề tự vô hiệu. Ghép chuỗi SQL
    // theo nhánh thì hai biến thể sẽ lệch nhau khi một bên được sửa.
    const filter = params.kind ?? null;

    const rows = await this.manager.query<
      {
        user_id: string;
        username: string;
        full_name: string | null;
        kind: ReactionKinds;
        created_at: Date;
      }[]
    >(
      `
        SELECT reaction.user_id, actor.username, actor.full_name,
               reaction.kind, reaction.created_at
        FROM content_reactions reaction
        JOIN users actor ON actor.global_id = reaction.user_id
        WHERE reaction.subject_type = $1
          AND reaction.subject_id = $2
          AND ($3::text IS NULL OR reaction.kind::text = $3)
        ORDER BY reaction.created_at DESC, reaction.id DESC
        LIMIT $4 OFFSET $5
      `,
      [
        params.subject.subjectType,
        params.subject.subjectId,
        filter,
        params.take,
        params.skip,
      ],
    );

    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM content_reactions
        WHERE subject_type = $1 AND subject_id = $2
          AND ($3::text IS NULL OR kind::text = $3)
      `,
      [params.subject.subjectType, params.subject.subjectId, filter],
    );

    return {
      items: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        fullName: row.full_name,
        kind: row.kind,
        reactedAt: row.created_at,
      })),
      total: Number(total),
    };
  }
}
