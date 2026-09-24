import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGiftRequestEntity,
  IPostEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { ProfileGate } from '../profile/profile-gate';
import { CreateGiftRequestUseCase } from './create-gift-request.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const AuthorId = '22222222-2222-2222-2222-222222222222';
const RequesterId = '33333333-3333-3333-3333-333333333333';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: AuthorId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    likeCount: 0,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    renewedCount: 0,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<IGiftRequestEntity> = {},
): IGiftRequestEntity {
  return {
    id: 1,
    globalId: '44444444-4444-4444-4444-444444444444',
    postId: PostId,
    requesterId: RequesterId,
    message: 'Em xin món này ạ',
    status: GiftRequestStatuses.PENDING,
    queueJoinedAt: new Date(),
    withdrawnAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeGiftRequestRepo(
  overrides: Partial<jest.Mocked<IGiftRequestRepository>> = {},
): jest.Mocked<IGiftRequestRepository> {
  return {
    countActiveByPostIds: jest.fn().mockResolvedValue(new Map([[PostId, 1]])),
    findByPostAndRequester: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue({ identifiers: [] }),
    findOneByOrFail: jest.fn().mockResolvedValue(makeRequest()),
    save: jest.fn().mockResolvedValue(makeRequest()),
    acceptRequest: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<IGiftRequestRepository>;
}

function makePostRepo(
  overrides: Partial<jest.Mocked<IPostRepository>> = {},
): jest.Mocked<IPostRepository> {
  return {
    findOneBy: jest.fn().mockResolvedValue(makePost()),
    save: jest
      .fn()
      .mockImplementation((post: IPostEntity) => Promise.resolve(post)),
    ...overrides,
  } as unknown as jest.Mocked<IPostRepository>;
}

/**
 * Hồ sơ đủ điều kiện, để cổng F07 không phải là chủ đề của từng ca kiểm ở đây.
 * Ca "hồ sơ chưa đủ thì chặn" nằm ở `profile-gate.spec.ts`.
 */
function makeProfileGate() {
  return new ProfileGate({
    findOneBy: jest.fn().mockResolvedValue({
      globalId: RequesterId,
      deletedAt: null,
      fullName: 'Người Xin',
      avatarUrl: 'https://cdn/avatar.png',
      phone: '+84900000000',
      email: 'nguoixin@chantam.test',
    }),
  } as never);
}

describe('CreateGiftRequestUseCase', () => {
  it('tạo yêu cầu thành công khi bài viết hợp lệ và chưa từng yêu cầu', async () => {
    const postRepo = makePostRepo();
    const created = makeRequest();
    const giftRequestRepo = makeGiftRequestRepo({
      findOneByOrFail: jest.fn().mockResolvedValue(created),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    const result = await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
    });

    // `insert()` chứ không phải `save()`: đường này biết chắc là tạo mới nên
    // không cần câu SELECT mà `save()` phát sinh để đoán insert hay update.
    expect(giftRequestRepo.insert).toHaveBeenCalledWith({
      globalId: expect.any(String),
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
      status: GiftRequestStatuses.PENDING,
      queueJoinedAt: expect.any(Date),
    });
    expect(result.request.id).toBe(created.globalId);
    expect(result.request.status).toBe(GiftRequestStatuses.PENDING);
  });

  it('cho phép nộp lại nếu trước đó đã rút (WITHDRAWN)', async () => {
    const postRepo = makePostRepo();

    const existingWithdrawn = makeRequest({
      status: GiftRequestStatuses.WITHDRAWN,
      withdrawnAt: new Date(),
    });

    const giftRequestRepo = makeGiftRequestRepo({
      findByPostAndRequester: jest.fn().mockResolvedValue(existingWithdrawn),
      save: jest.fn().mockResolvedValue(existingWithdrawn),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    const result = await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Nộp lại lần 2',
    });

    expect(existingWithdrawn.status).toBe(GiftRequestStatuses.PENDING);
    expect(existingWithdrawn.message).toBe('Nộp lại lần 2');
    expect(existingWithdrawn.withdrawnAt).toBeNull();
    expect(giftRequestRepo.save).toHaveBeenCalledWith(existingWithdrawn);
    expect(result.request.status).toBe(GiftRequestStatuses.PENDING);
  });

  it('tính deadline 7 ngày khi nhận request đầu tiên cho bài OPTIMAL', async () => {
    const post = makePost({
      selectionMode: PostSelectionModes.OPTIMAL,
      selectionDeadline: null,
    });
    const postRepo = makePostRepo({
      findOneBy: jest.fn().mockResolvedValue(post),
    });
    const giftRequestRepo = makeGiftRequestRepo({
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map([[PostId, 0]])),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
    });

    expect(postRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionDeadline: expect.any(Date),
      }),
    );
    expect(post.selectionDeadline).toBeDefined();
    const diffDays = Math.round(
      (post.selectionDeadline!.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(7);
  });

  it('tính deadline 30 ngày khi nhận request đầu tiên cho bài EXTENDED', async () => {
    const post = makePost({
      selectionMode: PostSelectionModes.EXTENDED,
      selectionDeadline: null,
    });
    const postRepo = makePostRepo({
      findOneBy: jest.fn().mockResolvedValue(post),
    });
    const giftRequestRepo = makeGiftRequestRepo({
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map([[PostId, 0]])),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
    });

    expect(postRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionDeadline: expect.any(Date),
      }),
    );
    const diffDays = Math.round(
      (post.selectionDeadline!.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(30);
  });

  it('tự động chấp nhận ngay lập tức khi nhận request đầu tiên cho bài INSTANT', async () => {
    const post = makePost({
      selectionMode: PostSelectionModes.INSTANT,
      selectionDeadline: null,
    });
    const postRepo = makePostRepo({
      findOneBy: jest.fn().mockResolvedValue(post),
    });
    const giftRequestRepo = makeGiftRequestRepo({
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map([[PostId, 0]])),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
    });

    expect(giftRequestRepo.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: PostId,
        giverId: post.authorId,
      }),
    );
  });

  it('ném PostNotFoundException nếu bài viết không tồn tại', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('ném CannotRequestOwnPostException nếu tác giả tự xin bài của mình', async () => {
    const postRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ authorId: RequesterId })),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(CannotRequestOwnPostException);
  });

  it('ném PostNotAcceptingRequestsException nếu bài chưa PUBLISHED', async () => {
    const postRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ status: GiftPostStatuses.RESERVED })),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(PostNotAcceptingRequestsException);
  });

  it('từ chối bài đã quá hạn dù trạng thái vẫn còn là PUBLISHED', async () => {
    // Vòng quét hết hạn chạy theo lịch, nên có một khoảng bài đã quá hạn mà
    // chưa kịp mang trạng thái EXPIRED. Khoảng đó không được thành cửa sổ
    // xin nhận.
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(
        makePost({
          status: GiftPostStatuses.PUBLISHED,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(PostNotAcceptingRequestsException);
  });

  it('bài còn hạn thì vẫn xin được bình thường', async () => {
    const postRepo = makePostRepo({
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          makePost({ expiresAt: new Date(Date.now() + 60_000) }),
        ),
    });
    const giftRequestRepo = makeGiftRequestRepo();

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );

    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).resolves.toBeDefined();
  });

  it('ném GiftRequestDuplicatedException nếu đã có yêu cầu PENDING', async () => {
    const postRepo = makePostRepo();
    const existingPending = makeRequest({
      status: GiftRequestStatuses.PENDING,
    });
    const giftRequestRepo = makeGiftRequestRepo({
      findByPostAndRequester: jest.fn().mockResolvedValue(existingPending),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do them lan nua',
      }),
    ).rejects.toBeInstanceOf(GiftRequestDuplicatedException);
  });

  it('ném GiftRequestDuplicatedException khi DB gặp race condition trùng khoá (code 23505)', async () => {
    const postRepo = makePostRepo();
    const dbError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
    });
    const giftRequestRepo = makeGiftRequestRepo({
      findByPostAndRequester: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockRejectedValue(dbError),
    });

    const useCase = new CreateGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      makeProfileGate(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'Em xin món này ạ',
      }),
    ).rejects.toBeInstanceOf(GiftRequestDuplicatedException);
  });
});
