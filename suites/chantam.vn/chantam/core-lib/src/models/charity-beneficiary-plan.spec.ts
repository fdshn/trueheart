import {
  beneficiariesOutsideWindow,
  beneficiarySubmitGaps,
  fundingBelowEstimate,
  ICharityBeneficiaryPlan,
  minimumQuantityFor,
  needPortionShortfalls,
  toPublicBeneficiary,
  totalEstimatedAmount,
  totalEstimatedPortions,
} from './charity-beneficiary-plan';
import { CharityRevisionPolicies } from './charity-engagement';
import {
  CharityMaxBeneficiariesConfigKey,
  CharityMaxIntakeLocationsConfigKey,
  DefaultCharityMaxBeneficiaries,
  DefaultCharityMaxIntakeLocations,
  normalizeMaxBeneficiaries,
  normalizeMaxIntakeLocations,
} from './charity-project';

const plan = (
  overrides: Partial<ICharityBeneficiaryPlan> = {},
): ICharityBeneficiaryPlan => ({
  name: 'Xã A',
  beneficiaryKind: 'GROUP',
  estimatedPortions: 0,
  estimatedAmount: 0,
  address: 'Thôn 1',
  distributionAt: new Date('2026-12-20T02:00:00Z'),
  ...overrides,
});

describe('charity-beneficiary-plan', () => {
  const needs = (targetQuantity: number, quantityPerPortion = 1) => [
    {
      index: 0,
      needItemId: null,
      itemName: 'Gạo',
      targetQuantity,
      quantityPerPortion,
    },
  ];
  const list = [
    plan({ name: 'A', estimatedPortions: 200, estimatedAmount: 600 }),
    plan({ name: 'B', estimatedPortions: 100, estimatedAmount: 400 }),
  ];

  it('tổng suất và tổng tiền ước tính', () => {
    expect(totalEstimatedPortions(list)).toBe(300);
    expect(totalEstimatedAmount(list)).toBe(1000);
  });

  it('A 200 + B 100, quantityPerPortion 1, target 299 → minimumQuantity 300', () => {
    expect(needPortionShortfalls(needs(299), 300)).toEqual([
      {
        index: 0,
        needItemId: null,
        itemName: 'Gạo',
        targetQuantity: 299,
        minimumQuantity: 300,
      },
    ]);
  });

  it('target 300 → không thiếu', () => {
    expect(needPortionShortfalls(needs(300), 300)).toEqual([]);
  });

  it('gạo 5/suất → 1500', () => {
    expect(minimumQuantityFor(300, 5)).toBe(1500);
    expect(needPortionShortfalls(needs(1499, 5), 300)[0].minimumQuantity).toBe(
      1500,
    );
  });

  it('tổng suất 0 → không áp', () => {
    expect(minimumQuantityFor(0, 5)).toBe(0);
    expect(needPortionShortfalls(needs(0, 5), 0)).toEqual([]);
  });

  it('fundingBelowEstimate(999, 1000) === true', () => {
    expect(fundingBelowEstimate(999, 1000)).toBe(true);
    expect(fundingBelowEstimate(1000, 1000)).toBe(false);
    expect(fundingBelowEstimate(0, 0)).toBe(false);
  });

  it('distributionAt ngoài khung → trả đúng đơn vị', () => {
    const window = {
      startsAt: new Date('2026-12-20T00:00:00Z'),
      endsAt: new Date('2026-12-20T10:00:00Z'),
    };
    const late = new Date('2026-12-21T00:00:00Z');
    expect(
      beneficiariesOutsideWindow(
        [
          plan({ name: 'Trong khung' }),
          plan({ name: 'Trễ', distributionAt: late }),
          plan({ name: 'Chưa hẹn', distributionAt: null }),
        ],
        window,
      ),
    ).toEqual([{ index: 1, name: 'Trễ', distributionAt: late }]);
  });

  it('khung null → []', () => {
    expect(
      beneficiariesOutsideWindow(
        [plan({ distributionAt: new Date('2030-01-01T00:00:00Z') })],
        null,
      ),
    ).toEqual([]);
  });

  it('gửi duyệt cần địa chỉ và giờ trao của từng đơn vị', () => {
    expect(
      beneficiarySubmitGaps([
        plan(),
        plan({ address: '  ', distributionAt: null }),
      ]),
    ).toEqual(['beneficiaries[1].address', 'beneficiaries[1].distributionAt']);
  });

  it('public INDIVIDUAL: address null, location null, không có khoá phone/picPhone', () => {
    const party = {
      name: 'Bà Tư',
      beneficiaryKind: 'INDIVIDUAL' as const,
      estimatedPortions: 1,
      estimatedAmount: 500000,
      distributionAt: null,
      address: '12 Hẻm 3',
      lat: 10.1,
      lng: 106.2,
      phone: '0912',
      picName: 'Anh Ba',
      picPhone: '0913',
    };
    const view = toPublicBeneficiary(party);
    expect(view.address).toBeNull();
    expect(view.location).toBeNull();
    expect(Object.keys(view).sort()).toEqual(
      [
        'address',
        'beneficiaryKind',
        'distributionAt',
        'estimatedAmount',
        'estimatedPortions',
        'location',
        'name',
      ].sort(),
    );
  });

  it('public GROUP: có địa chỉ và toạ độ', () => {
    const view = toPublicBeneficiary({
      name: 'Xã A',
      beneficiaryKind: 'GROUP',
      estimatedPortions: 100,
      estimatedAmount: 0,
      distributionAt: null,
      address: 'UBND xã A',
      lat: 10.1,
      lng: 106.2,
    });
    expect(view.address).toBe('UBND xã A');
    expect(view.location).toEqual({ lat: 10.1, lng: 106.2 });
  });

  it('PARTY address của GROUP là công khai, của INDIVIDUAL là riêng tư', () => {
    const policy = CharityRevisionPolicies.PARTY;
    expect(policy.isPrivate('address', { beneficiaryKind: 'GROUP' })).toBe(
      false,
    );
    expect(
      policy.isPrivate('address', {
        role: 'BENEFICIARY',
        beneficiaryKind: 'GROUP',
      }),
    ).toBe(false);
    expect(
      policy.isPrivate('address', {
        role: 'BENEFICIARY',
        beneficiaryKind: 'INDIVIDUAL',
      }),
    ).toBe(true);
    expect(
      policy.isPrivate('location', {
        role: 'BENEFICIARY',
        beneficiaryKind: 'INDIVIDUAL',
      }),
    ).toBe(true);
    expect(
      policy.isPrivate('phone', {
        role: 'BENEFICIARY',
        beneficiaryKind: 'GROUP',
      }),
    ).toBe(true);
    expect(policy.fields).toEqual(
      expect.arrayContaining([
        'estimatedPortions',
        'estimatedAmount',
        'distributionAt',
        'location',
      ]),
    );
  });

  it('khoá cấu hình số đơn vị nhận và số điểm tiếp nhận', () => {
    expect(CharityMaxBeneficiariesConfigKey).toBe(
      'charity.max_beneficiaries_per_campaign',
    );
    expect(CharityMaxIntakeLocationsConfigKey).toBe(
      'charity.max_intake_locations',
    );
    expect(DefaultCharityMaxBeneficiaries).toBe(20);
    expect(DefaultCharityMaxIntakeLocations).toBe(10);
    expect(normalizeMaxBeneficiaries(5)).toBe(5);
    expect(normalizeMaxBeneficiaries('5')).toBe(20);
    expect(normalizeMaxBeneficiaries(0)).toBe(20);
    expect(normalizeMaxIntakeLocations(3)).toBe(3);
    expect(normalizeMaxIntakeLocations(-1)).toBe(10);
  });
});
