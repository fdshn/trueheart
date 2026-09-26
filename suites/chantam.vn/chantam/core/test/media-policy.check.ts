/**
 * Kiểm chính sách tải ảnh trên MinIO THẬT.
 *
 * Ba thứ unit test mock `getSignedUrl` không thấy được:
 *
 * 1. Ký `Content-Length` vào URL có thật sự ép được kích thước không — hay S3
 *    bỏ qua, hoặc từ chối cả lần tải đúng. Spec cũ cố ý KHÔNG ký với ghi chú
 *    "tránh lỗi signed headers", nên phải chứng minh bằng một lượt PUT thật
 *    trước khi đổi.
 * 2. Object sai chính sách có bị DỌN khi xác nhận thất bại không.
 * 3. Object của người KHÁC thì tuyệt đối không được dọn — chỉ cần đoán đúng
 *    một key là xoá được ảnh của người ta.
 *
 *   npm run test:media-policy
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from '@chantam/service.storage-lib';
import { config as loadEnvFile } from 'dotenv';
import { SweepOrphanMediaUseCase } from '../src/application/implementations/media/sweep-orphan-media.use-case';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const UserId = '99999999-9999-4999-8999-9999999e0001';
const OtherUserId = '99999999-9999-4999-8999-9999999e0002';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/** Một PNG nhỏ hợp lệ, độn thêm cho đủ số byte cần. */
function makeImage(bytes: number): Buffer {
  const header = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
    'hex',
  );

  return Buffer.concat([
    header,
    Buffer.alloc(Math.max(0, bytes - header.length)),
  ]);
}

async function put(
  url: string,
  body: Buffer,
  contentType: string,
): Promise<number> {
  const response = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'content-type': contentType },
  });

  return response.status;
}

async function main(): Promise<void> {
  const endpoint = process.env.STORAGE_ENDPOINT;
  if (!endpoint) throw new Error('Thiếu STORAGE_ENDPOINT.');

  const client = new S3Client({
    endpoint,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
    },
  });

  const storage = new StorageService(client, {
    endpoint,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    bucket: process.env.STORAGE_BUCKET ?? 'chantam-media',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
    uploadExpiresInSeconds: 300,
  });

  const exists = async (key: string): Promise<boolean> => {
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_BUCKET ?? 'chantam-media',
          Key: key,
        }),
      );

      return true;
    } catch {
      return false;
    }
  };

  console.log('1. Ký Content-Length có ép được kích thước không');
  const declared = 4096;
  const upload = await storage.createAvatarUpload({
    userId: UserId,
    contentType: 'image/png',
    contentLength: declared,
  });

  const wrongSize = await put(
    upload.uploadUrl,
    makeImage(declared * 4),
    'image/png',
  );
  check(
    'PUT lớn hơn số đã khai bị TỪ CHỐI',
    wrongSize >= 400,
    `HTTP ${wrongSize}`,
  );
  check('và object không hề được tạo', !(await exists(upload.key)));

  const rightSize = await put(
    upload.uploadUrl,
    makeImage(declared),
    'image/png',
  );
  check(
    'PUT đúng số đã khai thì THÀNH CÔNG — chữ ký không tự làm hỏng lần tải đúng',
    rightSize >= 200 && rightSize < 300,
    `HTTP ${rightSize}`,
  );
  check('object có mặt trong bucket', await exists(upload.key));

  console.log('\n2. Xác nhận thành công');
  const publicUrl = await storage.confirmAvatarUpload(UserId, upload.key);
  check(
    'trả về URL công khai đúng key',
    publicUrl.endsWith(upload.key),
    publicUrl,
  );

  console.log('\n3. Object sai chính sách thì bị DỌN khi xác nhận');
  // Dựng thẳng một object sai content type, không qua đường presign.
  const badUpload = await storage.createAvatarUpload({
    userId: UserId,
    contentType: 'image/png',
    contentLength: 512,
  });
  await put(badUpload.uploadUrl, makeImage(512), 'image/png');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET ?? 'chantam-media',
      Key: badUpload.key,
      Body: new Uint8Array(makeImage(512)),
      ContentType: 'application/pdf',
    }),
  );

  let rejected = false;
  try {
    await storage.confirmAvatarUpload(UserId, badUpload.key);
  } catch {
    rejected = true;
  }
  check('xác nhận từ chối object sai content type', rejected);
  check(
    'và object đã bị dọn khỏi bucket',
    !(await exists(badUpload.key)),
    'không dọn thì mỗi lần từ chối là một lần bucket phình thêm',
  );

  console.log('\n4. KHÔNG bao giờ dọn object của người khác');
  const victim = await storage.createAvatarUpload({
    userId: OtherUserId,
    contentType: 'image/png',
    contentLength: 512,
  });
  await put(victim.uploadUrl, makeImage(512), 'image/png');

  let refused = false;
  try {
    // Người khác gửi key của nạn nhân lên đường xác nhận của mình.
    await storage.confirmAvatarUpload(UserId, victim.key);
  } catch {
    refused = true;
  }
  check('từ chối key không thuộc mình', refused);
  check(
    'và ảnh của nạn nhân VẪN CÒN',
    await exists(victim.key),
    'dọn ở nhánh này là biến endpoint xác nhận thành công cụ xoá ảnh người khác',
  );

  await storage.deleteObjects([upload.key, victim.key]);

  console.log('\n5. Job dọn rác: xoá mồ côi, KHÔNG đụng ảnh đang dùng');
  // Hai object cùng tiền tố: một cái được database trỏ tới, một cái không.
  const liveUpload = await storage.createAvatarUpload({
    userId: OtherUserId,
    contentType: 'image/png',
    contentLength: 512,
  });
  await put(liveUpload.uploadUrl, makeImage(512), 'image/png');
  const orphanUpload = await storage.createAvatarUpload({
    userId: OtherUserId,
    contentType: 'image/png',
    contentLength: 512,
  });
  await put(orphanUpload.uploadUrl, makeImage(512), 'image/png');

  const sweeper = new SweepOrphanMediaUseCase(
    {
      query: async (sql: string) =>
        sql.includes('users')
          ? [
              {
                value: `${process.env.STORAGE_PUBLIC_BASE_URL}/${liveUpload.key}`,
              },
            ]
          : [],
    } as never,
    storage,
    {
      storage: { publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL },
    } as never,
  );

  const dry = await sweeper.handle({
    prefix: `users/${OtherUserId}/`,
    minAgeHours: 0,
    dryRun: true,
  });
  check('dry-run đếm đúng một mồ côi', dry.orphans === 1, `${dry.orphans}`);
  check('và chưa xoá gì', await exists(orphanUpload.key));

  const applied = await sweeper.handle({
    prefix: `users/${OtherUserId}/`,
    minAgeHours: 0,
    dryRun: false,
  });
  check('chạy thật thì xoá', applied.deleted === 1, `${applied.deleted}`);
  check('mồ côi đã biến mất', !(await exists(orphanUpload.key)));
  check(
    'ẢNH ĐANG DÙNG vẫn còn — phép kiểm quan trọng nhất của job này',
    await exists(liveUpload.key),
  );

  await storage.deleteObjects([liveUpload.key]);

  console.log(
    `\n${
      failures.length === 0
        ? 'Chính sách media: kích thước bị ép, rác tự dọn, ảnh đang dùng an toàn'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
