import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../entity';
import * as migrations from './migrations';

// CHỈ dùng cho TypeORM CLI (sinh và chạy migration). Ứng dụng lúc chạy dùng
// PersistenceModule, không đụng tới file này.
//
// .env.local nạp trước .env vì dotenv không ghi đè biến đã có — nạp trước nghĩa
// là được ưu tiên.
loadEnvFile({ path: '.env.local' });
loadEnvFile();

const databaseUri = process.env.DATABASE_URI;

if (!databaseUri)
  throw new Error(
    'Thiếu DATABASE_URI. Chép .env.example thành .env.local rồi điền giá trị.',
  );

export default new DataSource({
  type: 'postgres',
  url: databaseUri,
  // Dùng lại đúng hàm mà PersistenceModule dùng, để CLI và ứng dụng lúc chạy
  // không bao giờ thấy hai danh sách khác nhau.
  entities: resolveAllEntities(entities),
  migrations: resolveAllEntities(migrations),
  migrationsTableName: 'migrations',
});
