/**
 * Sàng từ ngữ không cho phép trong nội dung người dùng viết.
 *
 * **Nói trước cho rõ: đây KHÔNG phải kiểm duyệt.** Một danh sách từ cấm bắt được
 * những trường hợp lười — người gõ thẳng từ bậy. Nó không bắt được mỉa mai, đe
 * doạ lịch sự, hay lừa đảo; và nó luôn vừa bỏ sót vừa bắt nhầm. Giá trị thật của
 * nó là giảm tải cho người kiểm duyệt, không phải thay thế họ. Tin rằng bật bộ
 * lọc này là xong việc kiểm duyệt là cách chắc chắn để bỏ mặc phần khó.
 *
 * ## Vì sao phải chuẩn hoá trước khi so
 *
 * So thẳng chuỗi thô thì `đm`, `Đ.M`, `đ m`, `đmmmm`, `dm` là năm thứ khác nhau,
 * trong khi người đọc thấy cùng một từ. Nên mọi thứ đi qua một phép chuẩn hoá:
 *
 * ```
 * "Đ.Mmmm  mày"  →  spaced   "d m may"
 *                →  squeezed "dmmay"
 *                →  joined   "dm may"      (gộp các chữ cái đứng lẻ)
 * ```
 *
 * Ví dụ trên từng ghi `"d mm may"` — sai, và sai từ lúc phép rút chữ lặp đổi từ
 * "về hai chữ" sang "về MỘT chữ". Không phép kiểm nào khẳng định nó nên nó nằm
 * đó cho tới 30/09; `content-moderation.corpus.spec` nay canh đúng ba dạng này.
 *
 * Ba dạng vì mỗi dạng bắt một kiểu lách khác nhau, và mỗi dạng cũng bắt nhầm một
 * kiểu khác nhau — xem `screenText`.
 */

/** Mức độ, quyết định nơi gọi làm gì tiếp. */
export enum ModerationSeverities {
  /** Chặn hẳn: nội dung không được tạo. */
  BLOCK = 'BLOCK',
  /** Cho tạo nhưng ẩn khỏi công khai và đẩy vào hàng đợi Admin. */
  REVIEW = 'REVIEW',
}

export enum ModerationVerdicts {
  ALLOW = 'ALLOW',
  REVIEW = 'REVIEW',
  BLOCK = 'BLOCK',
}

export interface IBlockedTerm {
  term: string;
  severity: ModerationSeverities;
}

export interface IModerationScreening {
  verdict: ModerationVerdicts;
  /** Những mục đã khớp, để Admin xem được vì sao nội dung bị chặn. */
  matched: string[];
}

export const ModerationTermsConfigKey = 'moderation.blocked_terms';

/**
 * Từ ngắn hơn ngưỡng này KHÔNG được so trên dạng `squeezed`.
 *
 * Bỏ hết dấu cách rồi tìm chuỗi con là cách bắt nhầm hàng loạt: từ cấm hai chữ
 * cái sẽ nằm lọt trong vô số câu hiền lành. Từ dài thì xác suất trùng ngẫu nhiên
 * gần như không còn.
 */
const MinSqueezedMatchLength = 4;

/** Chữ số và ký hiệu hay dùng để thay chữ cái. */
const LeetMap: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/**
 * Chuẩn hoá một đoạn chữ về dạng so sánh được.
 *
 * `đ` phải map tay: nó là một ký tự riêng (U+0111) chứ không phải `d` cộng dấu,
 * nên tách dấu Unicode không đụng tới nó. Thiếu bước này thì mọi từ tiếng Việt
 * bắt đầu bằng `đ` lọt lưới.
 */
export function normalizeForModeration(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[đĐ]/g, 'd')
      // Tách dấu rồi bỏ phần dấu: "ụ" → "u".
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Bỏ ký tự vô hình — cách lách rẻ nhất là chèn zero-width vào giữa từ.
      .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
      .replace(/[01345 7@$]/g, (char) => LeetMap[char] ?? char)
      // Kéo dài chữ để lách: "dmmmm", "dmm", "dm" phải về cùng một dạng. Rút về
      // MỘT chữ chứ không phải hai — rút về hai thì "dmm" và "dm" vẫn khác nhau,
      // tức chỉ cần gõ thêm một chữ là luồn qua. An toàn vì mục cấm cũng đi qua
      // ĐÚNG phép chuẩn hoá này, nên hai bên luôn gặp nhau ở cùng một dạng.
      .replace(/([a-z0-9])\1+/g, '$1')
      // Mọi thứ không phải chữ/số thành một dấu cách.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Gộp những chữ cái đứng lẻ liền nhau thành một từ.
 *
 * Đây là cách lách phổ biến nhất: `đ m`, `đ.m`, `đ-m`. Sau chuẩn hoá chúng thành
 * `d m` — hai từ một chữ cái. Gộp lại được `dm`, khớp với mục cấm.
 *
 * Chỉ gộp chữ cái ĐỨNG LẺ, nên `anh e oi` không bị biến thành `anheoi`.
 */
