/**
 * Chạy trọn luồng chat trên service THẬT: HTTP + Socket.io + Postgres.
 *
 * Vì sao cần script riêng: unit test mock repository nên không câu SQL nào chạy,
 * và không có test nào dựng nổi DI container cùng gateway. Những thứ chỉ lộ ra ở
 * đây: xác thực lúc bắt tay, phòng Socket.io, và việc tin nhắn có thật sự bay
 * sang máy người còn lại hay không.
 *
 * Cần service đang chạy ở CORE_URL (mặc định http://localhost:3000).
 *
 *   npm run test:chat-e2e
 */
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { io, Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const BaseUrl = process.env.CORE_URL ?? 'http://localhost:3000';
const ApiUrl = `${BaseUrl}/api/v1`;

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now().toString().slice(-8);

async function call<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${ApiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as T,
  };
}

interface AuthResult {
  body?: {
    session?: { accessToken?: string };
    user?: { userId?: string; username?: string };
  };
}

async function register(
  suffix: string,
): Promise<{ token: string; userId: string; username: string }> {
  const username = `chat${stamp}${suffix}`;
  const { status, body } = await call<AuthResult>('/auth/register', {
    method: 'POST',
    body: {
      registration: {
        username,
        password: 'MatKhau#2026',
        confirmPassword: 'MatKhau#2026',
        deviceId: `chat-e2e-${suffix}`,
      },
    },
  });

  const token = body.body?.session?.accessToken;
  const userId = body.body?.user?.userId;
  if (!token || !userId)
    throw new Error(
      `Không đăng ký được ${username}: HTTP ${status} ${JSON.stringify(body).slice(0, 300)}`,
    );

  await completeProfile(token, username, suffix);

  return { token, userId, username };
}

/**
 * Điền cho xong hồ sơ ngay sau khi đăng ký.
 *
 * Gửi tin nhắn đi qua cổng hồ sơ F07 (`ProfileGate.assertComplete` trong
 * `SendChatMessageUseCase`), nên tài khoản vừa đăng ký xong — chưa có họ tên,
 * avatar, SĐT, email — sẽ ăn 403 ở ngay bước gửi đầu tiên, rồi kéo theo tám
 * phép kiểm phía sau cùng đỏ vì không có tin nào để nhận.
 *
 * Avatar phải là một object CÓ THẬT: server `HeadObject` xác nhận key thuộc
 * đúng người gọi trước khi gắn, nên không bịa key được. Đây là lý do bước này
 * đi đủ ba nhịp — xin chữ ký, `PUT` lên storage, rồi mới gắn vào hồ sơ — y hệt
 * `scripts/smoke-test.sh`.
 */
async function completeProfile(
  token: string,
  username: string,
  suffix: string,
): Promise<void> {
  const { status: presignStatus, body: presign } = await call<{
    body?: { uploadUrl?: string; key?: string };
  }>('/profile/me/avatar-upload', {
    method: 'PATCH',
    token,
    body: { contentType: 'image/webp', contentLength: 20 },
  });

  const uploadUrl = presign.body?.uploadUrl;
  const avatarKey = presign.body?.key;
  if (!uploadUrl || !avatarKey)
    throw new Error(
      `Không xin được chữ ký avatar cho ${username}: HTTP ${presignStatus}`,
    );

  // Đúng 20 byte, và đúng content type đã khai: cả hai đều nằm trong chữ ký,
  // nên lệch một byte là storage trả 403.
  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp', 'Content-Length': '20' },
    body: Buffer.from('RIFF....WEBPVP8 ........'.slice(0, 20)),
  });
  if (!upload.ok)
    throw new Error(
      `Không tải được avatar cho ${username}: HTTP ${upload.status}`,
    );

  const { status, body } = await call<{
    body?: { profile?: { profileComplete?: boolean } };
  }>(
    '/profile/me',
    {
      method: 'PATCH',
      token,
      body: {
        profile: {
          fullName: `Chat E2E ${username}`,
          avatarKey,
          // SĐT phải DUY NHẤT trên toàn hệ thống. `stamp` tách được lần chạy
          // này khỏi lần chạy khác, còn `suffix` tách ba tài khoản trong CÙNG
          // một lần — bỏ nó thì a và b ra chung một số và người thứ hai ăn 409.
          phone: `+84${stamp}${suffix.charCodeAt(0) - 96}`,
          email: `${username}@example.com`,
          defaultLocation: { lat: 21.028, lng: 105.835 },
        },
      },
    },
  );

  if (body.body?.profile?.profileComplete !== true)
    throw new Error(
      `Hồ sơ ${username} vẫn chưa đủ sau khi cập nhật: HTTP ${status} ${JSON.stringify(body).slice(0, 300)}`,
    );
}

