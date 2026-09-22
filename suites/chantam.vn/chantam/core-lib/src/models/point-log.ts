/**
 * Câu mô tả một dòng log điểm (CH-2).
 *
 * Cột điểm và cột log nói hai chuyện khác nhau. Cột điểm là số TIÊU ĐƯỢC, kẹp ở
 * 0. Cột log kể lại từng lần cộng/trừ kèm giá trị THẬT sau lần đó — kể cả khi
 * giá trị thật đang âm:
 *
 * ```
 * đang có 20 điểm, bị phạt 50
 *   cột điểm  → 0
 *   dòng log  → "-50 điểm, đang âm 30 điểm"
 * ```
 *
 * Câu dựng ở máy chủ chứ không để mỗi client tự ghép: web và app đọc cùng một
 * chuỗi, nên không có chuyện hai nơi diễn giải "đang âm" khác nhau. Client nào
 * muốn tự trình bày vẫn có `delta` và `rawBalanceAfter` thô bên cạnh.
 */
export function formatPointLogNote(
  delta: number,
  rawBalanceAfter: number,
): string {
  const change = `${delta > 0 ? '+' : ''}${delta} điểm`;
  // Âm thì nói thẳng là âm bao nhiêu. Viết "còn -30 điểm" vừa sai ngữ nghĩa
  // vừa dễ bị đọc nhầm thành còn 30.
  const after =
    rawBalanceAfter < 0
      ? `đang âm ${Math.abs(rawBalanceAfter)} điểm`
      : `còn ${rawBalanceAfter} điểm`;
  return `${change}, ${after}`;
}
