import { AesSecretCipher } from './aes-secret-cipher';

const Key = Buffer.alloc(32, 7).toString('base64');

function makeCipher(key: string) {
  return new AesSecretCipher({
    security: { secretEncryptionKey: key },
  } as never);
}

describe('AesSecretCipher', () => {
  it('giải mã lại đúng giá trị đã mã hoá', () => {
    const cipher = makeCipher(Key);

    expect(cipher.decrypt(cipher.encrypt('mat-khau-smtp'))).toBe(
      'mat-khau-smtp',
    );
  });

  it('không để lộ bản rõ trong chuỗi đã mã hoá', () => {
    const cipher = makeCipher(Key);

    expect(cipher.encrypt('mat-khau-smtp')).not.toContain('mat-khau-smtp');
  });

  it('cùng một bản rõ cho ra ciphertext khác nhau mỗi lần', () => {
    // IV ngẫu nhiên mỗi lần: nếu không, người đọc được DB sẽ biết hai kênh đang
    // dùng chung một mật khẩu chỉ bằng cách so hai chuỗi.
    const cipher = makeCipher(Key);

    expect(cipher.encrypt('mat-khau-smtp')).not.toBe(
      cipher.encrypt('mat-khau-smtp'),
    );
  });

  it('từ chối giải mã khi ciphertext bị sửa', () => {
    // GCM có thẻ xác thực. Thiếu nó thì ai sửa được DB là đổi được cấu hình gửi
    // mail mà không ai biết.
    const cipher = makeCipher(Key);
    const encrypted = cipher.encrypt('mat-khau-smtp');
    const parts = encrypted.split(':');
    const payload = Buffer.from(parts[3], 'base64');
    payload[0] ^= 0xff;
    parts[3] = payload.toString('base64');

    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });

  it('không giải mã được bằng khoá khác', () => {
    const encrypted = makeCipher(Key).encrypt('mat-khau-smtp');
    const other = makeCipher(Buffer.alloc(32, 9).toString('base64'));

    expect(() => other.decrypt(encrypted)).toThrow();
  });

  it('báo chưa cấu hình và từ chối mã hoá khi thiếu khoá', () => {
    // Fail closed: thà không lưu được secret còn hơn lưu bản rõ xuống database.
    const cipher = makeCipher('');

    expect(cipher.isConfigured).toBe(false);
    expect(() => cipher.encrypt('mat-khau-smtp')).toThrow();
  });

  it('từ chối khoá không đủ 32 byte', () => {
    const cipher = makeCipher(Buffer.alloc(16, 1).toString('base64'));

    expect(cipher.isConfigured).toBe(false);
  });
});
