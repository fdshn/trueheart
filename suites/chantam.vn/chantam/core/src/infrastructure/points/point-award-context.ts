import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Gom các khoản điểm được CỘNG cho người gọi trong một request HTTP.
 *
 * Mọi lượt ghi sổ điểm đi qua `PointLedgerRepository`, nên đó là chỗ DUY NHẤT phải báo
 * về đây. Nhờ vậy API mới cộng điểm tự có header `X-Points-*` mà không phải nhớ sửa
 * controller nào — xem `PointsAwardedInterceptor`.
 *
 * Chỉ giữ `entryId`, không giữ số điểm: lượt ghi có thể nằm trong transaction bị
 * rollback sau đó. Interceptor đọc lại các id này từ database trước khi trả response,
 * nên header chỉ nói về điểm ĐÃ commit.
 */
export class PointAwardScope {
  private readonly ids: number[] = [];

  public constructor(public readonly userId: string | null) {}

  /** Chạy `run` trong scope này; mọi lượt ghi sổ bên trong (kể cả qua await) báo về đây. */
  public run<T>(run: () => T): T {
    return storage.run(this, run);
  }

  public get entryIds(): readonly number[] {
    return [...this.ids];
  }

  /** Chỉ dành cho `notePointAward`. */
  public add(entryId: number): void {
    this.ids.push(entryId);
  }
}

const storage = new AsyncLocalStorage<PointAwardScope>();

/**
 * Ghi nhận một bút toán vừa ghi. Bỏ qua khoản trừ, khoản của người khác, và mọi lượt
 * ghi ngoài request (cron, job nền) — ở đó không có response nào để gắn header.
 */
export function notePointAward(entry: {
  userId: string;
  entryId: number;
  delta: number;
}): void {
  const scope = storage.getStore();
  if (!scope || scope.userId === null) return;
  if (entry.delta <= 0 || entry.userId !== scope.userId) return;
  scope.add(entry.entryId);
}
