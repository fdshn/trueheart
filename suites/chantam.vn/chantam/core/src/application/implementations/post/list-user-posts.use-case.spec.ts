import { UserNotFoundException } from '@/domain/exceptions';
import { PostTypes, UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { ListUserPostsUseCase } from './list-user-posts.use-case';

const AuthorId = '10000000-0000-4000-8000-000000000001';
const Viewer = '20000000-0000-4000-8000-000000000002';
const Exact = { lat: 10.7724, lng: 106.698 };

const author = {
  globalId: AuthorId,
  username: 'nguoi-tang',
  fullName: 'Người Tặng',
  avatarUrl: null,
  rank: UserRanks.GOLD,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  email: 'private@example.com',
  phone: '+84900000000',
};

function make(posts: unknown[] = []) {
  const deps = {
    users: { findActiveByUsername: jest.fn(async () => author) },
    posts: {
      findMyPosts: jest.fn(async () => ({ items: posts, total: posts.length })),
    },
    media: { listByPostIds: jest.fn(async () => []) },
    requests: { countActiveByPostIds: jest.fn(async () => new Map()) },
    reactions: { findMyReactions: jest.fn(async () => new Map()) },
    config: {
      storage: { publicBaseUrl: 'https://cdn.test' },
      geo: { jitterRadiusMeters: 300 },
    },
  };
  const useCase = new ListUserPostsUseCase(
    deps.users as never,
    deps.posts as never,
    deps.media as never,
    deps.requests as never,
    deps.reactions as never,
    deps.config as never,
  );
  return { deps, useCase };
}

const post = (id: string) => ({
  globalId: id,
  authorId: AuthorId,
  postType: PostTypes.OFFER,
  status: 'PUBLISHED',
  location: Exact,
  reactionCount: 0,
  commentCount: 0,
  shareCount: 0,
});

describe('GET /profile/:username/posts (PR #46 §3.4)', () => {
  it('người ngoài: chỉ bài đang công khai, theo tác giả của username', async () => {
    const { deps, useCase } = make();

    await useCase.handle({ username: 'nguoi-tang', viewerId: Viewer });

    expect(deps.posts.findMyPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: AuthorId,
        visibleStatuses: ['PUBLISHED', 'RESERVED'],
      }),
    );
  });

  it('khách chưa đăng nhập cũng chỉ thấy bài công khai', async () => {
    const { deps, useCase } = make();

    await useCase.handle({ username: 'nguoi-tang', viewerId: null });

    expect(deps.posts.findMyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ visibleStatuses: ['PUBLISHED', 'RESERVED'] }),
    );
  });

  it('chính chủ: mọi trạng thái, không bó hẹp', async () => {
    const { deps, useCase } = make();

    await useCase.handle({ username: 'nguoi-tang', viewerId: AuthorId });

    expect(deps.posts.findMyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ visibleStatuses: undefined }),
    );
  });

  it('người ngoài lọc một trạng thái không công khai thì rỗng, không hỏi database', async () => {
    const { deps, useCase } = make();

    const result = await useCase.handle({
      username: 'nguoi-tang',
      viewerId: Viewer,
      status: 'EXPIRED',
    });

    expect(result.posts).toEqual([]);
    expect(deps.posts.findMyPosts).not.toHaveBeenCalled();
  });

  it('vị trí làm nhiễu, tác giả là author summary, không lộ liên hệ', async () => {
    const { useCase } = make([post('30000000-0000-4000-8000-000000000003')]);

    const result = await useCase.handle({
      username: 'nguoi-tang',
      viewerId: Viewer,
    });

    expect(result.posts[0].post.location).not.toEqual(Exact);
    expect(result.posts[0].isLocationApproximate).toBe(true);
    expect(result.posts[0].author?.fullName).toBe('Người Tặng');
    const json = JSON.stringify(result);
    expect(json).not.toContain('private@example.com');
    expect(json).not.toContain('84900000000');
  });

  it('username không có thì 404', async () => {
    const { deps, useCase } = make();
    deps.users.findActiveByUsername.mockResolvedValue(null as never);

    await expect(
      useCase.handle({ username: 'khong-co', viewerId: null }),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });
});
