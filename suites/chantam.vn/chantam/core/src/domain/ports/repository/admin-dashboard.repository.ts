/**
 * Số liệu điều hành (F59).
 *
 * Năm khối đúng theo những gì `docs/diagram/16-admin.md` §Chỗ cần soát nêu: người
 * dùng mới, bài theo danh mục, giao dịch hoàn tất, phân bổ hạng, dung lượng. Kèm
 * khối thứ sáu — hàng đợi đang tồn — vì đó là con số duy nhất trong cả bảng mà Admin
 * phải LÀM GÌ ĐÓ với nó, không chỉ để biết.
 */
export interface IAdminDashboard {
  /** Cửa sổ thời gian cho những con số "trong kỳ". */
  readonly windowDays: number;
  readonly users: {
    readonly total: number;
    readonly newInWindow: number;
    /**
     * Số người còn ở VIEWER.
     *
     * Đây là con số đo PHỄU onboarding: VIEWER nghĩa là chưa hoàn tất, và chưa hoàn
     * tất thì không đăng được bài. Tỷ lệ này cao nghĩa là người ta đến rồi mắc ở
     * đâu đó trên đường vào.
     */
    readonly viewers: number;
    readonly byRank: readonly { rank: string; total: number }[];
  };
  readonly posts: {
    readonly published: number;
    readonly reserved: number;
    readonly completed: number;
    readonly byCategory: readonly { category: string; total: number }[];
  };
  readonly transactions: {
    readonly live: number;
    readonly completed: number;
    readonly completedInWindow: number;
    readonly cancelled: number;
  };
  /**
   * Dung lượng tính bằng SỐ OBJECT, không phải byte.
   *
   * Không bảng nào lưu kích thước — `post_media` có `r2_key`,
   * `chat_message_media` có `storage_key`, và hết. Đo byte thật đòi gọi ra storage
   * cho từng object. Trả số object và gọi nó là số object, thay vì quy đổi bằng một
   * kích thước trung bình bịa ra.
   */
  readonly media: {
    readonly postObjects: number;
    readonly chatObjects: number;
  };
  readonly queues: {
    readonly openReports: number;
    readonly pendingComments: number;
  };
}
