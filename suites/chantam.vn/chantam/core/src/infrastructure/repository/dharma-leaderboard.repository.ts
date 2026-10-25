import {
  IDharmaLeaderboardRepository,
  IForumEngagementRow,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IForumEngagementSqlRow {
  position: number;
  engagement: number;
  thread_count: number;
  is_anonymous: boolean;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  user_rank: UserRanks;
  thread_id: string;
  thread_title: string;
  thread_engagement: number;
}

@Injectable()
export class DharmaLeaderboardRepository implements IDharmaLeaderboardRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async rankForumEngagement(params: {
    start: Date;
    end: Date;
    limit: number;
  }): Promise<IForumEngagementRow[]> {
    // Đếm từng tương tác từ bảng nguồn để loại được tương tác của CHÍNH tác giả — số đếm
    // tổng trên chủ đề không tách được phần đó, nên không dùng.
    //
    // - Chủ đề phải đang `VISIBLE`: bị ẩn/gỡ do kiểm duyệt là ra khỏi bảng ngay.
    // - Bình luận chỉ tính `VISIBLE` (trả lời nằm cùng bảng, nên được tính như bình luận);
    //   bình luận chờ duyệt, bị ẩn hay bị gỡ không cộng điểm cho ai.
    // - Cảm xúc tính theo `created_at`: đổi loại cảm xúc là UPDATE cùng dòng, không phải một
    //   lượt tương tác mới.
    // - Thứ hạng tính SAU khi lọc tài khoản không còn hoạt động, nên bảng không có lỗ hổng
    //   thứ hạng ở chỗ người bị khoá từng đứng.
    const rows = await this.manager.query<IForumEngagementSqlRow[]>(
      `
        WITH interactions AS (
          SELECT thread.global_id AS thread_id, thread.author_id, comment.created_at AS at
            FROM content_comments comment
            JOIN dharma_threads thread ON thread.global_id = comment.subject_id
           WHERE comment.subject_type = 'DHARMA_THREAD'
             AND comment.status = 'VISIBLE'
             AND comment.author_id <> thread.author_id
             AND comment.created_at >= $1 AND comment.created_at < $2
             AND thread.status = 'VISIBLE'
          UNION ALL
          SELECT thread.global_id, thread.author_id, reaction.created_at
            FROM content_reactions reaction
            JOIN dharma_threads thread ON thread.global_id = reaction.subject_id
           WHERE reaction.subject_type = 'DHARMA_THREAD'
             AND reaction.user_id <> thread.author_id
             AND reaction.created_at >= $1 AND reaction.created_at < $2
             AND thread.status = 'VISIBLE'
        ),
        per_thread AS (
          SELECT thread_id, author_id, count(*)::int AS engagement, max(at) AS last_at
            FROM interactions
           GROUP BY thread_id, author_id
        ),
        per_author AS (
          SELECT author_id, sum(engagement)::int AS engagement,
                 count(*)::int AS thread_count, max(last_at) AS last_at
            FROM per_thread
           GROUP BY author_id
        ),
        top_thread AS (
          SELECT DISTINCT ON (author_id) author_id, thread_id, engagement
            FROM per_thread
           ORDER BY author_id, engagement DESC, last_at ASC, thread_id ASC
        )
        SELECT (row_number() OVER (
                  ORDER BY per_author.engagement DESC, per_author.last_at ASC,
                           per_author.author_id ASC))::int AS position,
               per_author.engagement, per_author.thread_count,
               person.leaderboard_anonymous AS is_anonymous,
               person.username, person.full_name, person.avatar_url,
               person.rank::text AS user_rank,
               top_thread.thread_id, thread.title AS thread_title,
               top_thread.engagement AS thread_engagement
          FROM per_author
          JOIN users person ON person.global_id = per_author.author_id
                           AND person.status = 'ACTIVE' AND person.deleted_at IS NULL
          JOIN top_thread ON top_thread.author_id = per_author.author_id
          JOIN dharma_threads thread ON thread.global_id = top_thread.thread_id
         ORDER BY position
         LIMIT $3
      `,
      [params.start, params.end, params.limit],
    );

    return rows.map((row) => ({
      position: row.position,
      engagementCount: row.engagement,
      threadCount: row.thread_count,
      isAnonymous: row.is_anonymous,
      author: {
        username: row.username,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        rank: row.user_rank,
      },
      topThread: {
        id: row.thread_id,
        title: row.thread_title,
        engagementCount: row.thread_engagement,
      },
    }));
  }
}
