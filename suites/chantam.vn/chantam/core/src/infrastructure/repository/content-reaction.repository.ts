import {
  IContentReactionRepository,
  IContentSubjectRef,
  IReactionActor,
  IReactionSummary,
  ISetReactionParams,
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
 * Chỉ MỘT cột đếm cho mỗi chủ thể. `LIKE` là một trong năm loại cảm xúc chứ
 * không phải một hệ thống riêng, nên `reaction_count` đếm mọi người đã bày tỏ
 * bất kể loại — không có cột thứ hai đếm riêng lượt thích.
 */
const CounterTargets: Record<
  ContentSubjectTypes,
  { table: string; keyColumn: string; countColumn: string } | null
> = {
  [ContentSubjectTypes.POST]: {
    table: 'posts',
    keyColumn: 'global_id',
    countColumn: 'reaction_count',
  },
  [ContentSubjectTypes.COMMENT]: {
    table: 'content_comments',
    keyColumn: 'global_id',
    countColumn: 'reaction_count',
  },
  // Chưa có bảng — chỗ dành sẵn, và `null` ở đây khiến việc quên nối số đếm
  // trở thành một dòng đọc được thay vì một lỗi âm thầm.
  [ContentSubjectTypes.DHARMA_THREAD]: null,
};

@Injectable()
export class ContentReactionRepository implements IContentReactionRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  private async bumpCounter(
    manager: EntityManager,
    subject: IContentSubjectRef,
    delta: number,
  ): Promise<void> {
    const target = CounterTargets[subject.subjectType];
    if (!target) return;
    if (delta === 0) return;

    // GREATEST(0, ...) là lưới an toàn cho ràng buộc `>= 0`: nếu có đường nào
    // đó làm lệch, ta muốn số đếm dừng ở 0 chứ không muốn một câu DELETE hợp lệ
    // vỡ vì một con số sai từ trước. `syncCounters` mới là chỗ sửa cho đúng.
    await manager.query(
      `
        UPDATE ${target.table}
        SET ${target.countColumn} = GREATEST(0, ${target.countColumn} + $2)
        WHERE ${target.keyColumn} = $1
      `,
      [subject.subjectId, delta],
    );
  }

  /**
   * Tính lại cột đếm từ chính bảng cảm xúc.
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

    await manager.query(
      `
        UPDATE ${target.table}
        SET ${target.countColumn} = (
          SELECT COUNT(*) FROM content_reactions
          WHERE subject_type = $2 AND subject_id = $1
        )
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
    // Ba trạng thái, phân biệt bằng `inserted`:
    //
    //   `true`   — chèn dòng mới. `xmax = 0` là dấu hiệu: Postgres để xmax bằng
    //              0 trên dòng vừa chèn, khác với dòng bị UPDATE. Thiếu phép
    //              phân biệt này thì đổi LIKE sang LOVE sẽ cộng thêm một vào
    //              tổng — cùng một người mà thành hai lượt.
    //   `false`  — đụng khoá và ĐÃ ghi đè, tức loại thật sự đổi.
    //   `null`   — đụng khoá nhưng KHÔNG ghi gì, vì `WHERE` bên dưới chặn lại.
    //
    // Mệnh đề `WHERE ... IS DISTINCT FROM` là chỗ tiết kiệm: gửi đúng loại đang
    // có thì Postgres không ghi phiên bản dòng mới, không sinh WAL, không thêm
    // mục index, không để lại dòng chết cho vacuum. Không có nó thì mỗi lần
    // client gửi trùng — chạm hai lần vì tưởng máy lag, retry khi mạng chập
    // chờn, hai thiết bị cùng đồng bộ — đều là một lần ghi thật vào bảng.
    //
    // `FROM (SELECT 1)` rồi LEFT JOIN cả hai CTE: cần LUÔN đúng một dòng trả
    // về. Nối thẳng từ `upserted` thì lúc không ghi gì sẽ ra 0 dòng, và mất
    // luôn `old_kind` — không phân biệt được "không đổi" với "không có".
    const [row] = await manager.query<
      { inserted: boolean | null; old_kind: ReactionKinds | null }[]
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
          WHERE content_reactions.kind IS DISTINCT FROM EXCLUDED.kind
          RETURNING (xmax = 0) AS inserted
        )
        SELECT upserted.inserted, prev.kind AS old_kind
        FROM (SELECT 1) AS always
        LEFT JOIN prev ON true
        LEFT JOIN upserted ON true
      `,
      [params.subjectType, params.subjectId, params.userId, params.kind],
    );

    if (row.inserted === true) {
      await this.bumpCounter(manager, params, 1);
      return { created: true, previousKind: null };
    }

    // `prev` rỗng mà vẫn đụng khoá nghĩa là có request song song của CHÍNH
    // người này vừa chèn xong sau khi ảnh chụp được lấy. Cộng trừ lúc này sẽ
    // đoán sai loại cũ, nên tính lại cho chắc — hiếm, và rẻ hơn một số đếm sai.
    if (row.old_kind === null) {
      await this.syncCounters(manager, params);
      return { created: false, previousKind: null };
    }

    // Còn lại là đổi loại, hoặc gửi trùng loại đang có. Cả hai đều KHÔNG đụng
    // số đếm: vẫn là một người bày tỏ. Loại cũ vẫn phải đọc ra vì nơi gọi cần
    // biết đây là lượt mới hay chỉ đổi ý — thông báo "lần đầu trong ngày" chỉ
    // bắn cho lượt mới.
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

    await this.bumpCounter(manager, params, -1);
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
