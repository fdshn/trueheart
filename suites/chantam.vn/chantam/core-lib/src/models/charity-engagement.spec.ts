import {
  charityShareLink,
  defaultTaskSchedule,
  diffCharityRevisions,
  isPubliclyVisibleProject,
  isSuspendedProject,
} from './charity-engagement';

describe('diffCharityRevisions', () => {
  it('ghi từng field đổi, giữ nguyên field không đổi', () => {
    const drafts = diffCharityRevisions(
      'CAMPAIGN',
      [{ id: null, values: { appealPurpose: 'A', appealAudience: 'B' } }],
      [{ id: null, values: { appealPurpose: 'A2', appealAudience: 'B' } }],
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        field: 'appealPurpose',
        oldValue: 'A',
        newValue: 'A2',
        isPublic: true,
        isImportant: false,
      }),
    ]);
  });

  it('dòng thêm/xoá là một revision `*` chỉ mang field công khai', () => {
    const drafts = diffCharityRevisions(
      'PARTY',
      [
        {
          id: 'p1',
          values: { role: 'ORGANIZER', name: 'CLB', phone: '090' },
        },
      ],
      [
        {
          id: 'p2',
          values: {
            role: 'BENEFICIARY',
            name: 'Điểm trường',
            address: 'Bí mật',
            phone: '091',
          },
        },
      ],
    );
    const added = drafts.find((draft) => draft.entityId === 'p2')!;
    expect(added.field).toBe('*');
    expect(added.newValue).toEqual(
      expect.objectContaining({ role: 'BENEFICIARY', name: 'Điểm trường' }),
    );
    expect(JSON.stringify(added.newValue)).not.toContain('Bí mật');
    expect(JSON.stringify(added.newValue)).not.toContain('091');
    expect(added.isImportant).toBe(true);
    const removed = drafts.find((draft) => draft.entityId === 'p1')!;
    expect(removed.newValue).toBeNull();
    expect(JSON.stringify(removed.oldValue)).not.toContain('090');
  });

  it('field riêng tư ở một trong hai phía thì revision không công khai', () => {
    const [draft] = diffCharityRevisions(
      'PARTY',
      [{ id: 'p', values: { role: 'BENEFICIARY', address: 'Cũ' } }],
      [{ id: 'p', values: { role: 'BENEFICIARY', address: 'Mới' } }],
    );
    expect(draft.isPublic).toBe(false);
    const changes = diffCharityRevisions(
      'PARTY',
      [{ id: 'p', values: { role: 'BENEFICIARY', address: 'Cũ' } }],
      [{ id: 'p', values: { role: 'ORGANIZER', address: 'Cũ' } }],
    );
    expect(changes.map((change) => change.field)).toEqual(['role']);
  });

  it('so ngày theo giá trị, không theo đối tượng', () => {
    expect(
      diffCharityRevisions(
        'PHASE',
        [
          {
            id: 'DISTRIBUTION',
            values: { phase: 'DISTRIBUTION', startsAt: new Date(1000) },
          },
        ],
        [
          {
            id: 'DISTRIBUTION',
            values: {
              phase: 'DISTRIBUTION',
              startsAt: new Date(1000).toISOString(),
            },
          },
        ],
      ),
    ).toEqual([]);
  });

  it('đổi giờ bước trao là quan trọng, đổi giờ bước khác thì không', () => {
    const at = (phase: string, ms: number) => ({
      id: phase,
      values: { phase, startsAt: new Date(ms) },
    });
    expect(
      diffCharityRevisions(
        'PHASE',
        [at('DISTRIBUTION', 1)],
        [at('DISTRIBUTION', 2)],
      )[0].isImportant,
    ).toBe(true);
    expect(
      diffCharityRevisions('PHASE', [at('PLANNING', 1)], [at('PLANNING', 2)])[0]
        .isImportant,
    ).toBe(false);
  });

  it('số tiến độ của nhu cầu tiền không sinh revision', () => {
    expect(
      diffCharityRevisions(
        'FUNDING_NEED',
        [{ id: 'f', values: { title: 'X', confirmedAmount: 1 } }],
        [{ id: 'f', values: { title: 'X', confirmedAmount: 2 } }],
      ),
    ).toEqual([]);
  });

  it('người nhận hàng là riêng tư', () => {
    const [draft] = diffCharityRevisions(
      'NEED_ITEM',
      [{ id: 'n', values: { receiverName: 'A' } }],
      [{ id: 'n', values: { receiverName: 'B' } }],
    );
    expect(draft.isPublic).toBe(false);
  });
});

describe('defaultTaskSchedule', () => {
  it('kết thúc tiếp nhận theo hạn nhận sớm nhất, tiền trạm trước trao 48 giờ', () => {
    const schedule = defaultTaskSchedule({
      endTime: new Date('2026-12-31T00:00:00Z'),
      earliestIntakeDeadline: new Date('2026-12-10T00:00:00Z'),
      distributionStartsAt: new Date('2026-12-20T00:00:00Z'),
    });
    expect(schedule.CLOSE_INTAKE?.toISOString()).toBe(
      '2026-12-10T00:00:00.000Z',
    );
    expect(schedule.PRE_EVENT_NOTICE?.toISOString()).toBe(
      '2026-12-18T00:00:00.000Z',
    );
  });

  it('chưa có hạn nhận và bước trao: dùng hết hạn dự án, không có mốc tiền trạm', () => {
    const schedule = defaultTaskSchedule({
      endTime: new Date('2026-12-31T00:00:00Z'),
      earliestIntakeDeadline: null,
      distributionStartsAt: null,
    });
    expect(schedule.CLOSE_INTAKE?.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
    expect(schedule.PRE_EVENT_NOTICE).toBeUndefined();
  });
});

describe('hiển thị công khai', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  const past = new Date('2026-11-01T00:00:00Z');
  const future = new Date('2026-12-01T00:00:00Z');

  it('đang chạy và đã đóng thì hiện; đình chỉ và chưa duyệt thì không', () => {
    const base = { approvalStatus: 'APPROVED' };
    expect(
      isPubliclyVisibleProject(
        { ...base, isActive: true, endTime: future },
        now,
      ),
    ).toBe(true);
    expect(
      isPubliclyVisibleProject(
        { ...base, isActive: false, endTime: past },
        now,
      ),
    ).toBe(true);
    expect(
      isPubliclyVisibleProject(
        { ...base, isActive: false, endTime: future },
        now,
      ),
    ).toBe(false);
    expect(
      isPubliclyVisibleProject(
        { approvalStatus: 'PENDING_APPROVAL', isActive: true, endTime: future },
        now,
      ),
    ).toBe(false);
  });

  it('đình chỉ = tắt mà còn hạn', () => {
    expect(isSuspendedProject({ isActive: false, endTime: future }, now)).toBe(
      true,
    );
    expect(isSuspendedProject({ isActive: false, endTime: past }, now)).toBe(
      false,
    );
    expect(isSuspendedProject({ isActive: true, endTime: future }, now)).toBe(
      false,
    );
  });
});

describe('charityShareLink', () => {
  it('có base thì có URL tuyệt đối; mục thì thêm ?section', () => {
    expect(charityShareLink('https://chantam.vn/', 'ao-am', 'EVENT')).toEqual({
      sharePath: '/c/ao-am?section=EVENT',
      shareUrl: 'https://chantam.vn/c/ao-am?section=EVENT',
    });
  });

  it('chưa cấu hình web công khai thì URL là null', () => {
    expect(charityShareLink('', 'ao-am', null)).toEqual({
      sharePath: '/c/ao-am',
      shareUrl: null,
    });
  });
});
