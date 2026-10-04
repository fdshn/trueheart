/**
 * Công đức / Hồi hướng — phần THUẦN (SRS UI-MERIT-01, F65 phân hệ 4).
 *
 * UI-MERIT-01: *"hiển thị thông tin đơn vị/chùa/quỹ do Admin tự tạo và đăng từ CMS, mục đích
 * trợ duyên, thông tin tài khoản/QR/VietQR và CTA mở ứng dụng ngân hàng. User tự khai số tiền
 * dự định/đã thực hiện trước khi deep-link sang ứng dụng ngân hàng; hệ thống **không mặc định
 * xác minh giao dịch ngân hàng**. Sổ vàng/Hồi hướng mặc định công khai, nhưng user có tùy chọn
 * ẩn danh."*
 *
 * ## Số tiền CÓ lưu, và phải hiện rõ nó là LỜI KHAI
 *
 * Bên A đã chốt: có lưu. Nhưng hệ thống không có đường nào đối chiếu với ngân hàng, nên con
 * số đó là *lời khai của người dùng*, không phải một giao dịch đã xác minh.
 *
 * Hệ quả bắt buộc, và đây là chỗ dễ sai nhất của cả phân hệ: `declared_amount` **không được
 * cộng vào bất cứ tổng nào trình bày như số tiền đã quyên góp**. Một trang "Chùa X đã nhận
 * 500 triệu" dựng từ lời khai là một con số Bên A sẽ bị hỏi và không trả lời được. Nên ở đây
 * chỉ có `totalDeclaredAmount` kèm tên nói rõ "declared", và không có hàm nào gọi nó là
 * `totalReceived` hay `raised`.
 *
 * Tương tự, số tiền KHÔNG sinh điểm. Không có `MERIT_DECLARED` trong point rule, và cố ý:
 * một con số không kiểm được mà đẻ ra điểm là mở đường để gõ 10 tỷ lấy điểm.
 *
 * ## Ẩn danh là ẨN TÊN, không phải ẩn hàng
 *
 * `is_anonymous` giữ nguyên `user_id` trong database — cần để người dùng xem lại lịch sử của
 * chính mình, và để Admin xử lý khi có tranh chấp. Chỉ ĐƯỜNG ĐỌC công khai bỏ tên đi. Xoá
 * `user_id` để "ẩn danh cho chắc" là đổi một tuỳ chọn hiển thị thành mất dữ liệu.
 *
 * ## VietQR: lưu tham số, không lưu ảnh
 *
 * Mã VietQR dựng được từ `bank_bin` + `bank_account_number` + số tiền. Lưu một ảnh PNG là
 * lưu một thứ không sửa được khi đơn vị đổi số tài khoản, và không chèn được số tiền động.
 */

/** Loại đơn vị nhận công đức. */
export const MeritUnitTypes = ['TEMPLE', 'FUND', 'ORGANIZATION'] as const;

export type MeritUnitType = (typeof MeritUnitTypes)[number];

export const MeritUnitTypeLabels: Readonly<Record<MeritUnitType, string>> = {
  TEMPLE: 'Chùa / Tự viện',
  FUND: 'Quỹ từ thiện',
  ORGANIZATION: 'Tổ chức',
};

/**
 * Trạng thái một lời khai.
 *
 * `INTENDED` là "dự định chuyển", `COMPLETED` là "đã chuyển" — đúng hai thứ UI-MERIT-01 nêu.
 * Cả hai đều là LỜI KHAI; `COMPLETED` **không** nghĩa là hệ thống đã xác minh.
 */
export const MeritDeclarationStatuses = ['INTENDED', 'COMPLETED'] as const;

export type MeritDeclarationStatus = (typeof MeritDeclarationStatuses)[number];

export const MaxMeritUnitNameLength = 200;
export const MaxMeritUnitPurposeLength = 2_000;
export const MaxMeritBankAccountLength = 50;
export const MaxMeritNoteLength = 500;

/**
 * Trần số tiền một lời khai: 10 tỷ VNĐ.
 *
 * Không phải để "chống gian lận" — con số này vốn không kiểm được, nên trần không làm nó
 * đáng tin hơn. Trần ở đây để một lượt gõ nhầm (thêm ba số 0) không phá thang hiển thị của
 * Sổ vàng: một hàng 10.000 tỷ làm mọi hàng thật co về 0 pixel.
 */
export const MaxMeritDeclaredAmount = 10_000_000_000;

/** Tối thiểu 1.000 VNĐ — dưới mức đó là gõ nhầm hoặc thử hệ thống. */
export const MinMeritDeclaredAmount = 1_000;

/**
 * BIN ngân hàng theo chuẩn Napas: đúng sáu chữ số.
 *
 * Kiểm độ dài và chữ số thôi, KHÔNG kiểm xem BIN đó có thật: danh sách BIN thay đổi khi có
 * ngân hàng mới, và một allowlist chép tay sẽ chặn đúng ngân hàng mới đó. Sai BIN thì mã QR
 * không quét được, và đó là lỗi người dùng thấy ngay — khác hẳn một lỗi âm thầm.
 */
const BankBinShape = /^[0-9]{6}$/;

export function isMeritBankBin(value: unknown): value is string {
  return typeof value === 'string' && BankBinShape.test(value);
}

/** Số tài khoản: chữ số, có thể có chữ cái với một số ngân hàng. */
const BankAccountShape = /^[0-9A-Za-z]{4,}$/;

