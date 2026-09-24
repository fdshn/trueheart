import {
  IFeedCountDrift,
  IReconcileFeedCountsCommand,
  IReconcileFeedCountsResult,
  IReconcileFeedCountsUseCase,
} from '@/application/contracts/feed';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IDriftRow {
  subject_id: string;
  column_name: string;
  stored: string;
  actual: string;
}

/**
 * Đối soát số đếm tương tác với dữ liệu thật.
 *
 * Số đếm là **cột** chứ không phải `COUNT(*)` mỗi lần đọc (QĐ-2), và cái giá
 * của lựa chọn đó là chúng có thể trôi: một đường ghi bỏ sót, một tiến trình
 * chết giữa transaction, một lần sửa tay trên production. `GREATEST(0, ...)`
 * trong repository chỉ chặn số âm chứ không kéo số về đúng — đây mới là chỗ
 * sửa.
 *
 * Chạy bằng `npm run feed:reconcile-counts`, thêm `--dry-run` để chỉ xem.
 */
@Injectable()
export class ReconcileFeedCountsUseCase implements IReconcileFeedCountsUseCase {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async handle(
    command: IReconcileFeedCountsCommand,
  ): Promise<IReconcileFeedCountsResult> {
    const dryRun = command.dryRun === true;

    // So cột đếm với số dòng thật. `LEFT JOIN LATERAL` để bài không có tương
    // tác nào vẫn hiện ra — chính chúng mới hay mang số đếm thừa từ một lần
    // xoá không sạch.
    const postDrifts = await this.manager.query<IDriftRow[]>(`
      SELECT post.global_id AS subject_id, drift.column_name,
             drift.stored::text AS stored, drift.actual::text AS actual
      FROM posts post
      CROSS JOIN LATERAL (
        SELECT 'reaction_count' AS column_name,
               post.reaction_count AS stored,
               (SELECT COUNT(*) FROM content_reactions
                WHERE subject_type = 'POST' AND subject_id = post.global_id) AS actual
        UNION ALL
        SELECT 'like_count',
               post.like_count,
               (SELECT COUNT(*) FROM content_reactions
                WHERE subject_type = 'POST' AND subject_id = post.global_id
                  AND kind = 'LIKE')
        UNION ALL
        SELECT 'comment_count',
               post.comment_count,
               (SELECT COUNT(*) FROM content_comments
                WHERE subject_type = 'POST' AND subject_id = post.global_id
                  AND status <> 'REMOVED' AND parent_id IS NULL)
        UNION ALL
        SELECT 'share_count',
               post.share_count,
               (SELECT COUNT(*) FROM content_shares
                WHERE subject_type = 'POST' AND subject_id = post.global_id)
      ) drift
      WHERE drift.stored <> drift.actual
    `);

    const commentDrifts = await this.manager.query<IDriftRow[]>(`
      SELECT comment.global_id AS subject_id, drift.column_name,
             drift.stored::text AS stored, drift.actual::text AS actual
      FROM content_comments comment
      CROSS JOIN LATERAL (
        SELECT 'reaction_count' AS column_name,
               comment.reaction_count AS stored,
               (SELECT COUNT(*) FROM content_reactions
                WHERE subject_type = 'COMMENT'
                  AND subject_id = comment.global_id) AS actual
        UNION ALL
        SELECT 'reply_count',
               comment.reply_count,
               (SELECT COUNT(*) FROM content_comments reply
                WHERE reply.parent_id = comment.global_id
                  AND reply.status <> 'REMOVED')
        UNION ALL
        SELECT 'media_count',
               comment.media_count,
               (SELECT COUNT(*) FROM content_comment_media
                WHERE comment_id = comment.global_id)
      ) drift
      WHERE drift.stored <> drift.actual
    `);

    const drifts: IFeedCountDrift[] = [
      ...postDrifts.map((row) => ({
        subject: 'POST' as const,
        subjectId: row.subject_id,
        column: row.column_name,
        stored: Number(row.stored),
        actual: Number(row.actual),
      })),
      ...commentDrifts.map((row) => ({
        subject: 'COMMENT' as const,
        subjectId: row.subject_id,
        column: row.column_name,
        stored: Number(row.stored),
        actual: Number(row.actual),
      })),
    ];

    const [{ scanned }] = await this.manager.query<{ scanned: string }[]>(`
      SELECT (
        (SELECT COUNT(*) FROM posts) + (SELECT COUNT(*) FROM content_comments)
      )::text AS scanned
    `);

    if (dryRun || drifts.length === 0)
      return { scanned: Number(scanned), drifts, repaired: 0 };

    // Sửa trong MỘT transaction: nửa chừng mà chết thì số đếm còn tệ hơn lúc
    // chưa chạy, vì một nửa đã đúng còn một nửa vẫn sai mà không ai biết nửa nào.
    const repaired = await this.manager.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE posts post SET
          reaction_count = (SELECT COUNT(*) FROM content_reactions
                            WHERE subject_type = 'POST'
                              AND subject_id = post.global_id),
          like_count     = (SELECT COUNT(*) FROM content_reactions
                            WHERE subject_type = 'POST'
                              AND subject_id = post.global_id
                              AND kind = 'LIKE'),
          comment_count  = (SELECT COUNT(*) FROM content_comments
                            WHERE subject_type = 'POST'
                              AND subject_id = post.global_id
                              AND status <> 'REMOVED' AND parent_id IS NULL),
          share_count    = (SELECT COUNT(*) FROM content_shares
                            WHERE subject_type = 'POST'
                              AND subject_id = post.global_id)
        WHERE post.global_id = ANY($1::uuid[])
      `,
        [postDrifts.map((row) => row.subject_id)],
      );

      await manager.query(
        `
        UPDATE content_comments comment SET
          reaction_count = (SELECT COUNT(*) FROM content_reactions
                            WHERE subject_type = 'COMMENT'
                              AND subject_id = comment.global_id),
          reply_count    = (SELECT COUNT(*) FROM content_comments reply
                            WHERE reply.parent_id = comment.global_id
                              AND reply.status <> 'REMOVED'),
          media_count    = (SELECT COUNT(*) FROM content_comment_media
                            WHERE comment_id = comment.global_id)
        WHERE comment.global_id = ANY($1::uuid[])
      `,
        [commentDrifts.map((row) => row.subject_id)],
      );

      return drifts.length;
    });

    return { scanned: Number(scanned), drifts, repaired };
  }
}