/** Chờ một sự kiện socket, hoặc trả `null` khi hết thời gian. */
function waitFor<T>(
  socket: Socket,
  event: string,
  timeoutMs = 4000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, timeoutMs);

    function handler(payload: T): void {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

function connect(token: string | null): Promise<{
  socket: Socket;
  connected: boolean;
  rejected: boolean;
}> {
  return new Promise((resolve) => {
    const socket = io(`${BaseUrl}/chat`, {
      transports: ['websocket'],
      ...(token ? { auth: { token } } : {}),
      reconnection: false,
    });

    let settled = false;
    const finish = (connected: boolean, rejected: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({ socket, connected, rejected });
    };

    socket.on('connect', () => {
      // Kết nối được chưa chắc đã qua xác thực: gateway ngắt NGAY sau khi bắt
      // tay nếu token sai, nên phải đợi thêm một nhịp xem có bị đá ra không.
      setTimeout(() => finish(socket.connected, false), 700);
    });
    socket.on('connection:rejected', () => finish(false, true));
    socket.on('disconnect', () => finish(false, true));
    socket.on('connect_error', () => finish(false, true));
    setTimeout(() => finish(socket.connected, false), 5000);
  });
}

async function main(): Promise<void> {
  console.log(`Chat end-to-end trên ${BaseUrl}\n`);

  // ── 1. Xác thực lúc bắt tay ─────────────────────────────────────────────
  console.log('Xác thực khi bắt tay:\n');

  const noToken = await connect(null);
  check(
    'không có token thì bị từ chối',
    !noToken.connected,
    noToken.connected ? 'vẫn kết nối được' : '',
  );
  noToken.socket.close();

  const badToken = await connect('khong-phai-jwt-that');
  check(
    'token rác thì bị từ chối',
    !badToken.connected,
    badToken.connected ? 'vẫn kết nối được' : '',
  );
  badToken.socket.close();

  const giver = await register('a');
  const receiver = await register('b');

  const good = await connect(giver.token);
  check('token hợp lệ thì kết nối được', good.connected);

  // ── 2. Vào phòng ─────────────────────────────────────────────────────────
  console.log('\nVào phòng:\n');

  const joinFake = await good.socket
    .timeout(4000)
    .emitWithAck('room:join', {
      roomId: '11111111-1111-4111-8111-111111111111',
    })
    .catch(() => ({ joined: 'timeout' }));
  check(
    'phòng không tồn tại thì không vào được',
    (joinFake as { joined: unknown }).joined === false,
    JSON.stringify(joinFake),
  );

  const joinGarbage = await good.socket
    .timeout(4000)
    .emitWithAck('room:join', { roomId: 42 })
    .catch(() => ({ joined: 'timeout' }));
  check(
    'roomId sai kiểu thì không vào được, không làm sập kết nối',
    (joinGarbage as { joined: unknown }).joined === false &&
      good.socket.connected,
    JSON.stringify(joinGarbage),
  );

  // ── 3. Chat của chính mình thì rỗng ─────────────────────────────────────
  console.log('\nDanh sách hội thoại:\n');

  const rooms = await call<{ body?: { rooms?: unknown[] } }>('/chat/rooms', {
    token: giver.token,
  });
  check(
    'người chưa có giao dịch nào thì danh sách hội thoại rỗng',
    rooms.status === 200 && (rooms.body.body?.rooms?.length ?? -1) === 0,
    `HTTP ${rooms.status}`,
  );

  const otherRoom = await call<unknown>(
    '/chat/rooms/11111111-1111-4111-8111-111111111111/messages',
    { token: receiver.token },
  );
  check(
    'đọc phòng không phải của mình trả 404, không phải 403',
    otherRoom.status === 404,
    `HTTP ${otherRoom.status}`,
  );

  good.socket.close();

  // ── 4. Hộp thư thông báo ────────────────────────────────────────────────
  console.log('\nHộp thư thông báo:\n');

  const inbox = await call<{
    body?: { unreadCount?: number; notifications?: unknown[] };
  }>('/notifications/me', { token: receiver.token });
  check(
    'hộp thư mới thì rỗng và badge bằng 0',
    inbox.status === 200 &&
      inbox.body.body?.unreadCount === 0 &&
      (inbox.body.body?.notifications?.length ?? -1) === 0,
    `HTTP ${inbox.status} unread=${inbox.body.body?.unreadCount}`,
  );

  const marked = await call<{ body?: { markedCount?: number } }>(
    '/notifications/me/read',
    { method: 'PATCH', token: receiver.token, body: { notifications: {} } },
  );
  check(
    'đánh dấu đã đọc khi chưa có gì vẫn thành công, đánh dấu 0 cái',
    marked.status === 200 && marked.body.body?.markedCount === 0,
    `HTTP ${marked.status} marked=${marked.body.body?.markedCount}`,
  );

  // ── 5. Giao nhận tin nhắn THẬT qua socket ───────────────────────────────
  console.log('\nGiao nhận tin nhắn:\n');

  // Dựng trạng thái bằng SQL thay vì lái cả luồng sản phẩm qua HTTP: hoàn thiện
  // hồ sơ, thăng hạng, đăng bài, duyệt bài, xin nhận, duyệt yêu cầu là sáu bước
  // KHÔNG liên quan tới điều đang cần kiểm — chỉ làm phép kiểm này vỡ mỗi lần
  // một trong sáu bước đó đổi.
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URI,
  });
  await dataSource.initialize();

  const postId = randomUUID();
  const transactionId = randomUUID();
  const roomId = randomUUID();

  try {
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, '30000000-0000-4000-8000-000000000001',
               'Bài kiểm chat end-to-end', 'Mô tả đủ dài cho bài kiểm tra chat',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [postId, giver.userId],
    );
    await dataSource.query(
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
       VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
      [transactionId, postId, giver.userId, receiver.userId],
    );
    await dataSource.query(
      `INSERT INTO chat_rooms
         (global_id, transaction_id, post_id, giver_id, receiver_id, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
      [roomId, transactionId, postId, giver.userId, receiver.userId],
    );

    const giverSocket = await connect(giver.token);
    const receiverSocket = await connect(receiver.token);
    check(
      'cả hai bên kết nối được',
      giverSocket.connected && receiverSocket.connected,
    );

    const joined = await receiverSocket.socket
      .timeout(4000)
      .emitWithAck('room:join', { roomId })
      .catch(() => ({ joined: 'timeout' }));
    check(
      'người trong phòng vào được',
      (joined as { joined: unknown }).joined === true,
      JSON.stringify(joined),
    );

    // Người ngoài KHÔNG vào được phòng này.
    const outsider = await register('c');
    const outsiderSocket = await connect(outsider.token);
    const outsiderJoin = await outsiderSocket.socket
      .timeout(4000)
      .emitWithAck('room:join', { roomId })
      .catch(() => ({ joined: 'timeout' }));
    check(
      'người ngoài phòng KHÔNG vào được',
      (outsiderJoin as { joined: unknown }).joined === false,
      JSON.stringify(outsiderJoin),
    );

    // Bắt sự kiện TRƯỚC khi gửi, nếu không tin bay tới trước lúc lắng nghe.
    const incoming = waitFor<{ body?: string; senderId?: string }>(
      receiverSocket.socket,
      'message:new',
    );
    const outsiderIncoming = waitFor<unknown>(
      outsiderSocket.socket,
      'message:new',
      2500,
    );

    const sent = await call<{ body?: { message?: { messageId?: string } } }>(
      `/chat/rooms/${roomId}/messages`,
      {
        method: 'POST',
        token: giver.token,
        body: { message: { body: 'Chào bạn, mình hẹn 5 giờ chiều nhé' } },
      },
    );
    check(
      'gửi tin qua REST thành công',
      sent.status === 201,
      `HTTP ${sent.status} ${JSON.stringify(sent.body).slice(0, 160)}`,
    );

    const received = await incoming;
    check(
      'người nhận nhận được tin qua socket',
      received?.body === 'Chào bạn, mình hẹn 5 giờ chiều nhé',
      received ? JSON.stringify(received).slice(0, 160) : 'không nhận được gì',
    );
    check(
      'payload socket KHÔNG mang isMine (phụ thuộc người nhận)',
      received !== null && !('isMine' in received),
      received ? Object.keys(received).join(',') : '-',
    );
    check(
      'người ngoài phòng KHÔNG nhận được tin',
      (await outsiderIncoming) === null,
    );

    // Thông báo trong app cho người nhận.
    const inboxAfter = await call<{
      body?: { unreadCount?: number; notifications?: { type?: string }[] };
    }>('/notifications/me', { token: receiver.token });
    check(
      'người nhận có thông báo NEW_CHAT_MESSAGE',
      inboxAfter.body.body?.unreadCount === 1 &&
        inboxAfter.body.body?.notifications?.[0]?.type === 'NEW_CHAT_MESSAGE',
      `unread=${inboxAfter.body.body?.unreadCount} type=${inboxAfter.body.body?.notifications?.[0]?.type}`,
    );

    // Người gửi KHÔNG tự nhận thông báo của mình.
    const giverInbox = await call<{ body?: { unreadCount?: number } }>(
      '/notifications/me',
      { token: giver.token },
    );
    check(
      'người gửi không tự nhận thông báo',
      giverInbox.body.body?.unreadCount === 0,
      `unread=${giverInbox.body.body?.unreadCount}`,
    );

    // Số chưa đọc trong phòng, và đánh dấu đã đọc.
    const roomsAfter = await call<{
      body?: { rooms?: { roomId?: string; unreadCount?: number }[] };
    }>('/chat/rooms', { token: receiver.token });
    const thisRoom = roomsAfter.body.body?.rooms?.find(
      (row) => row.roomId === roomId,
    );
    check(
      'phòng hiện trong danh sách với 1 tin chưa đọc',
      thisRoom?.unreadCount === 1,
      `unread=${thisRoom?.unreadCount}`,
    );

    const readResult = await call<{ body?: { unreadCount?: number } }>(
      `/chat/rooms/${roomId}/read`,
      { method: 'PATCH', token: receiver.token },
    );
    check(
      'đánh dấu đã đọc thì số chưa đọc về 0',
      readResult.status === 200 && readResult.body.body?.unreadCount === 0,
      `HTTP ${readResult.status} unread=${readResult.body.body?.unreadCount}`,
    );

    // ── 6. Body rỗng với content-type JSON ────────────────────────────────
    // Fastify mặc định trả 400 "Body cannot be empty" cho mọi endpoint không có
    // body khi client đặt content-type JSON — thứ client mobile hay đặt sẵn cho
    // mọi request. Hai phép kiểm dưới đây canh cả hai chiều của bản sửa.
    const jsonStillWorks = await call<{ body?: { message?: unknown } }>(
      `/chat/rooms/${roomId}/messages`,
      {
        method: 'POST',
        token: receiver.token,
        body: { message: { body: 'Vâng, hẹn gặp bạn' } },
      },
    );
    check(
      'body JSON bình thường vẫn phân tích đúng',
      jsonStillWorks.status === 201,
      `HTTP ${jsonStillWorks.status}`,
    );

    const brokenJson = await fetch(`${ApiUrl}/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${receiver.token}`,
      },
      body: '{khong-phai-json',
    });
    check(
      'JSON hỏng vẫn bị từ chối, không bị coi là rỗng',
      brokenJson.status === 400,
      `HTTP ${brokenJson.status}`,
    );

    // ── 7. Khoá chỉ đọc (F38) ─────────────────────────────────────────────
    console.log('\nKhoá chỉ đọc khi giao dịch xong:\n');

    await dataSource.query(
      `UPDATE chat_rooms SET status = 'READ_ONLY', locked_at = now() WHERE global_id = $1`,
      [roomId],
    );

    const afterLock = await call<{ errorCode?: number }>(
      `/chat/rooms/${roomId}/messages`,
      {
        method: 'POST',
        token: giver.token,
        body: { message: { body: 'Còn gửi được không?' } },
      },
    );
    check(
      'phòng chỉ đọc thì không gửi được nữa',
      afterLock.status === 409,
      `HTTP ${afterLock.status}`,
    );

    const historyAfterLock = await call<{
      body?: { messages?: unknown[] };
    }>(`/chat/rooms/${roomId}/messages`, { token: giver.token });
    check(
      'phòng chỉ đọc VẪN đọc lại được lịch sử',
      historyAfterLock.status === 200 &&
        (historyAfterLock.body.body?.messages?.length ?? 0) === 2,
      `HTTP ${historyAfterLock.status} messages=${historyAfterLock.body.body?.messages?.length}`,
    );

    giverSocket.socket.close();
    receiverSocket.socket.close();
    outsiderSocket.socket.close();
  } finally {
    // CỐ Ý KHÔNG dọn phòng và tin nhắn.
    //
    // `chat_messages` chỉ ghi thêm, trigger chặn DELETE, và không khoá ngoại nào
    // cascade — nên một phòng đã có tin nhắn thì không xoá được, kể cả từ script
    // test. Đó chính là bất biến đang muốn có: lịch sử chat là bằng chứng.
    //
    // Script để lại vài hàng trong database dev, gắn với username `chat<mốc>*`.
    // Đổi lấy việc không phải mở một cửa hậu để xoá — cửa hậu đó rồi sẽ có người
    // dùng ngoài test.
    await dataSource.destroy();
  }

  console.log(
    failures.length === 0
      ? '\nLuồng chat end-to-end chạy đúng.'
      : `\n${failures.length} kiểm chứng THẤT BẠI:\n- ${failures.join('\n- ')}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
