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
    geo: { jitterRadiusMeters: 300 },
  };
}

describe('GetPostMapUseCase', () => {
  it('trả marker tối thiểu với toạ độ jitter và distance được bucket', async () => {
    const postRepository = {
      findMapMarkers: jest.fn().mockResolvedValue([
        {
          globalId: '11111111-1111-1111-1111-111111111111',
          postType: PostTypes.OFFER,
          categoryId: '30000000-0000-4000-8000-000000000001',
          areaLabel: 'Quận 1, TP.HCM',
          location: ExactLocation,
          distanceMeters: 463,
        },
      ]),
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

    expect(postRepository.findMapMarkers).toHaveBeenCalledWith({
      minLat: 10.7,
      maxLat: 10.8,
      minLng: 106.6,
      maxLng: 106.8,
      origin: { lat: 10.75, lng: 106.7 },
      postType: PostTypes.OFFER,
      categoryId: undefined,
    });
    expect(result.markers).toEqual([
      expect.objectContaining({
        postId: '11111111-1111-1111-1111-111111111111',
        isLocationApproximate: true,
        distanceMeters: 500,
      }),
    ]);
    expect(result.markers[0].location).not.toEqual(ExactLocation);
    expect(result.markers[0]).not.toHaveProperty('title');
    expect(result.markers[0]).not.toHaveProperty('authorId');
  });

  it('từ chối bbox đảo chiều trước khi query repository', async () => {
    const postRepository = {
      findMapMarkers: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new GetPostMapUseCase(postRepository, makeConfig()).handle({
        minLat: 10.8,
        maxLat: 10.7,
        minLng: 106.6,
        maxLng: 106.8,
      }),
    ).rejects.toThrow();
    expect(postRepository.findMapMarkers).not.toHaveBeenCalled();
  });
});
