import { IConfig } from '@/domain/ports/config';
import { FcmPushSender } from './fcm-push-sender';
import { LoggingPushSender } from './logging-push-sender';
import { createPushSender } from './notification.module';

/**
 * Phép kiểm cho lượt CHỌN bản cài đẩy push.
 *
 * Vì sao cần: `FcmPushSender` có thể đúng hoàn toàn mà vẫn không bao giờ chạy, nếu
 * lượt chọn trong module sai. Đó là kiểu lỗi 1242 unit test khác không thấy — mọi
 * spec dựng use case bằng `new`, không qua DI container — và nó chỉ lộ ra khi
 * production im lặng không đẩy gì cho ai.
 */

function configWith(serviceAccountBase64: string): IConfig {
  return {
    env: 'production',
    push: { serviceAccountBase64 },
  } as unknown as IConfig;
}

const ValidAccount = Buffer.from(
  JSON.stringify({
    project_id: 'p',
    client_email: 'e@x.iam.gserviceaccount.com',
    private_key: 'k',
  }),
  'utf8',
).toString('base64');

describe('createPushSender', () => {
  beforeEach(() => {
    // `FcmPushSender` ghi ERROR khi khoá không parse được; ở đây đó là chuyện
    // mong đợi, không phải lỗi của phép kiểm.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['rỗng', ''],
    ['chỉ có dấu cách', '   '],
  ])('dùng LoggingPushSender khi khoá %s', (_label, value) => {
    expect(createPushSender(configWith(value))).toBeInstanceOf(
      LoggingPushSender,
    );
  });

  it('dùng FcmPushSender khi đã có khoá', () => {
    expect(createPushSender(configWith(ValidAccount))).toBeInstanceOf(
      FcmPushSender,
    );
  });

  it('khoá SAI định dạng vẫn chọn FcmPushSender, không lặng lẽ quay về bản ghi log', async () => {
    // Đây là quyết định, không phải tình cờ: `LoggingPushSender` ở `development`
    // BÁO ĐÃ GỬI, nên quay về nó khi khoá sai làm một khoá sai trông y hệt một
    // khoá đúng. `FcmPushSender` thì tắt ồn ào — ERROR lúc khởi tạo, `canSend()`
    // trả false mãi.
    const sender = createPushSender(configWith('khong-phai-base64-json'));

    expect(sender).toBeInstanceOf(FcmPushSender);
    await expect(sender.canSend()).resolves.toBe(false);
  });
});
