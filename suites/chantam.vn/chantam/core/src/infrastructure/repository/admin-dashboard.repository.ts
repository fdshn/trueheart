import { IAdminDashboard } from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Số liệu điều hành (F59).
 *
 * **Đếm SỐNG, không có bảng tổng hợp.** Một bảng tổng hợp đòi job cập nhật, một
 * đường đối soát khi job chết, và một câu trả lời cho "vì sao số trên dashboard
 * khác số khi đếm tay". Với dữ liệu ở quy mô hiện tại thì cái giá đó lớn hơn hẳn
 * cái lợi. Khi nào chậm thật thì thêm bảng, và lúc đó sẽ biết cần tổng hợp gì.
 *
 * Mỗi chỉ số một truy vấn thay vì một câu ghép: một câu 5 nhánh `COUNT(*) FILTER`
 * trên 5 bảng khác nhau phải CROSS JOIN chúng lại, và đọc nó sáu tháng sau là một
 * buổi chiều. Năm câu rời thì mỗi câu đọc được một mình.
 */
@Injectable()
export class AdminDashboardRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async read(windowDays: number): Promise<IAdminDashboard> {
    const [users] = await this.manager.query<
      { total: string; recent: string; viewers: string }[]
    >(
      `
        SELECT COUNT(*)::text AS total,
               COUNT(*) FILTER (
                 WHERE created_at >= now() - ($1 || ' days')::interval
               )::text AS recent,
               COUNT(*) FILTER (WHERE rank = 'VIEWER')::text AS viewers
        FROM users
        WHERE deleted_at IS NULL
      `,
      [String(windowDays)],
    );

    // Phân bổ hạng đọc từ chính `users.rank`, không tính lại từ điểm: dashboard
    // phải nói đúng cái mà hệ thống đang DÙNG để cấp quyền, kể cả khi nó đang lệch
    // với điểm. Tính lại ở đây sẽ che mất chính xác loại lệch cần thấy.
    const ranks = await this.manager.query<{ rank: string; total: string }[]>(
      `
        SELECT rank, COUNT(*)::text AS total
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY rank
        ORDER BY rank
      `,
    );

    const categories = await this.manager.query<
      { category: string; total: string }[]
    >(
      `
        SELECT category.name AS category, COUNT(post.id)::text AS total
        FROM categories category
        LEFT JOIN posts post
          ON post.category_id = category.global_id
          AND post.deleted_at IS NULL
          AND post.status::text IN ('PUBLISHED', 'RESERVED', 'COMPLETED')
        GROUP BY category.name
        ORDER BY COUNT(post.id) DESC, category.name ASC
      `,
    );

    const [posts] = await this.manager.query<
      { published: string; reserved: string; completed: string }[]
    >(
      `
        SELECT COUNT(*) FILTER (WHERE status = 'PUBLISHED')::text AS published,
               COUNT(*) FILTER (WHERE status = 'RESERVED')::text AS reserved,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::text AS completed
        FROM posts
        WHERE deleted_at IS NULL
      `,
    );

    const [transactions] = await this.manager.query<
      { live: string; completed: string; recent: string; cancelled: string }[]
    >(
      `
        SELECT COUNT(*) FILTER (
                 WHERE status IN ('ACCEPTED', 'DELIVERING')
               )::text AS live,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::text AS completed,
               COUNT(*) FILTER (
                 WHERE status = 'COMPLETED'
                   AND completed_at >= now() - ($1 || ' days')::interval
               )::text AS recent,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')::text AS cancelled
        FROM gift_transactions
      `,
      [String(windowDays)],
    );

    // Dung lượng đếm bằng SỐ OBJECT, không phải byte.
    //
    // Không bảng nào lưu kích thước: `post_media` có `r2_key`,
    // `chat_message_media` có `storage_key`, và hết. Đo byte thật đòi gọi ra
    // storage cho từng object — một lượt gọi mạng dài trong một endpoint dashboard.
    // Trả số object và nói rõ đó là số object, thay vì quy đổi bằng một kích thước
    // trung bình bịa ra.
    const [media] = await this.manager.query<
      { post_objects: string; chat_objects: string }[]
    >(
      `
        SELECT (SELECT COUNT(*) FROM post_media)::text AS post_objects,
               (SELECT COUNT(*) FROM chat_message_media)::text AS chat_objects
      `,
    );

    const [queues] = await this.manager.query<
      { open_reports: string; pending_comments: string }[]
    >(
      `
        SELECT (
                 SELECT COUNT(*) FROM reports
                 WHERE status IN ('PENDING', 'IN_REVIEW')
               )::text AS open_reports,
               (
                 SELECT COUNT(*) FROM content_comments
                 WHERE status = 'PENDING_REVIEW'
               )::text AS pending_comments
      `,
    );

    return {
      windowDays,
      users: {
        total: Number(users?.total ?? 0),
        newInWindow: Number(users?.recent ?? 0),
        viewers: Number(users?.viewers ?? 0),
        byRank: ranks.map((row) => ({
          rank: row.rank,
          total: Number(row.total),
        })),
      },
      posts: {
        published: Number(posts?.published ?? 0),
        reserved: Number(posts?.reserved ?? 0),
        completed: Number(posts?.completed ?? 0),
        byCategory: categories.map((row) => ({
          category: row.category,
          total: Number(row.total),
        })),
      },
      transactions: {
        live: Number(transactions?.live ?? 0),
        completed: Number(transactions?.completed ?? 0),
        completedInWindow: Number(transactions?.recent ?? 0),
        cancelled: Number(transactions?.cancelled ?? 0),
      },
      media: {
        postObjects: Number(media?.post_objects ?? 0),
        chatObjects: Number(media?.chat_objects ?? 0),
      },
      queues: {
        openReports: Number(queues?.open_reports ?? 0),
        pendingComments: Number(queues?.pending_comments ?? 0),
      },
    };
  }
}
