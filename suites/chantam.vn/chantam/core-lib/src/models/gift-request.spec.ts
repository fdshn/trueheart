import { PostTypes } from '../consts';
import { giftTransactionRoles } from './gift-request';

const Author = 'author-1';
const Requester = 'requester-1';

describe('giftTransactionRoles', () => {
  it('bài Muốn Tặng: tác giả CHO, người phản hồi NHẬN', () => {
    expect(
      giftTransactionRoles({
        postType: PostTypes.OFFER,
        postAuthorId: Author,
        requesterId: Requester,
      }),
    ).toEqual({ giverId: Author, receiverId: Requester });
  });

  it('bài Muốn Nhận: ĐẢO lại — tác giả NHẬN, người phản hồi CHO', () => {
    // Đây là cả nội dung của hàm này. Một lời tặng cho bài `WANTED` là một hàng
    // `gift_requests` mà `requester_id` là người sẽ ĐƯA món đồ; tác giả bài là
    // người đang cần nó.
    expect(
      giftTransactionRoles({
        postType: PostTypes.WANTED,
        postAuthorId: Author,
        requesterId: Requester,
      }),
    ).toEqual({ giverId: Requester, receiverId: Author });
  });

  it('hai vai KHÔNG bao giờ trùng nhau', () => {
    // `gift_transactions` có `CHECK (giver_id <> receiver_id)`; trả về hai giá trị
    // bằng nhau sẽ làm câu INSERT đổ ở tầng database, và lỗi hiện ra như một lỗi
    // ràng buộc chứ không phải một lỗi về vai.
    for (const postType of Object.values(PostTypes)) {
      const roles = giftTransactionRoles({
        postType,
        postAuthorId: Author,
        requesterId: Requester,
      });
      expect(roles.giverId).not.toBe(roles.receiverId);
    }
  });

  it.each(Object.values(PostTypes).filter((type) => type !== PostTypes.WANTED))(
    'loại %s theo lối OFFER — chỉ WANTED mới đảo',
    (postType) => {
      // Mặc định phải là lối `OFFER`, không phải một bảng tra liệt kê từng loại:
      // thêm một loại bài mới mà quên khai sẽ rơi vào nhánh nào đó, và nhánh an
      // toàn là nhánh mà tác giả bài là người cho — đúng như `CHARITY` và `MERIT`
      // đang hành xử hôm nay.
      expect(
        giftTransactionRoles({
          postType,
          postAuthorId: Author,
          requesterId: Requester,
        }),
      ).toEqual({ giverId: Author, receiverId: Requester });
    },
  );

  it('không đổi thứ tự khoá — nơi gọi trải thẳng vào câu INSERT', () => {
    expect(
      Object.keys(
        giftTransactionRoles({
          postType: PostTypes.WANTED,
          postAuthorId: Author,
          requesterId: Requester,
        }),
      ),
    ).toEqual(['giverId', 'receiverId']);
  });
});
