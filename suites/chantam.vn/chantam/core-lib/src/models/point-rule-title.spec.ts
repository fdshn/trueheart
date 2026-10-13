import { PointRuleTitles, pointRuleTitle } from './point-rule-title';

describe('pointRuleTitle', () => {
  it('mã đã biết ra tiêu đề tiếng Việt', () => {
    expect(pointRuleTitle('PHONE_VERIFIED_FIRST_TIME')).toBe(
      'Xác minh số điện thoại lần đầu',
    );
    expect(pointRuleTitle('GIFT_COMPLETED_GIVER')).toBe('Tặng quà thành công');
    expect(pointRuleTitle('REVERSAL')).toBe('Hoàn điểm');
  });

  it('mã lạ trả NGUYÊN mã: thấy một chuỗi lạ còn hơn một tiêu đề sai', () => {
    expect(pointRuleTitle('SOME_FUTURE_RULE')).toBe('SOME_FUTURE_RULE');
  });

  it('mọi tiêu đề đều có chữ, không có ô bỏ trống', () => {
    for (const [code, title] of Object.entries(PointRuleTitles))
      expect({ code, title: title.trim().length > 0 }).toEqual({
        code,
        title: true,
      });
  });
});
