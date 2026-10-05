import { IConfig } from '@/domain/ports/config';
import { IPushMessage, IPushSender } from '@/domain/ports/notification';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';

/** Thông tin tối thiểu lấy từ service account JSON của Firebase. */
interface IServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const TokenEndpoint = 'https://oauth2.googleapis.com/token';
const MessagingScope = 'https://www.googleapis.com/auth/firebase.messaging';

/** Đổi access token sớm hơn hạn một phút, để không gửi bằng token vừa hết. */
const TokenRefreshMarginSeconds = 60;

/** Gửi tối đa bấy nhiêu thiết bị cùng lúc. Xem docblock mục "Vì sao gửi từng cái". */
const MaxConcurrentSends = 8;

const RequestTimeoutMs = 10_000;

/**
 * Đẩy thông báo qua Firebase Cloud Messaging HTTP v1 (F44).
 *
 * ## Vì sao KHÔNG dùng `firebase-admin`
 *
 * Nó kéo theo `google-auth-library`, `gRPC` và vài chục megabyte phụ thuộc cho
 * đúng hai lượt gọi HTTP. Node 22 đã có `fetch` sẵn và `node:crypto` ký được
 * RS256, nên toàn bộ việc này gói trong một file không thêm phụ thuộc nào. Repo
 * này vốn chọn ít phụ thuộc — cùng lý do `minio-init` dùng lại ảnh minio thay vì
 * kéo thêm ảnh `mc`.
 *
 * Đánh đổi: phải tự ký JWT và tự đổi access token. Cả hai nằm ngay dưới đây và
 * có phép thử riêng.
 *
 * ## Vì sao gửi TỪNG thiết bị chứ không một lượt
 *
 * HTTP v1 bỏ hẳn `registration_ids` của API cũ: mỗi lượt gọi mang đúng một
 * token. `firebase-admin` có `sendEach` nhưng bên trong nó cũng lặp. Nên lặp ở
 * đây không tệ hơn, chỉ là thấy rõ hơn.
 *
 * Giới hạn song song để một người có mười lăm thiết bị không mở mười lăm kết nối
 * cùng lúc cho một thông báo.
 *
 * ## Vì sao một token chết KHÔNG được ném lỗi
 *
 * Người dùng gỡ app là chuyện thường, và token đó nằm lại trong `user_sessions`
 * cho tới khi phiên hết hạn. Để nó làm sập cả lượt gửi thì những thiết bị còn
 * lại cũng mất thông báo — hợp đồng `IPushSender` nói rõ điều đó.
 *
 * ## Vì sao `canSend()` chỉ hỏi về CẤU HÌNH, không thử mạng
 *
 * `canSend()` được gọi trước mỗi lượt đẩy. Nếu nó đi một lượt HTTP thì mỗi thông
 * báo tốn hai lượt gọi ra ngoài, và một nhịp mạng chập làm nghiệp vụ tưởng chưa
 * cấu hình. Câu hỏi nó trả lời là "có khoá dùng được không", còn mạng hỏng thì
 * `send()` trả về số nhỏ hơn và ghi log — đó là chỗ đúng để biết.
 *
 * ## Khoá sai định dạng thì fail-closed ỒN ÀO
 *
 * Service account giải mã không ra JSON, hay thiếu một trong ba trường, thì ghi
 * một dòng log mức ERROR lúc khởi tạo và `canSend()` trả `false` mãi. KHÔNG ném
 * lúc boot: mất đường đẩy không được làm service không khởi động nổi, vì thông
 * báo trong app và toàn bộ phần còn lại vẫn phải chạy.
 *
 * Nhưng cũng KHÔNG im lặng quay về `LoggingPushSender`: ở `development` bản đó
 * báo đã gửi, nên một khoá sai sẽ trông y như một khoá đúng.
 */
@Injectable()
export class FcmPushSender implements IPushSender {
  private readonly logger = new Logger(FcmPushSender.name);
  private readonly account: IServiceAccount | null;
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  public constructor(@Inject(IConfig) private readonly config: IConfig) {
    this.account = this.parseServiceAccount(
      this.config.push.serviceAccountBase64,
    );
  }

  public async canSend(): Promise<boolean> {
    return Promise.resolve(this.account !== null);
  }

  public async send(tokens: string[], message: IPushMessage): Promise<number> {
    if (this.account === null || tokens.length === 0) return 0;

    const accessToken = await this.accessToken();
    if (accessToken === null) return 0;

    // Trùng token xảy ra thật: hai phiên còn sống trên cùng một máy mang cùng
    // `fcm_token`. Gửi hai lần là người dùng thấy hai thông báo giống nhau.
    const unique = [...new Set(tokens)];

    let sent = 0;
    for (let index = 0; index < unique.length; index += MaxConcurrentSends) {
      const batch = unique.slice(index, index + MaxConcurrentSends);
      const results = await Promise.all(
        batch.map((token) => this.sendOne(accessToken, token, message)),
      );
      sent += results.filter(Boolean).length;
    }

    return sent;
  }

