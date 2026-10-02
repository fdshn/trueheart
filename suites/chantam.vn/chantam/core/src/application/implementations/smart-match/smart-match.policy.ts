import { SmartMatchStopWords } from '@/domain/consts';
import {
  DefaultAllocationPolicy,
  IAllocationMatchWeights,
} from '@chantam.vn/chantam.core-lib/models';

/** Tín hiệu thô của một ứng viên, đọc thẳng từ database. */
export interface ISmartMatchSignals {
  readonly sameCategory: boolean;
  readonly keywordMatched: boolean;
  readonly distanceMeters: number;
  readonly radiusMeters: number;
}

/**
 * Tách từ khoá để dựng truy vấn `tsquery`.
 *
 * Bỏ mọi ký tự không phải chữ/số: token đi thẳng vào `to_tsquery`, mà ở đó
 * `&`, `|`, `!`, `:` đều là toán tử — để lọt là câu truy vấn mang nghĩa khác
 * hẳn, hoặc gãy.
 *
 * Bỏ token một ký tự vì chúng khớp với hầu hết mọi bài, khiến gợi ý loãng.
 */
export function extractSmartMatchKeywords(text: string): string[] {
  const seen = new Set<string>();

  for (const raw of text.toLowerCase().split(/\s+/)) {
    const token = raw.replace(/[^\p{L}\p{N}]/gu, '');

    if (token.length < 2) continue;
    if (SmartMatchStopWords.includes(token)) continue;
    seen.add(token);
  }

  return [...seen];
}

/**
 * Điểm khớp trong [0, 1].
 *
 * Khoảng cách tính ngược: sát bên là 1, tới đúng rìa bán kính là 0. Ra ngoài
 * bán kính thì đã bị lọc từ SQL, nhưng vẫn kẹp về 0 để một lần gọi sai tham số
 * không tạo ra điểm âm.
 *
 * Trọng số là THAM SỐ, không còn là hằng số nhập từ `@/domain/consts`: Admin đổi
 * được chúng qua `PUT /admin/config/allocation-policy`. Mặc định vẫn là đúng ba
 * con số cũ, nên gọi không truyền gì thì kết quả không đổi.
 *
 * Điểm chỉ ở trong [0, 1] khi ba trọng số cộng lại bằng 1 —
 * `normalizeAllocationPolicy` lo việc đó trước khi ghi, nên mọi bộ lấy từ config
 * đều đã chia về tổng 1.
 */
export function scoreSmartMatch(
  signals: ISmartMatchSignals,
  weights: IAllocationMatchWeights = DefaultAllocationPolicy.weights,
): number {
  const proximity =
    signals.radiusMeters <= 0
      ? 0
      : Math.max(0, 1 - signals.distanceMeters / signals.radiusMeters);

  return (
    (signals.sameCategory ? weights.sameCategory : 0) +
    (signals.keywordMatched ? weights.keyword : 0) +
    weights.proximity * proximity
  );
}

/**
 * Lý do gợi ý, để giao diện nói được vì sao bài này hiện ra.
 *
 * Gợi ý không giải thích được thì người dùng không có cách nào đánh giá, mà
 * Smart Match chỉ được phép gợi ý chứ không thay người dùng quyết định.
 */
export function buildSmartMatchReasons(signals: ISmartMatchSignals): string[] {
  const reasons: string[] = [];

  if (signals.sameCategory) reasons.push('SAME_CATEGORY');
  if (signals.keywordMatched) reasons.push('KEYWORD_MATCH');
  if (signals.distanceMeters <= signals.radiusMeters / 2)
    reasons.push('NEARBY');

  return reasons;
}
