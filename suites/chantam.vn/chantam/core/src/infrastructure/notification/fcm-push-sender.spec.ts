import { IConfig } from '@/domain/ports/config';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { FcmPushSender } from './fcm-push-sender';

/**
 * Phép thử cho đường đẩy FCM thật (F44).
 *
 * ## Vì sao bộ thử này ký và XÁC THỰC một JWT thật
 *
 * Phần dễ sai nhất của file được thử là chữ ký RS256 tự ký bằng `node:crypto`.
 * Một phép kiểm chỉ đòi "assertion có ba đoạn ngăn bằng dấu chấm" sẽ xanh với một
 * chữ ký rác, và lỗi chỉ lộ ra khi Google trả 400 — tức sau khi đã cắm khoá thật
 * lên production.
 *
 * Nên bộ thử sinh một cặp khoá RSA thật, ký bằng khoá riêng, rồi **xác thực lại
 * bằng khoá công khai**. Đó là phép kiểm duy nhất chứng minh được chữ ký dùng
 * được mà không cần gọi tới Google.
 *
 * ## Vì sao mock `fetch` chứ không gọi thật
 *
 * Gọi thật cần một dự án Firebase và khoá của nó — thứ CHƯA CÓ (xem
 * `docs/plan/DEFERRED.md`). Mock cho phép kiểm hết các nhánh phản hồi, kể cả
 * những nhánh khó dựng thật: token đã gỡ app, 400 token rác, đổi access token
 * thất bại.
 *
 * Giới hạn thật, ghi ra để không ai tưởng phần này đã xong: bộ thử KHÔNG chứng
 * minh Google chấp nhận payload. Nó chứng minh hình payload đúng đặc tả HTTP v1
 * và mọi nhánh lỗi được xử đúng. Lượt gọi thật đầu tiên vẫn là một bước phải làm
 * sau khi có khoá.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const ServiceAccount = {
  project_id: 'chantam-test',
  client_email: 'push@chantam-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

function configWith(serviceAccountBase64: string): IConfig {
  return {
    env: 'production',
    push: { serviceAccountBase64 },
  } as unknown as IConfig;
}

function encode(account: unknown): string {
  return Buffer.from(JSON.stringify(account), 'utf8').toString('base64');
}

const Message = {
  title: 'Có người xin nhận quà',
  body: 'Nguyễn Văn A muốn nhận "Áo ấm cho bé"',
  type: NotificationTypes.GIFT_REQUEST_CREATED,
  referenceType: 'TRANSACTION',
  referenceId: 'd3f1c2b4-0000-4000-8000-000000000001',
};

/** Phản hồi `fetch` tối giản, đủ cho những gì file đang đọc. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('FcmPushSender', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cấu hình không dùng được thì TẮT, và tắt ồn ào', () => {
    it.each([
      ['rỗng', ''],
      ['chỉ có dấu cách', '   '],
      [
        'base64 giải ra không phải JSON',
        Buffer.from('không-phải-json').toString('base64'),
      ],
      [
        'JSON nhưng thiếu private_key',
        encode({ project_id: 'a', client_email: 'b' }),
      ],
      [
        'JSON nhưng private_key rỗng',
        encode({ ...ServiceAccount, private_key: '' }),
      ],
      ['JSON nhưng là một mảng', encode([1, 2, 3])],
    ])('canSend() trả false khi service account %s', async (_label, value) => {
      const sender = new FcmPushSender(configWith(value));
      await expect(sender.canSend()).resolves.toBe(false);
    });

    it('send() trả 0 và KHÔNG gọi mạng khi chưa cấu hình', async () => {
      const sender = new FcmPushSender(configWith(''));
      await expect(sender.send(['token-a'], Message)).resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('cấu hình dùng được', () => {
    it('canSend() trả true', async () => {
      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await expect(sender.canSend()).resolves.toBe(true);
    });

    it('ký một JWT mà khoá công khai XÁC THỰC được', async () => {
      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).includes('oauth2')
          ? jsonResponse(200, { access_token: 'at-1', expires_in: 3600 })
          : jsonResponse(200, { name: 'projects/chantam-test/messages/1' }),
      );

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await sender.send(['token-a'], Message);

      const tokenCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('oauth2'),
      );
      expect(tokenCall).toBeDefined();

      const assertion = new URLSearchParams(
        (tokenCall?.[1] as { body: string }).body,
      ).get('assertion');
      expect(assertion).toBeTruthy();

      const [headerPart, payloadPart, signaturePart] = (
        assertion as string
      ).split('.');

      const header = JSON.parse(
        Buffer.from(headerPart, 'base64url').toString('utf8'),
      );
      expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });

      const payload = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf8'),
      );
      expect(payload.iss).toBe(ServiceAccount.client_email);
      expect(payload.aud).toBe('https://oauth2.googleapis.com/token');
      expect(payload.scope).toBe(
        'https://www.googleapis.com/auth/firebase.messaging',
      );
      expect(payload.exp).toBeGreaterThan(payload.iat);

      // Đây là phép kiểm quan trọng nhất của file: chữ ký phải THẬT.
      const verified = createVerify('RSA-SHA256')
        .update(`${headerPart}.${payloadPart}`)
        .verify(publicKey, Buffer.from(signaturePart, 'base64url'));
      expect(verified).toBe(true);
    });

    it('gửi đúng hình payload HTTP v1, và bỏ khoá data không có giá trị', async () => {
      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).includes('oauth2')
          ? jsonResponse(200, { access_token: 'at-1', expires_in: 3600 })
          : jsonResponse(200, {}),
      );

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await sender.send(['token-a'], { ...Message, referenceId: null });

      const sendCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('messages:send'),
      );
      expect(String(sendCall?.[0])).toBe(
        'https://fcm.googleapis.com/v1/projects/chantam-test/messages:send',
      );

      const init = sendCall?.[1] as {
        headers: Record<string, string>;
        body: string;
      };
      expect(init.headers.Authorization).toBe('Bearer at-1');

      const body = JSON.parse(init.body);
      expect(body.message.token).toBe('token-a');
      expect(body.message.notification).toEqual({
        title: Message.title,
        body: Message.body,
      });
      // `data` chỉ nhận chuỗi, và khoá không có giá trị phải BỎ HẲN — gửi chuỗi
      // rỗng làm client phải đoán "không có" hay "rỗng thật".
      expect(body.message.data).toEqual({
        type: Message.type,
        referenceType: 'TRANSACTION',
      });
      expect(body.message.data).not.toHaveProperty('referenceId');
    });

    it('đếm đúng số thiết bị nhận được, và một token chết KHÔNG làm sập lượt gửi', async () => {
      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (String(url).includes('oauth2'))
          return jsonResponse(200, { access_token: 'at-1', expires_in: 3600 });

        const token = JSON.parse((init as { body: string }).body).message.token;
        if (token === 'token-da-go-app') return jsonResponse(404, {});
        if (token === 'token-rac') return jsonResponse(400, {});
        if (token === 'token-loi-server') return jsonResponse(500, {});
        return jsonResponse(200, {});
      });

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      const sent = await sender.send(
        [
          'token-a',
          'token-da-go-app',
          'token-b',
          'token-rac',
          'token-loi-server',
        ],
        Message,
      );

      expect(sent).toBe(2);
    });

    it('gộp token trùng — hai phiên trên cùng máy không thành hai thông báo', async () => {
      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).includes('oauth2')
          ? jsonResponse(200, { access_token: 'at-1', expires_in: 3600 })
          : jsonResponse(200, {}),
      );

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      const sent = await sender.send(['cung-mot-may', 'cung-mot-may'], Message);

      expect(sent).toBe(1);
      const sendCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('messages:send'),
      );
      expect(sendCalls).toHaveLength(1);
    });

    it('dùng lại access token còn hạn thay vì đổi mới mỗi lượt', async () => {
      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).includes('oauth2')
          ? jsonResponse(200, { access_token: 'at-1', expires_in: 3600 })
          : jsonResponse(200, {}),
      );

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await sender.send(['token-a'], Message);
      await sender.send(['token-b'], Message);

      const tokenCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('oauth2'),
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('đổi access token MỚI khi bản cũ đã hết hạn', async () => {
      // `expires_in` nhỏ hơn biên 60 giây nên token hết hạn ngay, không cần chờ.
      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).includes('oauth2')
          ? jsonResponse(200, { access_token: 'at-1', expires_in: 1 })
          : jsonResponse(200, {}),
      );

      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await sender.send(['token-a'], Message);
      await sender.send(['token-b'], Message);

      const tokenCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('oauth2'),
      );
      expect(tokenCalls).toHaveLength(2);
    });

    it.each([
      ['HTTP lỗi', async () => jsonResponse(401, { error: 'invalid_grant' })],
      [
        'thiếu access_token',
        async () => jsonResponse(200, { expires_in: 3600 }),
      ],
      [
        'mạng hỏng',
        async () => {
          throw new Error('getaddrinfo ENOTFOUND');
        },
      ],
    ])(
      'đổi access token thất bại (%s) thì trả 0 và KHÔNG gửi gì',
      async (_label, tokenResponse) => {
        fetchMock.mockImplementation(async (url: unknown) =>
          String(url).includes('oauth2')
            ? (tokenResponse as () => Promise<Response>)()
            : jsonResponse(200, {}),
        );

        const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
        await expect(sender.send(['token-a'], Message)).resolves.toBe(0);

        const sendCalls = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('messages:send'),
        );
        expect(sendCalls).toHaveLength(0);
      },
    );

    it('không gọi mạng khi danh sách token rỗng', async () => {
      const sender = new FcmPushSender(configWith(encode(ServiceAccount)));
      await expect(sender.send([], Message)).resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
