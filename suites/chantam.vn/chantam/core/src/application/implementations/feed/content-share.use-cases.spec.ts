import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentShareRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RecordContentShareUseCase } from './content-share.use-cases';

const PostId = '11111111-1111-1111-1111-111111111111';
const UserId = '99999999-9999-9999-9999-999999999999';

function makeConfig(publicBaseUrl = ''): IConfig {
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
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl },
    security: { secretEncryptionKey: '' },
    storage: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      publicBaseUrl: '',
    },
    geo: { jitterRadiusMeters: 300 },
  };
}

describe('RecordContentShareUseCase', () => {
  it('ghi nhận lượt chia sẻ và trả đường dẫn tương đối, không nhân bản nội dung', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const shares = {
      recordShare: jest.fn().mockResolvedValue({ shareCount: 3 }),
    } as unknown as jest.Mocked<IContentShareRepository>;

    const result = await new RecordContentShareUseCase(
      shares,
      posts,
      makeConfig(),
    ).handle({
      userId: UserId,
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      channel: 'zalo',
    });

    expect(shares.recordShare).toHaveBeenCalledWith({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      userId: UserId,
      channel: 'zalo',
    });
    expect(result.share).toEqual({
      deepLinkPath: `/posts/${PostId}`,
      shareUrl: null,
      shareCount: 3,
    });
  });

  it('ghép shareUrl tuyệt đối chỉ khi web công khai đã cấu hình', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const shares = {
      recordShare: jest.fn().mockResolvedValue({ shareCount: 1 }),
    } as unknown as jest.Mocked<IContentShareRepository>;

    const result = await new RecordContentShareUseCase(
      shares,
      posts,
      makeConfig('https://chantam.vn/'),
    ).handle({
      userId: UserId,
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
    });

    expect(result.share.shareUrl).toBe(`https://chantam.vn/posts/${PostId}`);
    expect(result.share.deepLinkPath).toBe(`/posts/${PostId}`);
  });

  it('bài không tồn tại hoặc đã xoá thì từ chối, không ghi lượt', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const shares = {
      recordShare: jest.fn(),
    } as unknown as jest.Mocked<IContentShareRepository>;

    await expect(
      new RecordContentShareUseCase(shares, posts, makeConfig()).handle({
        userId: UserId,
        subjectType: ContentSubjectTypes.POST,
        subjectId: PostId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);

    expect(shares.recordShare).not.toHaveBeenCalled();
  });

  it('cắt kênh về 40 ký tự và coi chuỗi trắng là null', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: PostId,
        deletedAt: null,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const shares = {
      recordShare: jest.fn().mockResolvedValue({ shareCount: 1 }),
    } as unknown as jest.Mocked<IContentShareRepository>;

    await new RecordContentShareUseCase(shares, posts, makeConfig()).handle({
      userId: UserId,
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      channel: '   ',
    });
    expect(shares.recordShare).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: null }),
    );

    await new RecordContentShareUseCase(shares, posts, makeConfig()).handle({
      userId: UserId,
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      channel: 'x'.repeat(50),
    });
    expect(shares.recordShare).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: 'x'.repeat(40) }),
    );
  });
});
