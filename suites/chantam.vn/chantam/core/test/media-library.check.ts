/**
 * Thư viện ảnh CMS trên Postgres VÀ MinIO THẬT (CMS A2).
 *
 * Bốn thứ unit test mock không thấy được:
 *
 * 1. Cả luồng ba bước chạy thật: xin URL → PUT → xác nhận bằng HeadObject → ghi bảng.
 * 2. `media_assets` thật sự là một nguồn key sống: job dọn rác chạy với database THẬT
 *    không xoá ảnh đã vào thư viện, nhưng vẫn xoá ảnh tải lên mà không xác nhận.
 * 3. Xác nhận cùng key hai lần không sinh hai dòng (`UQ_media_assets_storage_key`).
 * 4. Key của Admin khác không xác nhận được, và object của họ KHÔNG bị dọn hộ.
 *
 *   npm run test:media-library
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { StorageService } from '@chantam/service.storage-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { ConfirmCmsMediaUseCase } from '../src/application/implementations/media/cms-media.use-cases';
import { SweepOrphanMediaUseCase } from '../src/application/implementations/media/sweep-orphan-media.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { MediaAssetRepository } from '../src/infrastructure/repository/media-asset.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_media_library_check';
const AdminId = '99999999-9999-4999-8999-9999999f0001';
const OtherAdminId = '99999999-9999-4999-8999-9999999f0002';

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

async function put(url: string, body: Buffer, contentType: string) {
  const response = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'content-type': contentType },
  });
  return response.status;
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  const endpoint = process.env.STORAGE_ENDPOINT;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');
  if (!endpoint) throw new Error('Thiếu STORAGE_ENDPOINT.');

  const bucket = process.env.STORAGE_BUCKET ?? 'chantam-media';
  const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL ?? '';
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
    bucket,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
    publicBaseUrl,
    uploadExpiresInSeconds: 300,
  });
  const exists = async (key: string): Promise<boolean> =>
    client
      .send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      .then(() => true)
      .catch(() => false);

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);
  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    for (const [id, username] of [
      [AdminId, 'bientap_anh'],
      [OtherAdminId, 'bientap_khac'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    const assets = new MediaAssetRepository(dataSource.manager);
    const confirm = new ConfirmCmsMediaUseCase(
      { hasPermission: async () => true } as never,
      storage,
      assets,
    );

    console.log('1. Luồng ba bước chạy thật');
    const upload = await storage.createCmsMediaUpload({
      userId: AdminId,
      contentType: 'image/png',
      contentLength: 2048,
    });
    check(
      'PUT đúng kích thước đã ký thì nhận',
      (await put(upload.uploadUrl, makeImage(2048), 'image/png')) === 200,
    );
    const { asset } = await confirm.handle({
      actorUserId: AdminId,
      key: upload.key,
      fileName: 'bia-vu-lan.png',
    });
    check(
      'xác nhận ghi vào thư viện kèm URL, loại và người tải',
      asset.storageKey === upload.key &&
        asset.publicUrl === upload.publicUrl &&
        asset.contentType === 'image/png' &&
        asset.uploadedByUsername === 'bientap_anh',
      JSON.stringify(asset),
    );

    const again = await confirm.handle({
      actorUserId: AdminId,
      key: upload.key,
      fileName: 'ten-khac.png',
    });
    const [{ total }] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM media_assets`,
    );
    check(
      'xác nhận lần hai trả đúng dòng cũ, không sinh dòng mới, không đổi tên',
      again.asset.globalId === asset.globalId &&
        again.asset.fileName === 'bia-vu-lan.png' &&
        total === '1',
      `rows=${total}`,
    );

    console.log('\n2. Key của Admin khác không xác nhận được');
    const foreign = await storage.createCmsMediaUpload({
      userId: OtherAdminId,
      contentType: 'image/png',
      contentLength: 512,
    });
    await put(foreign.uploadUrl, makeImage(512), 'image/png');
    const rejected = await confirm
      .handle({ actorUserId: AdminId, key: foreign.key })
      .then(() => false)
      .catch(
        (error: Error) =>
          error.constructor.name === 'ValidationFailedException',
      );
    check('ValidationFailedException, không 500', rejected);
    check('và object của người kia KHÔNG bị dọn hộ', await exists(foreign.key));

    console.log('\n3. Liệt kê');
    const page = await assets.list({ keyword: 'VU-LAN', skip: 0, take: 10 });
    check(
      'keyword khớp tên tệp, không phân biệt hoa thường',
      page.total === 1 && page.items[0]?.globalId === asset.globalId,
    );
    check(
      'keyword khớp username người tải',
      (await assets.list({ keyword: 'bientap', skip: 0, take: 10 })).total ===
        1,
    );

    console.log('\n4. Job dọn rác với database THẬT');
    const sweeper = new SweepOrphanMediaUseCase(dataSource.manager, storage, {
      storage: { publicBaseUrl },
    } as never);
    const swept = await sweeper.handle({
      prefix: `users/${AdminId}/cms-media/`,
      minAgeHours: 0,
      dryRun: false,
    });
    check(
      'ảnh đã vào thư viện KHÔNG bị xoá',
      (await exists(upload.key)) && swept.orphans === 0,
      `orphans=${swept.orphans}`,
    );
    const sweptOther = await sweeper.handle({
      prefix: `users/${OtherAdminId}/cms-media/`,
      minAgeHours: 0,
      dryRun: false,
    });
    check(
      'ảnh tải lên mà không xác nhận thì vẫn là mồ côi và bị dọn',
      sweptOther.deleted === 1 && !(await exists(foreign.key)),
      `deleted=${sweptOther.deleted}`,
    );

    await storage.deleteObjects([upload.key]);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'CMS A2: tải–xác nhận–ghi thư viện chạy thật trên MinIO, xác nhận lại không trùng, key người khác bị từ chối mà không bị dọn hộ, và job dọn rác tha ảnh thư viện nhưng vẫn dọn ảnh bỏ ngang'
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
