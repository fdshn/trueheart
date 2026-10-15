import { EntityManager } from 'typeorm';

/**
 * Tra `username` cho một nhóm `global_id` trong MỘT câu lệnh.
 *
 * Dùng cho các trang log (audit, system log) để CMS không phải gọi từng người dùng một.
 * Tra sau khi đã có trang dữ liệu chứ không JOIN vào câu chính: câu chính lọc bằng tên
 * cột trần (`created_at`…) mà `users` cũng có, và đếm tổng phải chạy đúng cùng bộ lọc —
 * JOIN vào là đụng cả hai.
 *
 * Người dùng đã xoá mềm vẫn trả tên: log là lịch sử, và "ai đã làm" không đổi khi tài
 * khoản bị xoá sau đó. Id không còn trong bảng thì vắng mặt trong map — gọi `?? null`.
 */
export async function usernamesByGlobalId(
  manager: Pick<EntityManager, 'query'>,
  globalIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set(globalIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();

  const rows = await manager.query<{ global_id: string; username: string }[]>(
    `SELECT global_id, username FROM users WHERE global_id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.global_id, row.username]));
}