export function isMeritBankAccountNumber(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MaxMeritBankAccountLength &&
    BankAccountShape.test(value)
  );
}

export function isMeritDeclaredAmount(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= MinMeritDeclaredAmount &&
    (value as number) <= MaxMeritDeclaredAmount
  );
}

/**
 * Dựng chuỗi deep link VietQR theo quy ước `img.vietqr.io`.
 *
 * Dựng ở backend một lần thay vì để mỗi client tự ghép: thứ tự tham số và cách encode phần
 * nội dung chuyển khoản là chỗ dễ lệch, và hai client ghép khác nhau sẽ cho hai mã khác
 * nhau cho cùng một đơn vị.
 *
 * `amount` tuỳ chọn — không truyền thì mã QR để người chuyển tự nhập, đúng ca "dự định
 * chuyển nhưng chưa quyết số".
 */
export function buildVietQrUrl(input: {
  readonly bankBin: string;
  readonly accountNumber: string;
  readonly accountName: string;
  readonly amount?: number | null;
  readonly note?: string | null;
}): string {
  const base = `https://img.vietqr.io/image/${input.bankBin}-${input.accountNumber}-compact2.png`;
  const params = new URLSearchParams();
  params.set('accountName', input.accountName);
  // `amount` chỉ gắn khi là số hợp lệ VÀ dương. Gắn `0` làm một số app ngân hàng hiểu
  // thành "chuyển 0 đồng" rồi báo lỗi, thay vì để trống cho người dùng tự nhập.
  if (
    typeof input.amount === 'number' &&
    Number.isFinite(input.amount) &&
    input.amount > 0
  )
    params.set('amount', String(Math.trunc(input.amount)));
  if (input.note) params.set('addInfo', input.note);

  return `${base}?${params.toString()}`;
}

/** Những chỗ khiến một đơn vị Công đức KHÔNG tạo được. */
export function meritUnitGaps(input: {
  readonly name: string;
  readonly unitType: unknown;
  readonly purpose: string;
  readonly bankBin: unknown;
  readonly bankAccountNumber: unknown;
  readonly bankAccountName: string;
}): string[] {
  const gaps: string[] = [];

  if (input.name.trim().length < 3) gaps.push('name phải có ít nhất 3 ký tự');
  if (input.name.length > MaxMeritUnitNameLength)
    gaps.push(`name không vượt ${MaxMeritUnitNameLength} ký tự`);

  if (!MeritUnitTypes.includes(input.unitType as MeritUnitType))
    gaps.push(`unitType phải là một trong: ${MeritUnitTypes.join(', ')}`);

  if (input.purpose.trim().length < 10)
    gaps.push(
      'purpose phải có ít nhất 10 ký tự — mục đích trợ duyên là thứ người dùng đọc trước khi chuyển tiền',
    );
  if (input.purpose.length > MaxMeritUnitPurposeLength)
    gaps.push(`purpose không vượt ${MaxMeritUnitPurposeLength} ký tự`);

  // Ba trường ngân hàng phải ĐỦ BỘ. Thiếu một trường là một mã QR không quét được, và
  // người dùng chỉ phát hiện sau khi đã mở app ngân hàng.
  if (!isMeritBankBin(input.bankBin))
    gaps.push('bankBin phải là sáu chữ số theo chuẩn Napas');
  if (!isMeritBankAccountNumber(input.bankAccountNumber))
    gaps.push('bankAccountNumber phải là chữ và số, ít nhất 4 ký tự');
  if (input.bankAccountName.trim().length === 0)
    gaps.push(
      'bankAccountName không được rỗng — người chuyển cần đối chiếu tên thụ hưởng trước khi bấm xác nhận',
    );

  return gaps;
}

/** Những chỗ khiến một lời khai KHÔNG ghi được. */
export function meritDeclarationGaps(input: {
  readonly declaredAmount: unknown;
  readonly status: unknown;
  readonly note?: unknown;
}): string[] {
  const gaps: string[] = [];

  if (!isMeritDeclaredAmount(input.declaredAmount))
    gaps.push(
      `declaredAmount phải là số nguyên VNĐ từ ${MinMeritDeclaredAmount} tới ${MaxMeritDeclaredAmount}`,
    );

  if (
    !MeritDeclarationStatuses.includes(input.status as MeritDeclarationStatus)
  )
    gaps.push(
      `status phải là một trong: ${MeritDeclarationStatuses.join(', ')}`,
    );

  if (
    input.note !== undefined &&
    input.note !== null &&
    (typeof input.note !== 'string' || input.note.length > MaxMeritNoteLength)
  )
    gaps.push(`note không vượt ${MaxMeritNoteLength} ký tự`);

  return gaps;
}

/**
 * Tên hiện trong Sổ vàng.
 *
 * Trả chuỗi cố định khi ẩn danh — KHÔNG trả `null` và để mỗi client tự chọn chữ thay thế,
 * vì hai client sẽ chọn hai chữ khác nhau cho cùng một hàng.
 */
export const AnonymousMeritDonorLabel = 'Người ẩn danh';

export function meritDonorLabel(input: {
  readonly isAnonymous: boolean;
  readonly displayName: string | null;
}): string {
  if (input.isAnonymous) return AnonymousMeritDonorLabel;
  // Tài khoản đã xoá vẫn còn hàng trong Sổ vàng — hiện chuỗi rỗng ở đó là một dòng trống
  // không ai hiểu.
  return input.displayName?.trim() || AnonymousMeritDonorLabel;
}
