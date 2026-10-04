import { PostTypes } from '../consts/post-types';
import {
  MaxClassifiedPrice,
  classifiedDiscountPercent,
  classifiedDiscountPercentOfDetails,
  classifiedPricingGaps,
  isClassifiedPrice,
  isClassifiedPricingType,
} from './classified';

describe('isClassifiedPricingType', () => {
  it('chỉ CLASSIFIED mang giá', () => {
    expect(isClassifiedPricingType(PostTypes.CLASSIFIED)).toBe(true);
    for (const type of [
      PostTypes.OFFER,
      PostTypes.WANTED,
      PostTypes.CHARITY,
      PostTypes.MERIT,
    ])
      expect(isClassifiedPricingType(type)).toBe(false);
  });
});

describe('isClassifiedPrice', () => {
  it('nhận 0 và trần', () => {
    expect(isClassifiedPrice(0)).toBe(true);
    expect(isClassifiedPrice(MaxClassifiedPrice)).toBe(true);
  });

  it('từ chối âm, lẻ, vượt trần, chuỗi', () => {
    for (const bad of [-1, 1.5, MaxClassifiedPrice + 1, '500000', null])
      expect(isClassifiedPrice(bad)).toBe(false);
  });
});

describe('classifiedDiscountPercent', () => {
  it('tính đúng mức giảm', () => {
    expect(
      classifiedDiscountPercent({ marketPrice: 3_000_000, price: 500_000 }),
    ).toBe(83);
  });

  it('bán đúng giá thị trường là 0%', () => {
    expect(
      classifiedDiscountPercent({ marketPrice: 500_000, price: 500_000 }),
    ).toBe(0);
  });

  it('cho 100% khi tặng không (giá 0)', () => {
    expect(classifiedDiscountPercent({ marketPrice: 500_000, price: 0 })).toBe(
      100,
    );
  });

  it('giá bán CAO hơn giá tham khảo ra số ÂM, không bị kẹp về 0', () => {
    // CHỐT-05: hệ thống không ép mức giảm tối thiểu. Kẹp về 0 ở đây là âm thầm
    // ép mức giảm tối thiểu bằng 0, và che mất một tin rao đáng để người mua
    // cân nhắc.
    expect(
      classifiedDiscountPercent({ marketPrice: 400_000, price: 500_000 }),
    ).toBe(-25);
  });

  it('không có giá tham khảo ra null, KHÔNG ra 0', () => {
    // `0` đọc ra "giảm 0%", tức một lời khẳng định về giá mà người bán chưa nói.
    for (const market of [undefined, null, 0, '', 'abc', -1])
      expect(
        classifiedDiscountPercent({ marketPrice: market, price: 500_000 }),
      ).toBeNull();
  });

  it('giá bán hỏng ra null', () => {
    for (const price of [undefined, null, 'abc', -1])
      expect(
        classifiedDiscountPercent({ marketPrice: 500_000, price }),
      ).toBeNull();
  });

  it('đọc được số về dạng chuỗi từ jsonb', () => {
    // `details` là `jsonb`; qua node-pg một số có thể về dạng chuỗi. Hàm phải
    // không vỡ ở đó, nếu không thì % giảm biến mất đúng lúc dữ liệu vẫn đủ.
    expect(
      classifiedDiscountPercent({ marketPrice: '3000000', price: '500000' }),
    ).toBe(83);
  });

  it('làm tròn về số nguyên', () => {
    expect(classifiedDiscountPercent({ marketPrice: 3, price: 1 })).toBe(67);
  });
});

describe('classifiedDiscountPercentOfDetails', () => {
  it('đọc thẳng từ details', () => {
    expect(
      classifiedDiscountPercentOfDetails({
        price: 500_000,
        marketPrice: 3_000_000,
        condition: 'GOOD',
      }),
    ).toBe(83);
  });

  it('details null hoặc thiếu khoá ra null, không ném', () => {
    expect(classifiedDiscountPercentOfDetails(null)).toBeNull();
    expect(classifiedDiscountPercentOfDetails(undefined)).toBeNull();
    expect(classifiedDiscountPercentOfDetails({})).toBeNull();
    expect(classifiedDiscountPercentOfDetails({ price: 500_000 })).toBeNull();
  });

  it('marketPrice null (chưa khai) ra null', () => {
    expect(
      classifiedDiscountPercentOfDetails({ price: 500_000, marketPrice: null }),
    ).toBeNull();
  });
});

describe('classifiedPricingGaps', () => {
  it('giá hợp lệ không có khoảng trống', () => {
    expect(
      classifiedPricingGaps({ price: 500_000, marketPrice: 3_000_000 }),
    ).toEqual([]);
  });

  it('KHÔNG đòi marketPrice', () => {
    // CHỐT-05: người bán không biết giá thị trường thì để trống.
    expect(
      classifiedPricingGaps({ price: 500_000, marketPrice: undefined }),
    ).toEqual([]);
    expect(
      classifiedPricingGaps({ price: 500_000, marketPrice: null }),
    ).toEqual([]);
  });

  it('KHÔNG đòi marketPrice lớn hơn price', () => {
    // Chặn ở đây là ép một mức giảm tối thiểu bằng 0 — đúng thứ CHỐT-05 nói
    // hệ thống không làm.
    expect(
      classifiedPricingGaps({ price: 500_000, marketPrice: 400_000 }),
    ).toEqual([]);
  });

  it('bắt giá bán sai kiểu', () => {
    expect(
      classifiedPricingGaps({ price: -1, marketPrice: undefined }),
    ).toHaveLength(1);
    expect(
      classifiedPricingGaps({ price: undefined, marketPrice: undefined }),
    ).toHaveLength(1);
  });

  it('bắt giá tham khảo sai kiểu khi CÓ gửi', () => {
    expect(
      classifiedPricingGaps({ price: 500_000, marketPrice: 1.5 }),
    ).toHaveLength(1);
    expect(
      classifiedPricingGaps({
        price: 500_000,
        marketPrice: MaxClassifiedPrice + 1,
      }),
    ).toHaveLength(1);
  });
});
