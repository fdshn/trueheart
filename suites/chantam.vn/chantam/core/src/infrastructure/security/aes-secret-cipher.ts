import { IConfig } from '@/domain/ports/config';
import { ISecretCipher } from '@/domain/ports/security';
import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const Algorithm = 'aes-256-gcm';
const KeyBytes = 32;
const IvBytes = 12;
const Version = 'v1';

/**
 * AES-256-GCM chứ không phải CBC: GCM kèm thẻ xác thực, nên ciphertext bị sửa
 * sẽ ném lúc giải mã thay vì trả ra rác. Ai chỉnh được database cũng không đổi
 * lén được host SMTP để cướp mail đi.
 */
@Injectable()
export class AesSecretCipher implements ISecretCipher {
  private readonly key: Buffer | null;

  public constructor(@Inject(IConfig) config: IConfig) {
    this.key = AesSecretCipher.readKey(config.security.secretEncryptionKey);
  }

  private static readKey(raw: string): Buffer | null {
    if (!raw) return null;

    const key = Buffer.from(raw, 'base64');
    return key.length === KeyBytes ? key : null;
  }

  public get isConfigured(): boolean {
    return this.key !== null;
  }

  public encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IvBytes);
    const cipher = createCipheriv(Algorithm, key, iv);
    const payload = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      Version,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      payload.toString('base64'),
    ].join(':');
  }

  public decrypt(ciphertext: string): string {
    const key = this.requireKey();
    const [version, iv, authTag, payload] = ciphertext.split(':');

    if (version !== Version || !iv || !authTag || !payload)
      throw new Error('Secret đã lưu không đúng định dạng mã hoá.');

    const decipher = createDecipheriv(
      Algorithm,
      key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** So sánh hằng thời gian, dùng khi cần đối chiếu hai secret đã giải mã. */
  public static equals(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private requireKey(): Buffer {
    if (!this.key)
      throw new Error(
        'CONFIG_ENCRYPTION_KEY chưa được khai hoặc không phải 32 byte base64. ' +
          'Không lưu secret xuống database khi chưa mã hoá được.',
      );

    return this.key;
  }
}