export function joinIsolatedLetters(spaced: string): string {
  const parts: string[] = [];
  let run = '';

  for (const token of spaced.split(' ')) {
    if (token.length === 1) {
      run += token;
      continue;
    }
    if (run) {
      parts.push(run);
      run = '';
    }
    parts.push(token);
  }
  if (run) parts.push(run);

  return parts.join(' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Khớp cả cụm theo ranh giới từ, nên `dm` không khớp trong `admin`. */
function matchesAsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(?:^| )${escapeRegExp(needle)}(?: |$)`).test(haystack);
}

/**
 * Đọc cấu hình về dạng dùng được, chấp nhận mọi thứ rác.
 *
 * Cấu hình hỏng thì trả danh sách RỖNG, tức không chặn gì. Cố ý: một dòng JSON
 * gõ nhầm không được biến thành "chặn mọi bình luận" — người dùng sẽ không hiểu
 * chuyện gì đang xảy ra, và không ai nối được lỗi đó với ô cấu hình.
 */
export function normalizeBlockedTerms(raw: unknown): IBlockedTerm[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const terms: IBlockedTerm[] = [];

  for (const entry of raw) {
    const source =
      typeof entry === 'string'
        ? { term: entry, severity: ModerationSeverities.BLOCK }
        : (entry as Record<string, unknown> | null);
    if (!source || typeof source.term !== 'string') continue;

    // Mục cấm cũng phải gộp chữ cái đứng lẻ: Admin gõ "đ.m" thì sau chuẩn hoá là
    // "d m" — hai từ, không khớp với gì. Phải ra cùng dạng với nội dung được sàng.
    const term = joinIsolatedLetters(normalizeForModeration(source.term));
    if (!term || seen.has(term)) continue;
    seen.add(term);

    terms.push({
      term,
      severity:
        source.severity === ModerationSeverities.REVIEW
          ? ModerationSeverities.REVIEW
          : ModerationSeverities.BLOCK,
    });
  }

  return terms;
}

/**
 * Sàng một đoạn chữ.
 *
 * Ba phép so, mỗi phép bịt một kiểu lách:
 *
 * | Dạng | Bắt được | Bắt nhầm nếu dùng một mình |
 * | --- | --- | --- |
 * | `spaced` | gõ thẳng, và cụm nhiều từ | — |
 * | `joined` | `đ m`, `đ.m` | — |
 * | `squeezed` | `đ ụ  m á` (rải dấu cách) | từ ngắn lọt vào câu hiền lành |
 *
 * Nên `squeezed` chỉ áp cho mục đủ dài (xem `MinSqueezedMatchLength`).
 *
 * `BLOCK` thắng `REVIEW`: một nội dung dính cả hai mức thì mức nặng quyết định.
 */
export function screenText(
  text: string,
  terms: readonly IBlockedTerm[],
): IModerationScreening {
  if (terms.length === 0)
    return { verdict: ModerationVerdicts.ALLOW, matched: [] };

  const spaced = normalizeForModeration(text);
  if (!spaced) return { verdict: ModerationVerdicts.ALLOW, matched: [] };

  const joined = joinIsolatedLetters(spaced);
  const squeezed = spaced.replace(/ /g, '');

  const matched: string[] = [];
  let severest: ModerationVerdicts = ModerationVerdicts.ALLOW;

  for (const { term, severity } of terms) {
    const hit =
      matchesAsWords(spaced, term) ||
      matchesAsWords(joined, term) ||
      (term.replace(/ /g, '').length >= MinSqueezedMatchLength &&
        squeezed.includes(term.replace(/ /g, '')));
    if (!hit) continue;

    matched.push(term);
    if (severity === ModerationSeverities.BLOCK)
      severest = ModerationVerdicts.BLOCK;
    else if (severest === ModerationVerdicts.ALLOW)
      severest = ModerationVerdicts.REVIEW;
  }

  return { verdict: severest, matched };
}
