import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { GetPostMapUseCase } from './get-post-map.use-case';

const ExactLocation = { lat: 10.7724, lng: 106.698 };

function makeConfig(): IConfig {
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
      globalRateLimitPerMinute: 600,
      trustProxy: false,
      maxLoginAttemptsPerIp: 30,
      maxRegistrationsPerIp: 5,
      registrationWindowSeconds: 3600,
    },
    docsServers: [],
    otpEmail: { fromAddress: '', fromName: 'Chân Tâm' },
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl: '' },
    security: { secretEncryptionKey: '', phoneHashPepper: '' },
    push: { serviceAccountBase64: '' },
    storage: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'chantam-test',
      accessKeyId: 'test',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'http://localhost:9000/chantam-test',
    },
    geo: { jitterRadiusMeters: 300 },
  };
}

describe('GetPostMapUseCase', () => {
  it('trả marker tối thiểu với toạ độ jitter và distance được bucket', async () => {
    const postRepository = {
      findMapClusters: jest.fn().mockResolvedValue({
        clusters: [
          {
            cellLng: 106.6,
            cellLat: 10.7,
            count: 1,
            marker: {
              globalId: '11111111-1111-1111-1111-111111111111',
              postType: PostTypes.OFFER,
              categoryId: '30000000-0000-4000-8000-000000000001',
              areaLabel: 'Quận 1, TP.HCM',
              location: ExactLocation,
              distanceMeters: 463,
            },
          },
        ],
        total: 1,
        cellCount: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetPostMapUseCase(
      postRepository,
      makeConfig(),
    ).handle({
      minLat: 10.7,
      maxLat: 10.8,
      minLng: 106.6,
      maxLng: 106.8,
      originLat: 10.75,
      originLng: 106.7,
      postType: PostTypes.OFFER,
    });

    expect(postRepository.findMapClusters).toHaveBeenCalledWith(
      expect.objectContaining({
        minLat: 10.7,
        maxLat: 10.8,
        minLng: 106.6,
        maxLng: 106.8,
        origin: { lat: 10.75, lng: 106.7 },
        postType: PostTypes.OFFER,
      }),
    );
    expect(result.clusters[0].marker).toEqual(
      expect.objectContaining({
        postId: '11111111-1111-1111-1111-111111111111',
        isLocationApproximate: true,
        distanceMeters: 500,
      }),
    );
    expect(result.clusters[0].marker?.location).not.toEqual(ExactLocation);

    // F29 cho marker mang dữ liệu thẻ xem nhanh. `title` không phải dữ liệu
    // riêng tư — `/posts/nearby` vẫn trả cả entity bài cho khách — nên thêm nó
    // không mở thêm gì. Ranh giới thật nằm ở hai thứ dưới đây.
    expect(result.clusters[0].marker).not.toHaveProperty('authorId');
    expect(result.clusters[0].marker).not.toHaveProperty('description');
  });

  it('mang đủ dữ liệu thẻ xem nhanh mà không cần gọi thêm vòng nữa', async () => {
    const postRepository = {
      findMapClusters: jest.fn().mockResolvedValue({
        clusters: [
          {
            cellLng: 106.6,
            cellLat: 10.7,
            count: 1,
            marker: {
              globalId: '11111111-1111-1111-1111-111111111111',
              postType: PostTypes.OFFER,
              categoryId: '30000000-0000-4000-8000-000000000001',
              areaLabel: 'Quận 1',
              location: ExactLocation,
              distanceMeters: 463,
              title: 'Tặng bộ sách cũ',
              thumbnailKey: 'posts/abc/1.jpg',
              isSos: true,
            },
          },
        ],
        total: 1,
        cellCount: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;

    const { clusters } = await new GetPostMapUseCase(
      postRepository,
      makeConfig(),
    ).handle({
      minLat: 10.7,
      maxLat: 10.8,
      minLng: 106.6,
      maxLng: 106.8,
    });

    expect(clusters[0].marker!.title).toBe('Tặng bộ sách cũ');
    expect(clusters[0].marker!.isSos).toBe(true);
    expect(clusters[0].marker!.thumbnailUrl).toBe(
      'http://localhost:9000/chantam-test/posts/abc/1.jpg',
    );
    // Đường dẫn TƯƠNG ĐỐI: ghép tên miền hộ client là sinh ra link chết khi
    // đổi môi trường triển khai.
    expect(clusters[0].marker!.deepLinkPath).toBe(
      '/posts/11111111-1111-1111-1111-111111111111',
    );
    expect(clusters[0].marker!.deepLinkPath).not.toMatch(/^https?:/);
  });

  it('bài không có ảnh thì thumbnailUrl là null, không phải chuỗi cụt', async () => {
    const postRepository = {
      findMapClusters: jest.fn().mockResolvedValue({
        clusters: [
          {
            cellLng: 106.6,
            cellLat: 10.7,
            count: 1,
            marker: {
              globalId: '11111111-1111-1111-1111-111111111111',
              postType: PostTypes.OFFER,
              categoryId: '30000000-0000-4000-8000-000000000001',
              areaLabel: 'Quận 1',
              location: ExactLocation,
              title: 'Không ảnh',
              thumbnailKey: null,
              isSos: false,
            },
          },
        ],
        total: 1,
        cellCount: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;

    const { clusters } = await new GetPostMapUseCase(
      postRepository,
      makeConfig(),
    ).handle({
      minLat: 10.7,
      maxLat: 10.8,
      minLng: 106.6,
      maxLng: 106.8,
    });

    expect(clusters[0].marker!.thumbnailUrl).toBeNull();
  });

  it('từ chối bbox đảo chiều trước khi query repository', async () => {
    const postRepository = {
      findMapClusters: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new GetPostMapUseCase(postRepository, makeConfig()).handle({
        minLat: 10.8,
        maxLat: 10.7,
        minLng: 106.6,
        maxLng: 106.8,
      }),
    ).rejects.toThrow();
    expect(postRepository.findMapClusters).not.toHaveBeenCalled();
  });
});
