import { SeedDharmaThreadIds } from './dharma-merit';
import { ISeedContext, Personas, SeedDomains, seedId } from './seed-context';

const comment = (n: number) => seedId(SeedDomains.comments, n);
const post = (n: number) => seedId(SeedDomains.posts, n);

/** Bài có tương tác: hai bài seed mới và hai bài của seed demo cũ. */
const Subjects = {
  completedBooks: post(3),
  sosWheelchair: post(10),
  desks: post(12),
  legacyKeyboard: '20000000-0000-4000-8000-000000000011',
} as const;

interface ISeedComment {
  n: number;
  subjectType: 'POST' | 'DHARMA_THREAD';
  subjectId: string;
  authorId: string;
  body: string;
  status?: 'VISIBLE' | 'PENDING_REVIEW' | 'HIDDEN' | 'REMOVED';
  parent?: number;
  flaggedTerms?: string;
  media?: number;
}

const Comments: readonly ISeedComment[] = [
  {
    n: 1,
    subjectType: 'POST',
    subjectId: Subjects.sosWheelchair,
    authorId: Personas.giver,
    body: 'Nhà mình có xe lăn cũ, mai mình mang qua được không?',
    media: 1,
  },
  {
    n: 2,
    subjectType: 'POST',
    subjectId: Subjects.sosWheelchair,
    authorId: Personas.coordinator,
    body: 'Dạ được ạ, cảm ơn anh nhiều lắm!',
    parent: 1,
  },
  {
    n: 3,
    subjectType: 'POST',
    subjectId: Subjects.sosWheelchair,
    authorId: Personas.giver2,
    body: 'Mình chia sẻ lên nhóm phường rồi nhé.',
  },
  {
    n: 4,
    subjectType: 'POST',
    subjectId: Subjects.sosWheelchair,
    authorId: Personas.suspended,
    body: 'Liên hệ zalo riêng để mua xe lăn giá rẻ',
    status: 'PENDING_REVIEW',
    flaggedTerms: 'zalo riêng',
  },
  {
    n: 5,
    subjectType: 'POST',
    subjectId: Subjects.desks,
    authorId: Personas.receiver,
    body: 'Bàn ghế còn chắc không bạn? Mình cho lớp học tình thương.',
  },
  {
    n: 6,
    subjectType: 'POST',
    subjectId: Subjects.desks,
    authorId: Personas.groupOwner,
    body: 'Chắc lắm bạn, chỉ trầy mặt bàn chút thôi.',
    parent: 5,
  },
  {
    n: 7,
    subjectType: 'POST',
    subjectId: Subjects.desks,
    authorId: Personas.suspended,
    body: 'Bình luận đã bị Admin ẩn vì spam.',
    status: 'HIDDEN',
  },
  {
    n: 8,
    subjectType: 'POST',
    subjectId: Subjects.completedBooks,
    authorId: Personas.receiver,
    body: 'Con mình đọc mê lắm, cảm ơn anh!',
  },
  {
    n: 9,
    subjectType: 'POST',
    subjectId: Subjects.completedBooks,
    authorId: Personas.newcomer,
    body: 'Bình luận tác giả đã tự xoá.',
    status: 'REMOVED',
  },
  {
    n: 10,
    subjectType: 'POST',
    subjectId: Subjects.legacyKeyboard,
    authorId: Personas.coordinator,
    body: 'Bàn phím này gõ có ồn không bạn?',
  },
  {
    n: 11,
    subjectType: 'DHARMA_THREAD',
    subjectId: SeedDharmaThreadIds[0],
    authorId: Personas.giver,
    body: 'Cảm ơn bạn đã chia sẻ, mình cũng tụng mỗi sáng.',
  },
  {
    n: 12,
    subjectType: 'DHARMA_THREAD',
    subjectId: SeedDharmaThreadIds[0],
    authorId: Personas.groupOwner,
    body: 'Tụng buổi sáng tâm an hơn hẳn.',
    parent: 11,
  },
];

const Reactions: ReadonlyArray<[string, string, string, string]> = [
  ['POST', Subjects.sosWheelchair, Personas.giver, 'CARE'],
  ['POST', Subjects.sosWheelchair, Personas.giver2, 'LOVE'],
  ['POST', Subjects.sosWheelchair, Personas.receiver, 'SAD'],
  ['POST', Subjects.sosWheelchair, Personas.groupOwner, 'CARE'],
  ['POST', Subjects.desks, Personas.receiver, 'LIKE'],
  ['POST', Subjects.desks, Personas.coordinator, 'WOW'],
  ['POST', Subjects.completedBooks, Personas.receiver, 'LOVE'],
  ['POST', Subjects.legacyKeyboard, Personas.receiver, 'LIKE'],
  ['POST', Subjects.legacyKeyboard, Personas.coordinator, 'LIKE'],
  ['COMMENT', comment(1), Personas.coordinator, 'LOVE'],
  ['COMMENT', comment(1), Personas.giver2, 'LIKE'],
  ['COMMENT', comment(5), Personas.groupOwner, 'LIKE'],
  ['DHARMA_THREAD', SeedDharmaThreadIds[0], Personas.receiver, 'LOVE'],
];

