import {
  CandidateSelectionCriteria,
  DefaultCandidateSelectionOrder,
  RankOrder,
  UserRanks,
} from '../consts';

/**
 * Số đo của một ứng viên, đủ để xếp theo mọi tiêu chí.
 *
 * Repository lấy hết trong MỘT truy vấn rồi giao cho hàm thuần này xếp. Tách như
 * vậy để chính sách công bằng — thứ Bên A sẽ còn đổi nhiều lần — kiểm được bằng
 * unit test mà không cần database.
 */
export interface ICandidateMetrics {
  requesterId: string;
  /** Mốc vào hàng đợi. Cũng là tiêu chí phá thế hoà cuối cùng. */
  queueJoinedAt: Date;
  /** Khoá chính tăng dần, dùng phá thế hoà khi `queueJoinedAt` trùng nhau. */
  requestId: number;
  rank: UserRanks;
  /** `null` khi người đó chưa đặt Vị trí mặc định. */
  distanceMeters: number | null;
  receivedCount: number;
  cancellationCount: number;
}

/**
 * Chuẩn hoá thứ tự ưu tiên đọc từ cấu hình động.
 *
 * Bỏ mã lạ, bỏ trùng lặp, và **luôn** bổ sung những tiêu chí Admin không khai
 * vào cuối theo thứ tự mặc định. Nhờ vậy danh sách trả về luôn phủ đủ mọi tiêu
 * chí: thiếu một tiêu chí nghĩa là tới đoạn đó không còn gì phá thế hoà, và hai
 * ứng viên khác nhau sẽ xếp hạng theo thứ tự ngẫu nhiên của database.
 *
 * Cấu hình rỗng hoặc rác thì rơi về mặc định chứ không ném lỗi: một dòng config
 * sai không được phép làm chết đường gợi ý người nhận.
 */
export function normalizeCandidateSelectionOrder(
  configured: readonly unknown[] | null | undefined,
): CandidateSelectionCriteria[] {
  const known = new Set<string>(Object.values(CandidateSelectionCriteria));
  const seen = new Set<CandidateSelectionCriteria>();
  const order: CandidateSelectionCriteria[] = [];

  for (const entry of configured ?? []) {
    if (typeof entry !== 'string' || !known.has(entry)) continue;

    const criterion = entry as CandidateSelectionCriteria;
    if (seen.has(criterion)) continue;

    seen.add(criterion);
    order.push(criterion);
  }

  for (const criterion of DefaultCandidateSelectionOrder)
    if (!seen.has(criterion)) {
      seen.add(criterion);
      order.push(criterion);
    }

  return order;
}

/** Âm nghĩa là `a` xếp trước `b`. */
function compareBy(
  criterion: CandidateSelectionCriteria,
  a: ICandidateMetrics,
  b: ICandidateMetrics,
): number {
  switch (criterion) {
    case CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST:
      return a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();

    case CandidateSelectionCriteria.HIGHEST_RANK:
      return RankOrder.indexOf(b.rank) - RankOrder.indexOf(a.rank);

    case CandidateSelectionCriteria.NEAREST:
      // Chưa đặt Vị trí mặc định thì xếp SAU mọi người có toạ độ, chứ không coi
      // như khoảng cách 0. Coi là 0 sẽ đẩy người thiếu dữ liệu lên đầu — thưởng
      // cho việc không khai thông tin.
      if (a.distanceMeters === null && b.distanceMeters === null) return 0;
      if (a.distanceMeters === null) return 1;
      if (b.distanceMeters === null) return -1;
      return a.distanceMeters - b.distanceMeters;

    case CandidateSelectionCriteria.FEWEST_RECEIVED:
      return a.receivedCount - b.receivedCount;

    case CandidateSelectionCriteria.FEWEST_CANCELLATIONS:
      return a.cancellationCount - b.cancellationCount;
  }
}

/**
 * Xếp ứng viên theo thứ tự ưu tiên đã cấu hình.
 *
 * Tiêu chí trước quyết định; hoà thì xét tiêu chí sau. Hoà hết thì phá bằng
 * `queueJoinedAt` rồi `requestId` — **luôn luôn**, kể cả khi Admin không đặt
 * `QUEUE_JOINED_EARLIEST` ở đâu cả. Thiếu mốc phá thế hoà tất định thì cùng một
 * dữ liệu vào sẽ cho hai kết quả khác nhau giữa hai lần chạy, và không ai
 * debug được một quyết định như thế.
 *
 * KHÔNG sửa mảng đầu vào.
 */
export function rankCandidates(
  candidates: readonly ICandidateMetrics[],
  configuredOrder: readonly unknown[] | null | undefined,
): ICandidateMetrics[] {
  const order = normalizeCandidateSelectionOrder(configuredOrder);

  return [...candidates].sort((a, b) => {
    for (const criterion of order) {
      const result = compareBy(criterion, a, b);
      if (result !== 0) return result;
    }

    const byQueue = a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();
    return byQueue !== 0 ? byQueue : a.requestId - b.requestId;
  });
}

/** Ứng viên được đề xuất, hoặc `null` khi không còn ai. */
export function pickNextCandidate(
  candidates: readonly ICandidateMetrics[],
  configuredOrder: readonly unknown[] | null | undefined,
): ICandidateMetrics | null {
  return rankCandidates(candidates, configuredOrder)[0] ?? null;
}
