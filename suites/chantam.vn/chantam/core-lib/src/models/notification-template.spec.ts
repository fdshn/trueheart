import {
  IntentionallyEmptyNotificationGroups,
  NotificationGroupOf,
  NotificationGroups,
  NotificationTypes,
} from '../consts';
import {
  renderNotificationTemplate,
  templatePlaceholders,
} from './notification-template';

describe('renderNotificationTemplate', () => {
  it('thay chỗ trống bằng giá trị', () => {
    expect(
      renderNotificationTemplate('Chào {ten}, bạn có {so} tin mới', {
        ten: 'An',
        so: '3',
      }),
    ).toBe('Chào An, bạn có 3 tin mới');
  });

  it('thiếu giá trị thì GIỮ NGUYÊN chỗ trống, không xoá đi', () => {
    // Một thông báo hiện ra {ten} là lỗi nhìn thấy ngay; một câu cụt giữa
    // chừng trông như nội dung thật và sống sót rất lâu.
    expect(renderNotificationTemplate('Chào {ten} nhé', {})).toBe(
      'Chào {ten} nhé',
    );
  });

  it('không thay đệ quy — giá trị chứa chỗ trống không bị thay tiếp', () => {
    // Nếu không, một biến do người dùng nhập có thể kéo theo biến khác.
    expect(renderNotificationTemplate('{a}', { a: '{b}', b: 'bí mật' })).toBe(
      '{b}',
    );
  });

  it('thay mọi lần xuất hiện của cùng một chỗ trống', () => {
    expect(renderNotificationTemplate('{x} và {x}', { x: 'A' })).toBe('A và A');
  });

  it('bỏ qua thứ trông giống chỗ trống nhưng không phải', () => {
    expect(renderNotificationTemplate('giá {100.000}đ', { x: 'A' })).toBe(
      'giá {100.000}đ',
    );
  });

  it('mẫu không có chỗ trống thì trả nguyên văn', () => {
    expect(renderNotificationTemplate('Bạn có tin nhắn mới')).toBe(
      'Bạn có tin nhắn mới',
    );
  });

  it('giá trị rỗng vẫn là một giá trị, không phải thiếu', () => {
    expect(renderNotificationTemplate('A{x}B', { x: '' })).toBe('AB');
  });
});

describe('templatePlaceholders', () => {
  it('liệt kê chỗ trống, không trùng lặp', () => {
    expect(templatePlaceholders('{a} {b} {a}')).toEqual(['a', 'b']);
  });

  it('mẫu không có chỗ trống trả mảng rỗng', () => {
    expect(templatePlaceholders('không có gì')).toEqual([]);
  });
});

describe('phân loại tám nhóm (BR-NOTI-01)', () => {
  const groups = Object.values(NotificationGroups);
  const types = Object.values(NotificationTypes);

  it('đúng TÁM nhóm — không phải bốn như tới 10/10', () => {
    expect(groups).toHaveLength(8);
  });

  it('mọi loại thông báo đều được xếp nhóm', () => {
    // `NotificationGroupOf` là `Record<NotificationTypes, ...>` nên TypeScript đã
    // canh chuyện này lúc biên dịch. Phép kiểm vẫn cần vì nó đọc giá trị LÚC CHẠY:
    // một khoá viết sai thành chuỗi tự do, hay một `as never` nhét vào, đều lọt qua
    // trình biên dịch mà rơi ra ở đây.
    const unmapped = types.filter(
      (type) => NotificationGroupOf[type] === undefined,
    );
    expect(unmapped).toEqual([]);
  });

  it('mọi nhóm được xếp đều là nhóm CÓ THẬT', () => {
    const known = new Set<string>(groups);
    const strays = types
      .map((type) => NotificationGroupOf[type])
      .filter((group) => !known.has(group));
    expect(strays).toEqual([]);
  });

  it('nhóm rỗng phải được KHAI, không được để ai đoán', () => {
    // Một nhóm không có loại nào là một công tắc chưa điều khiển gì — repo này coi
    // "cái núm không làm gì" là lỗi. Nên nhóm rỗng chỉ được tồn tại khi có tên
    // trong `IntentionallyEmptyNotificationGroups` kèm lý do ở docblock.
    //
    // `GUIDE` rỗng vì chưa có loại thông báo hướng dẫn nào; SRS đặt tên nhóm này
    // nên nó tồn tại để nhận chúng khi ra đời, không phải để làm tròn số tám.
    const populated = new Set(types.map((type) => NotificationGroupOf[type]));
    const empty = groups.filter((group) => !populated.has(group));
    expect([...empty].sort()).toEqual(
      [...IntentionallyEmptyNotificationGroups].sort(),
    );
  });

  it('nhóm đã khai là rỗng thì phải THẬT SỰ rỗng', () => {
    // Chiều ngược lại: một nhóm nằm trong danh sách nợ mà nay đã có loại thì phải
    // RA khỏi danh sách. Thiếu phép kiểm này thì danh sách chỉ dài ra và không ai
    // dọn — đúng bài học của `KnownUnreadKeys` ở sổ cấu hình.
    const populated = new Set(types.map((type) => NotificationGroupOf[type]));
    const wronglyDeclared = IntentionallyEmptyNotificationGroups.filter(
      (group) => populated.has(group),
    );
    expect(wronglyDeclared).toEqual([]);
  });

  it('không nhóm nào gom quá nửa số loại', () => {
    // Nhóm cũ `SYSTEM` gom 10 trong 25 loại, và đó là lý do tám nhóm ra đời: một
    // công tắc tắt mười thứ khác nhau thì người dùng không tắt được thứ họ muốn mà
    // không mất thứ họ cần. Ngưỡng nửa là lỏng có chủ ý — nó bắt việc tái gom, chứ
    // không áp một phân phối đều mà nghiệp vụ không đòi.
    const counts = new Map<string, number>();
    for (const type of types) {
      const group = NotificationGroupOf[type];
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    const hogs = [...counts.entries()].filter(
      ([, count]) => count > types.length / 2,
    );
    expect(hogs).toEqual([]);
  });
});