const Shares: ReadonlyArray<[string, string, string | null]> = [
  [Subjects.sosWheelchair, Personas.giver2, 'zalo'],
  [Subjects.sosWheelchair, Personas.groupOwner, 'facebook'],
  [Subjects.sosWheelchair, Personas.receiver, 'copy_link'],
  [Subjects.desks, Personas.coordinator, null],
];

export async function seedFeed(ctx: ISeedContext): Promise<void> {
  for (const item of Comments)
    await ctx.q(
      `
        INSERT INTO content_comments (
          global_id, subject_type, subject_id, author_id, body, status, depth,
          parent_id, parent_depth, media_count, flagged_terms
        )
        VALUES ($1, $2::content_subject_type_enum, $3, $4, $5,
                $6::content_comment_status_enum, $7, $8, $9, $10, $11)
        ON CONFLICT DO NOTHING
      `,
      [
        comment(item.n),
        item.subjectType,
        item.subjectId,
        item.authorId,
        item.body,
        item.status ?? 'VISIBLE',
        item.parent ? 2 : 1,
        item.parent ? comment(item.parent) : null,
        item.parent ? 1 : null,
        item.media ?? 0,
        item.flaggedTerms ?? null,
      ],
    );

  for (const item of Comments)
    for (let slot = 1; slot <= (item.media ?? 0); slot += 1)
      await ctx.q(
        `
          INSERT INTO content_comment_media (comment_id, slot, storage_key)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [
          comment(item.n),
          slot,
          `users/${item.authorId}/comments/${comment(item.n)}/${slot}.webp`,
        ],
      );

  for (const [type, subjectId, userId, kind] of Reactions)
    await ctx.q(
      `
        INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
        VALUES ($1::content_subject_type_enum, $2, $3, $4::content_reaction_kind_enum)
        ON CONFLICT DO NOTHING
      `,
      [type, subjectId, userId, kind],
    );

  // `content_shares` không có khoá tự nhiên: mỗi lượt bấm chia sẻ là một dòng.
  for (const [subjectId, userId, channel] of Shares)
    await ctx.q(
      `
        INSERT INTO content_shares (subject_type, subject_id, user_id, channel)
        SELECT 'POST', $1, $2, $3::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM content_shares
          WHERE subject_id = $1 AND user_id = $2
            AND channel IS NOT DISTINCT FROM $3::varchar
        )
      `,
      [subjectId, userId, channel],
    );

  await reconcileFeedCounters(ctx);
}

/**
 * Tính lại bộ đếm từ dòng gốc, theo đúng quy tắc của repository: CHỈ bình luận
 * `VISIBLE` được đếm vào `comment_count`/`reply_count`.
 *
 * Tính lại thay vì cộng dồn khi chèn: cộng dồn mà chạy seed hai lần là số đếm gấp đôi,
 * còn tính lại thì chạy bao nhiêu lần cũng ra một số. Chỉ đụng chủ thể có dòng seed.
 */
async function reconcileFeedCounters(ctx: ISeedContext): Promise<void> {
  const postIds = [...new Set(Object.values(Subjects))];
  await ctx.q(
    `
      UPDATE posts p SET
        comment_count = (
          SELECT count(*) FROM content_comments c
          WHERE c.subject_type = 'POST' AND c.subject_id = p.global_id
            AND c.status = 'VISIBLE'
        ),
        reaction_count = (
          SELECT count(*) FROM content_reactions r
          WHERE r.subject_type = 'POST' AND r.subject_id = p.global_id
        ),
        share_count = (
          SELECT count(*) FROM content_shares s
          WHERE s.subject_type = 'POST' AND s.subject_id = p.global_id
        )
      WHERE p.global_id = ANY($1::uuid[])
    `,
    [postIds],
  );
  await ctx.q(
    `
      UPDATE content_comments c SET
        reply_count = (
          SELECT count(*) FROM content_comments child
          WHERE child.parent_id = c.global_id AND child.status = 'VISIBLE'
        ),
        reaction_count = (
          SELECT count(*) FROM content_reactions r
          WHERE r.subject_type = 'COMMENT' AND r.subject_id = c.global_id
        )
      WHERE c.global_id = ANY($1::uuid[])
    `,
    [Comments.map((item) => comment(item.n))],
  );
}
