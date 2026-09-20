/**
 * Cổng mã hoá secret mà Admin cấu hình được (mật khẩu SMTP, API key Zalo...).
 *
 * Bản rõ KHÔNG bao giờ nằm trong database và KHÔNG bao giờ đi ra API. Khoá nằm
 * ở biến môi trường / secret manager, database chỉ giữ ciphertext — đọc được
 * dump database vẫn chưa lấy được mật khẩu.
 */
export interface ISecretCipher {
  /** Chưa có khoá hợp lệ thì không lưu được secret nào. */
  readonly isConfigured: boolean;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export const ISecretCipher = Symbol('ISecretCipher');
