import {
  DefaultGroupRadiusKm,
  GroupRadiusColumnBoundsKm,
  MaxGroupRadiusKm,
  MinGroupRadiusKm,
} from '../consts';
import { resolveGroupRadiusKm } from './group';

/** Giá trị đang seed trong `system_configs`, đơn vị mét. */
const SeededConfig = {
  defaultMeters: 10_000,
  minMeters: 1_000,
  maxMeters: 50_000,
};

describe('resolveGroupRadiusKm', () => {
  it('đọc MÉT từ cấu hình và trả KM', () => {
    // 10.000 m phải ra 10 km. Đây là phép kiểm gốc: nếu hàm đọc con số như km thì
    // nó sẽ ra 50 (bị kẹp ở max), tức gấp 5 lần bán kính và 25 lần diện tích.
    expect(resolveGroupRadiusKm(SeededConfig)).toBe(10);
  });

  it('kẹp theo cận ĐÃ ĐỔI sang km, không so mét với km', () => {
    // Bẫy cũ: cận là km (1 và 50) nhưng giá trị vào là mét. `min(50, max(1, 10000))`
    // ra 50. Nay cả ba đi qua cùng một phép đổi nên không còn so lệch đơn vị.
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 90_000,
        minMeters: 1_000,
        maxMeters: 50_000,
      }),
    ).toBe(50);
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 200,
        minMeters: 1_000,
        maxMeters: 50_000,
      }),
    ).toBe(1);
  });

  it('cấu hình thiếu thì rơi về hằng dự phòng, không về 0', () => {
    // 0 km nghĩa là vùng rỗng: không sự kiện nào đủ điều kiện địa lý, tức cả cơ chế
    // affiliate tắt lặng lẽ. Thiếu cấu hình phải ra mặc định dùng được.
    expect(
      resolveGroupRadiusKm({
        defaultMeters: null,
        minMeters: undefined,
        maxMeters: null,
      }),
    ).toBe(DefaultGroupRadiusKm);
  });

  it('giá trị rác cũng rơi về dự phòng chứ không ném', () => {
    // Cấu hình gõ nhầm là lỗi cấu hình, không phải lỗi của người đang tạo nhóm —
    // ném ở đây là chặn họ tạo nhóm vì một ô Admin điền sai.
    for (const rác of ['mười km', {}, [], NaN, -5, 0])
      expect(
        resolveGroupRadiusKm({
          defaultMeters: rác,
          minMeters: SeededConfig.minMeters,
          maxMeters: SeededConfig.maxMeters,
        }),
      ).toBe(DefaultGroupRadiusKm);
  });

  it('min lớn hơn max thì ưu tiên max, không chặn tạo nhóm', () => {
    // Một cấu hình vô nghĩa không được biến thành "không ai tạo được nhóm".
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 10_000,
        minMeters: 40_000,
        maxMeters: 5_000,
      }),
    ).toBe(40);
  });

  it('làm tròn GẦN NHẤT, không làm tròn xuống', () => {
    // 1.900 m làm tròn xuống ra 1 km — vùng hẹp hơn nửa so với cấu hình. Cột là int
    // km nên độ phân giải 1 km là giới hạn thật, nhưng sai hướng thì không cần.
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 1_900,
        minMeters: 1_000,
        maxMeters: 50_000,
      }),
    ).toBe(2);
  });

  it('không bao giờ trả dưới 1 km', () => {
    // Kể cả khi cả ba khoá đều nhỏ hơn 1.000 m.
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 100,
        minMeters: 100,
        maxMeters: 100,
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('KHÔNG BAO GIỜ vượt cận của cột, dù cấu hình nói gì', () => {
    // Đây là lỗ tôi tự mở khi nối cấu hình động vào: cột có
    // `CHK_groups_radius CHECK (radius_km BETWEEN 1 AND 50)`, nên 60 km làm
    // database từ chối ghi → 500 ở MỌI lượt tạo nhóm. Trước đó cận là hằng
    // `MaxGroupRadiusKm` nên không giá trị nào vượt được.
    expect(
      resolveGroupRadiusKm({
        defaultMeters: 60_000,
        minMeters: 1_000,
        maxMeters: 80_000,
      }),
    ).toBe(GroupRadiusColumnBoundsKm.max);

    // Kể cả khi cả ba khoá đều ngoài khoảng.
    for (const meters of [80_000, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      const km = resolveGroupRadiusKm({
        defaultMeters: meters,
        minMeters: meters,
        maxMeters: meters,
      });
      expect(km).toBeLessThanOrEqual(GroupRadiusColumnBoundsKm.max);
      expect(km).toBeGreaterThanOrEqual(GroupRadiusColumnBoundsKm.min);
    }
  });

  it('cận của cột khớp CHK_groups_radius', () => {
    // Hằng này là bản sao của một ràng buộc database. Lệch nhau thì hoặc hàm
    // chặn oan một giá trị hợp lệ, hoặc để lọt một giá trị làm sập.
    expect(GroupRadiusColumnBoundsKm).toEqual({ min: 1, max: 50 });
  });

  it('hằng dự phòng nằm trong khoảng của chính nó', () => {
    // Một bộ hằng tự mâu thuẫn sẽ làm mọi nhánh fallback ra số vô nghĩa.
    expect(DefaultGroupRadiusKm).toBeGreaterThanOrEqual(MinGroupRadiusKm);
    expect(DefaultGroupRadiusKm).toBeLessThanOrEqual(MaxGroupRadiusKm);
  });
});
