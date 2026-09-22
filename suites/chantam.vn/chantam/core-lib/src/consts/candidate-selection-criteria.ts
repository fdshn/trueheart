/**
 * Tiêu chí chọn người nhận khi hệ thống phải tự xếp thứ tự ứng viên.
 *
 * Dùng ở hai chỗ, cùng một thứ tự ưu tiên:
 *
 * - **F33** — gợi ý người kế tiếp sau khi một lượt trao bị huỷ.
 * - **F75** — tự chọn khi hết countdown 7 ngày mà không ai đổi điểm.
 *
 * Hai chỗ phải dùng CHUNG một chính sách. Nếu mỗi chỗ tự xếp một kiểu thì cùng
 * một bài đăng sẽ đề xuất hai người khác nhau tuỳ đường nào chạy trước, và
 * không ai giải thích được vì sao.
 *
 * **Thứ tự ưu tiên do Admin cấu hình** (CH-1 đã chốt), không hard-code: "ai xin
 * trước" và "ai gần nhất" là hai quan niệm công bằng khác nhau, và chọn hộ Bên A
 * là quyết định nghiệp vụ nằm sai chỗ.
 */
export enum CandidateSelectionCriteria {
  /** Ai gửi yêu cầu sớm nhất. Tiêu chí duy nhất người dùng tự kiểm chứng được. */
  QUEUE_JOINED_EARLIEST = 'QUEUE_JOINED_EARLIEST',
  /** Thứ hạng cao hơn được ưu tiên. */
  HIGHEST_RANK = 'HIGHEST_RANK',
  /** Gần điểm hẹn hơn được ưu tiên. Ai chưa đặt Vị trí mặc định xếp sau cùng. */
  NEAREST = 'NEAREST',
  /** Ai đã nhận được ít quà hơn thì ưu tiên — trải đều thay vì dồn một người. */
  FEWEST_RECEIVED = 'FEWEST_RECEIVED',
  /** Ai ít huỷ lượt trao hơn thì ưu tiên. */
  FEWEST_CANCELLATIONS = 'FEWEST_CANCELLATIONS',
}

/**
 * Khoá cấu hình động trong `system_configs`.
 *
 * Theo quy ước chấm của các khoá sẵn có (`discovery.default_radius_meters`,
 * `rank.maintenance_period_months`), không dùng UPPER_SNAKE — lệch quy ước thì
 * màn cấu hình của CMS xếp nó lạc khỏi nhóm.
 */
export const CandidateSelectionConfigKey = 'selection.candidate_priority';

/**
 * Thứ tự mặc định khi Admin chưa cấu hình gì.
 *
 * "Ai xin trước" đứng đầu vì đây là tiêu chí **duy nhất** người dùng tự kiểm
 * chứng được: họ biết mình bấm lúc nào. Mọi tiêu chí còn lại đều dựa vào dữ liệu
 * họ không thấy, nên đặt lên đầu là mời câu hỏi "vì sao không phải tôi" mà không
 * có câu trả lời nào thoả đáng.
 */
export const DefaultCandidateSelectionOrder: readonly CandidateSelectionCriteria[] =
  [
    CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST,
    CandidateSelectionCriteria.FEWEST_CANCELLATIONS,
    CandidateSelectionCriteria.FEWEST_RECEIVED,
    CandidateSelectionCriteria.NEAREST,
    CandidateSelectionCriteria.HIGHEST_RANK,
  ];
