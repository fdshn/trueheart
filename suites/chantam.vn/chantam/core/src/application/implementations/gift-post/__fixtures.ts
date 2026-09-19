import { IConfig } from '@/domain/ports/config';
import { IGiftPostRepository } from '@/domain/ports/repository';
import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';

/** Toạ độ chợ Bến Thành — mốc cố định cho mọi test liên quan tới vị trí. */
export const BenThanhMarket = { lat: 10.7724, lng: 106.698 };

export function makeGiftPost(
  overrides: Partial<IGiftPostEntity> = {},
): IGiftPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    category: GiftPostCategories.VEHICLE,
    condition: GiftPostConditions.USED,
    estimatedValue: 1_500_000,
    location: { ...BenThanhMarket },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: '22222222-2222-2222-2222-222222222222',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

export function makeRepositoryMock(): jest.Mocked<IGiftPostRepository> {
  return {
    insert: jest.fn(),
    update: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    findNearby: jest.fn(),
  } as unknown as jest.Mocked<IGiftPostRepository>;
}

export function makeConfigMock(jitterRadiusMeters = 300): IConfig {
  return {
    port: 3000,
    env: 'development',
    version: 'test',
    database: { default: 'postgres://localhost/test' },
    redis: { uri: 'redis://localhost:6379' },
    auth: {
      jwtSecret: 'khong-dung-toi-trong-bai-kiem-tra-nay-0123456789',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 2_592_000,
      bcryptRounds: 4,
      maxLoginAttempts: 5,
      loginLockSeconds: 900,
      otpTtlSeconds: 300,
    },
    docsServers: [],
    otpEmail: { fromAddress: '', fromName: 'Chân Tâm' },
    categoryAdmin: { usernames: [] },
    postOperator: { usernames: [] },
    rankOperator: { usernames: [] },
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl: '' },
    storage: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'chantam-test',
      accessKeyId: 'test',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'http://localhost:9000/chantam-test',
    },
    geo: { jitterRadiusMeters },
  };
}
