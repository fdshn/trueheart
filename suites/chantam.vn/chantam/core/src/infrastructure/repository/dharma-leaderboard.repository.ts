import {
  IDharmaLeaderboardRepository,
  IForumEngagementRow,
  IRecitationTimeRow,
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

interface IRecitationTimeSqlRow {
  position: number;
  total_seconds: number;
  session_count: number;
  is_anonymous: boolean;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  user_rank: UserRanks;
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

  public async rankRecitationTime(params: {
    start: Date;
    end: Date;
    limit: number;
    sessionCapSeconds: number;
    minimumSeconds: number;
  }): Promise<IRecitationTimeRow[]> {
    // Một phiên tính vào tháng của mốc HOÀN THÀNH — phiên bắt đầu 23:50 ngày 31 và xong
    // 00:20 ngày 1 thuộc tháng sau, trọn vẹn.
    //
    // Gộp khoảng chồng nhau (gaps-and-islands): một phiên mở ra khi khoảng trước của cùng
    // người đã KẾT THÚC thì bắt đầu một "đảo" mới; các phiên cùng đảo gộp thành [min, max].
    // Không gộp thì mở ba bài kinh song song trong một giờ thành ba giờ tụng.
    const rows = await this.manager.query<IRecitationTimeSqlRow[]>(
      `
        WITH sessions AS (
          SELECT user_id, started_at AS from_at,
                 LEAST(completed_at, started_at + make_interval(secs => $4)) AS to_at,
                 completed_at
            FROM dharma_recitations
           WHERE completed_at IS NOT NULL
             AND completed_at >= $1 AND completed_at < $2
             AND duration_seconds >= $5
        ),
        ordered AS (
          SELECT sessions.*,
                 max(to_at) OVER (
                   PARTITION BY user_id ORDER BY from_at, to_at
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                 ) AS previous_end
            FROM sessions
        ),
        islands AS (
          SELECT ordered.*,
                 sum(CASE WHEN previous_end IS NULL OR from_at > previous_end THEN 1 ELSE 0 END)
                   OVER (PARTITION BY user_id ORDER BY from_at, to_at) AS island
            FROM ordered
        ),
        merged AS (
          SELECT user_id, min(from_at) AS from_at, max(to_at) AS to_at,
                 count(*)::int AS session_count, max(completed_at) AS last_at
            FROM islands
           GROUP BY user_id, island
        ),
        per_user AS (
          SELECT user_id,
                 floor(sum(EXTRACT(EPOCH FROM (to_at - from_at))))::int AS total_seconds,
                 sum(session_count)::int AS session_count,
                 max(last_at) AS last_at
            FROM merged
           GROUP BY user_id
        )
        SELECT (row_number() OVER (
                  ORDER BY per_user.total_seconds DESC, per_user.last_at ASC,
                           per_user.user_id ASC))::int AS position,
               per_user.total_seconds, per_user.session_count,
               person.leaderboard_anonymous AS is_anonymous,
               person.username, person.full_name, person.avatar_url,
               person.rank::text AS user_rank
          FROM per_user
          JOIN users person ON person.global_id = per_user.user_id
                           AND person.status = 'ACTIVE' AND person.deleted_at IS NULL
         ORDER BY position
         LIMIT $3
      `,
      [
        params.start,
        params.end,
        params.limit,
        params.sessionCapSeconds,
        params.minimumSeconds,
      ],
    );

    return rows.map((row) => ({
      position: row.position,
      totalSeconds: row.total_seconds,
      sessionCount: row.session_count,
      isAnonymous: row.is_anonymous,
      user: {
        username: row.username,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        rank: row.user_rank,
      },
    }));
  }
}
