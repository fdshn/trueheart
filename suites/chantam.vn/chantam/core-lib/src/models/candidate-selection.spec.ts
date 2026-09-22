import { CandidateSelectionCriteria, UserRanks } from '../consts';
import {
  ICandidateMetrics,
  normalizeCandidateSelectionOrder,
  pickNextCandidate,
  rankCandidates,
} from './candidate-selection';

function candidate(
  id: string,
  overrides: Partial<ICandidateMetrics> = {},
): ICandidateMetrics {
  return {
    requesterId: id,
    queueJoinedAt: new Date('2026-09-01T00:00:00.000Z'),
    requestId: 1,
    rank: UserRanks.MEMBER,
    distanceMeters: 1_000,
    receivedCount: 0,
    cancellationCount: 0,
    ...overrides,
  };
}

const ids = (list: ICandidateMetrics[]): string[] =>
  list.map((entry) => entry.requesterId);

describe('normalizeCandidateSelectionOrder', () => {
  it('bỏ mã lạ và mã trùng', () => {
    expect(
      normalizeCandidateSelectionOrder([
        'KHONG_TON_TAI',
        CandidateSelectionCriteria.NEAREST,
        CandidateSelectionCriteria.NEAREST,
      ])[0],
    ).toBe(CandidateSelectionCriteria.NEAREST);
  });

  it('luôn phủ đủ MỌI tiêu chí, kể cả khi Admin chỉ khai một', () => {
    // Thiếu tiêu chí nghĩa là tới đoạn đó không còn gì phá thế hoà, và hai ứng
    // viên khác nhau sẽ xếp theo thứ tự ngẫu nhiên của database.
    const order = normalizeCandidateSelectionOrder([
      CandidateSelectionCriteria.HIGHEST_RANK,
    ]);

    expect(order[0]).toBe(CandidateSelectionCriteria.HIGHEST_RANK);
    expect(new Set(order).size).toBe(
      Object.values(CandidateSelectionCriteria).length,
    );
  });

  it('cấu hình rỗng, null hay rác thì rơi về mặc định, KHÔNG ném lỗi', () => {
    // Một dòng config sai không được phép làm chết đường gợi ý người nhận.
    for (const broken of [null, undefined, [], ['rac', 42, {}]])
      expect(normalizeCandidateSelectionOrder(broken as never)[0]).toBe(
        CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST,
      );
  });
});

describe('rankCandidates', () => {
  it('tiêu chí đứng đầu quyết định', () => {
    const list = [
      candidate('a', { rank: UserRanks.MEMBER }),
      candidate('b', { rank: UserRanks.DIAMOND }),
    ];

    expect(
      ids(rankCandidates(list, [CandidateSelectionCriteria.HIGHEST_RANK])),
    ).toEqual(['b', 'a']);
  });

  it('đổi thứ tự cấu hình thì đổi người được chọn', () => {
    // Đây là toàn bộ lý do tồn tại của cấu hình động: cùng một dữ liệu, hai
    // chính sách, hai kết quả.
    const early = candidate('xin-truoc', {
      queueJoinedAt: new Date('2026-09-01T08:00:00.000Z'),
      rank: UserRanks.MEMBER,
      requestId: 1,
    });
    const senior = candidate('hang-cao', {
      queueJoinedAt: new Date('2026-09-01T09:00:00.000Z'),
      rank: UserRanks.DIAMOND,
      requestId: 2,
    });

    expect(
      pickNextCandidate(
        [early, senior],
        [CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST],
      )?.requesterId,
    ).toBe('xin-truoc');

    expect(
      pickNextCandidate(
        [early, senior],
        [CandidateSelectionCriteria.HIGHEST_RANK],
      )?.requesterId,
    ).toBe('hang-cao');
  });

  it('hoà tiêu chí đầu thì xét tiêu chí sau', () => {
    const list = [
      candidate('a', { rank: UserRanks.GOLD, receivedCount: 5 }),
      candidate('b', { rank: UserRanks.GOLD, receivedCount: 1 }),
    ];

    expect(
      ids(
        rankCandidates(list, [
          CandidateSelectionCriteria.HIGHEST_RANK,
          CandidateSelectionCriteria.FEWEST_RECEIVED,
        ]),
      ),
    ).toEqual(['b', 'a']);
  });

  it('người chưa đặt Vị trí mặc định xếp SAU, không phải coi như 0 mét', () => {
    // Coi `null` là 0 sẽ đẩy người thiếu dữ liệu lên đầu — thưởng cho việc
    // không khai thông tin.
    const list = [
      candidate('khong-toa-do', { distanceMeters: null }),
      candidate('xa', { distanceMeters: 9_000 }),
    ];

    expect(
      ids(rankCandidates(list, [CandidateSelectionCriteria.NEAREST])),
    ).toEqual(['xa', 'khong-toa-do']);
  });

  it('hoà hết thì phá bằng thời điểm vào hàng đợi rồi id', () => {
    // Tất định tuyệt đối: cùng dữ liệu vào phải cùng kết quả ra, kể cả khi
    // Admin không đặt QUEUE_JOINED_EARLIEST ở đâu cả.
    const same = { rank: UserRanks.GOLD, distanceMeters: 500 };
    const list = [
      candidate('sau', {
        ...same,
        queueJoinedAt: new Date('2026-09-02T00:00:00.000Z'),
        requestId: 9,
      }),
      candidate('truoc', {
        ...same,
        queueJoinedAt: new Date('2026-09-01T00:00:00.000Z'),
        requestId: 3,
      }),
    ];

    expect(
      ids(rankCandidates(list, [CandidateSelectionCriteria.HIGHEST_RANK])),
    ).toEqual(['truoc', 'sau']);
  });

  it('cùng mốc thời gian thì id nhỏ hơn xếp trước', () => {
    const list = [
      candidate('b', { requestId: 20 }),
      candidate('a', { requestId: 10 }),
    ];

    expect(
      ids(rankCandidates(list, [CandidateSelectionCriteria.HIGHEST_RANK])),
    ).toEqual(['a', 'b']);
  });

  it('KHÔNG sửa mảng đầu vào', () => {
    const list = [
      candidate('b', { rank: UserRanks.MEMBER }),
      candidate('a', { rank: UserRanks.DIAMOND }),
    ];

    rankCandidates(list, [CandidateSelectionCriteria.HIGHEST_RANK]);

    expect(ids(list)).toEqual(['b', 'a']);
  });

  it('không có ứng viên nào thì không đề xuất ai', () => {
    expect(pickNextCandidate([], null)).toBeNull();
  });
});