  private parseServiceAccount(encoded: string): IServiceAccount | null {
    if (encoded.trim() === '') return null;

    try {
      const raw: unknown = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8'),
      );
      if (typeof raw !== 'object' || raw === null)
        throw new Error('không phải một object JSON');

      const record = raw as Record<string, unknown>;
      const projectId = record.project_id;
      const clientEmail = record.client_email;
      const privateKey = record.private_key;

      if (
        typeof projectId !== 'string' ||
        typeof clientEmail !== 'string' ||
        typeof privateKey !== 'string' ||
        projectId === '' ||
        clientEmail === '' ||
        privateKey === ''
      )
        throw new Error('thiếu project_id, client_email hoặc private_key');

      return { projectId, clientEmail, privateKey };
    } catch (error) {
      // KHÔNG log nội dung đã giải mã: nó chứa khoá riêng. Chỉ log lý do.
      this.logger.error(
        'FCM_SERVICE_ACCOUNT_BASE64 không dùng được, đường đẩy TẮT: ' +
          (error instanceof Error ? error.message : 'lỗi không rõ'),
      );
      return null;
    }
  }

  /** Access token còn hạn, lấy từ cache hoặc đổi mới. `null` nghĩa là đổi thất bại. */
  private async accessToken(): Promise<string | null> {
    const now = Date.now();
    if (this.cachedToken !== null && this.cachedToken.expiresAtMs > now)
      return this.cachedToken.value;

    const account = this.account;
    if (account === null) return null;

    try {
      const response = await fetch(TokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: this.signAssertion(account),
        }).toString(),
        signal: AbortSignal.timeout(RequestTimeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(
          `Đổi access token FCM thất bại: HTTP ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (typeof body.access_token !== 'string' || body.access_token === '') {
        this.logger.warn('Đổi access token FCM thất bại: thiếu access_token');
        return null;
      }

      const lifetimeSeconds =
        typeof body.expires_in === 'number' ? body.expires_in : 3_600;
      this.cachedToken = {
        value: body.access_token,
        expiresAtMs:
          now +
          Math.max(0, lifetimeSeconds - TokenRefreshMarginSeconds) * 1_000,
      };
      return this.cachedToken.value;
    } catch (error) {
      this.logger.warn(
        'Đổi access token FCM thất bại: ' +
          (error instanceof Error ? error.message : 'lỗi không rõ'),
      );
      return null;
    }
  }

  /** JWT RS256 để đổi lấy access token, theo luồng `jwt-bearer` của Google. */
  private signAssertion(account: IServiceAccount): string {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: account.clientEmail,
      scope: MessagingScope,
      aud: TokenEndpoint,
      iat: issuedAt,
      exp: issuedAt + 3_600,
    };

    const signingInput =
      base64Url(Buffer.from(JSON.stringify(header), 'utf8')) +
      '.' +
      base64Url(Buffer.from(JSON.stringify(payload), 'utf8'));

    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(account.privateKey);

    return signingInput + '.' + base64Url(signature);
  }

  /** `true` nếu thiết bị này nhận được. Không bao giờ ném. */
  private async sendOne(
    accessToken: string,
    token: string,
    message: IPushMessage,
  ): Promise<boolean> {
    const account = this.account;
    if (account === null) return false;

    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: buildFcmMessage(token, message) }),
          signal: AbortSignal.timeout(RequestTimeoutMs),
        },
      );

      if (response.ok) return true;

      // 404 UNREGISTERED và 400 INVALID_ARGUMENT là token chết hoặc rác: chuyện
      // bình thường, không phải sự cố. Ghi ở mức debug để không làm nhiễu log
      // vận hành, và KHÔNG log token vì nó là định danh thiết bị.
      if (response.status === 404 || response.status === 400)
        this.logger.debug(
          `Một token không nhận được (HTTP ${response.status}) — thiết bị đã gỡ app hoặc token rác`,
        );
      else
        this.logger.warn(
          `Đẩy thông báo thất bại: HTTP ${response.status} (${message.type})`,
        );

      return false;
    } catch (error) {
      this.logger.warn(
        `Đẩy thông báo thất bại (${message.type}): ` +
          (error instanceof Error ? error.message : 'lỗi không rõ'),
      );
      return false;
    }
  }
}

/** base64url theo RFC 7515: không `=`, `+`→`-`, `/`→`_`. */
function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

/**
 * Dựng phần `message` của FCM HTTP v1.
 *
 * `data` chỉ nhận GIÁ TRỊ CHUỖI — FCM trả 400 cho `null` hay số. Nên khoá nào
 * không có giá trị thì BỎ HẲN thay vì gửi chuỗi rỗng: client đọc `data.referenceId`
 * ra `''` sẽ phải tự đoán đó là "không có" hay "rỗng thật".
 */
function buildFcmMessage(
  token: string,
  message: IPushMessage,
): Record<string, unknown> {
  const data: Record<string, string> = { type: message.type };
  if (message.referenceType !== null)
    data.referenceType = message.referenceType;
  if (message.referenceId !== null) data.referenceId = message.referenceId;

  return {
    token,
    notification: { title: message.title, body: message.body },
    data,
  };
}
