import {
  CharityReviewedFieldKeys,
  reviewedFieldsChanged,
} from './charity-change-request';

describe('reviewedFieldsChanged (CR 22/11/2026 — bản sửa chờ duyệt)', () => {
  const unit = (name: string, estimatedPortions: number, partyId?: string) => ({
    ...(partyId ? { partyId } : {}),
    name,
    beneficiaryKind: 'GROUP' as const,
    estimatedPortions,
    estimatedAmount: 0,
  });

  it('sáu khoá cần duyệt', () => {
    expect([...CharityReviewedFieldKeys]).toEqual([
      'title',
      'description',
      'media',
      'beneficiaries',
      'acceptedContributionTypes',
      'pointBonusPercent',
    ]);
  });

  it('giống hệt → []', () => {
    expect(reviewedFieldsChanged({ title: 'A' }, { title: 'A' })).toEqual([]);
  });

  it('chỉ so các khoá có trong proposed; khoảng trắng hai đầu không tính', () => {
    expect(
      reviewedFieldsChanged(
        { title: 'A', description: 'Mô tả cũ' },
        { title: '  A ' },
      ),
    ).toEqual([]);
  });

  it('danh sách đơn vị đổi thứ tự, cùng giá trị → []', () => {
    expect(
      reviewedFieldsChanged(
        { beneficiaries: [unit('Xã A', 10, 'p1'), unit('Xã B', 5, 'p2')] },
        { beneficiaries: [unit('Xã B', 5, 'p2'), unit('Xã A', 10, 'p1')] },
      ),
    ).toEqual([]);
  });

  it('đổi số suất → [beneficiaries]', () => {
    expect(
      reviewedFieldsChanged(
        { beneficiaries: [unit('Xã A', 10, 'p1')] },
        { beneficiaries: [unit('Xã A', 12, 'p1')] },
      ),
    ).toEqual(['beneficiaries']);
  });

  it('loại tiếp nhận so như tập hợp; hệ số và media so theo giá trị', () => {
    expect(
      reviewedFieldsChanged(
        {
          acceptedContributionTypes: ['MATERIAL', 'MONEY'],
          pointBonusPercent: 0,
        },
        {
          acceptedContributionTypes: ['MONEY', 'MATERIAL'],
          pointBonusPercent: 50,
        },
      ),
    ).toEqual(['pointBonusPercent']);
    expect(
      reviewedFieldsChanged(
        { media: { keys: ['a', 'b'], coverKey: 'a' } },
        { media: { keys: ['a', 'b'], coverKey: 'b' } },
      ),
    ).toEqual(['media']);
  });
});
