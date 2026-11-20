import {
  charitySubmitRequirementGaps,
  deriveAcceptedContributionTypes,
  normalizeContributionTypes,
} from './charity-intake';

describe('điều kiện tiếp nhận đóng góp chiến dịch', () => {
  const zero = {
    openMaterialNeeds: 0,
    openFundingNeeds: 0,
    openSupportNeeds: 0,
    liveBankAccounts: 0,
  };

  it('không bật loại nào thì không thiếu gì', () => {
    expect(charitySubmitRequirementGaps([], zero)).toEqual([]);
  });

  it('bật MATERIAL mà không có nhu cầu mở thì báo thiếu nhu cầu hiện vật', () => {
    expect(charitySubmitRequirementGaps(['MATERIAL'], zero)).toEqual([
      'MATERIAL: chưa có nhu cầu hiện vật đang mở',
    ]);
  });

  it('bật MONEY có nhu cầu tiền nhưng không có tài khoản thì báo thiếu tài khoản', () => {
    expect(
      charitySubmitRequirementGaps(['MONEY'], {
        ...zero,
        openFundingNeeds: 1,
      }),
    ).toEqual(['MONEY: chưa có tài khoản nhận đang hiệu lực']);
  });

  it('bật MONEY thiếu cả nhu cầu tiền và tài khoản thì báo cả hai', () => {
    expect(charitySubmitRequirementGaps(['MONEY'], zero)).toEqual([
      'MONEY: chưa có nhu cầu tiền đang mở',
      'MONEY: chưa có tài khoản nhận đang hiệu lực',
    ]);
  });

  it('bật SERVICE mà không có nhu cầu dịch vụ mở thì báo thiếu', () => {
    expect(charitySubmitRequirementGaps(['SERVICE'], zero)).toEqual([
      'SERVICE: chưa có nhu cầu dịch vụ đang mở',
    ]);
  });

  it('suy loại tiếp nhận theo các nhóm nhu cầu không rỗng ở thứ tự chuẩn', () => {
    expect(
      deriveAcceptedContributionTypes({
        materialNeeds: 1,
        fundingNeeds: 0,
        supportNeeds: 2,
      }),
    ).toEqual(['MATERIAL', 'SERVICE']);
  });

  it('chuẩn hoá loại tiếp nhận bằng cách bỏ trùng và theo thứ tự chuẩn', () => {
    expect(
      normalizeContributionTypes(['SERVICE', 'MATERIAL', 'SERVICE']),
    ).toEqual(['MATERIAL', 'SERVICE']);
  });
});
