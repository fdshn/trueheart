/**
 * Số liệu điều hành (F59).
 *
 * Sáu khối đầu đúng theo những gì `docs/diagram/16-admin.md` §Chỗ cần soát nêu: người
 * dùng mới, bài theo danh mục, giao dịch hoàn tất, phân bổ hạng, dung lượng. Kèm khối
 * hàng đợi đang tồn — con số duy nhất trong cả bảng mà Admin phải LÀM GÌ ĐÓ với nó, không
 * chỉ để biết.
 *
 * ## Bốn khối thêm 02/10, và vì sao đúng bốn cái đó
 *
 * UC-ADM-01 liệt kê năm thứ: *"người dùng mới, bài đăng theo danh mục, **tỷ lệ giao dịch
 * hoàn tất**, dung lượng/tệp lưu trữ và phân bổ Rank/**Điểm Cống hiến**"*. Hai cái in đậm
 * còn thiếu: tỷ lệ chỉ có số thô chưa có tỷ lệ, và phân bổ điểm không có gì.
 *
 * Dòng Analytics của bảng tổng kết Group/Affiliate đòi thêm: *"KPI số Group, member mới,
 * event eligible/ineligible geo, affiliate point, fraud flag, giver accuracy"*.
 *
 * Gộp lại thành `points`, `groups`, `affiliate`, `accuracy`. **Điểm danh KHÔNG có ở đây**
 * — không dòng nào trong đặc tả đòi nó làm KPI, và thêm một khối không ai yêu cầu là tự
 * đặt việc cho mình rồi gọi đó là hoàn thành đặc tả.
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
    /**
     * Tỷ lệ hoàn tất trong các giao dịch ĐÃ KẾT THÚC, phần trăm làm tròn một chữ số.
     *
     * Mẫu số là `completed + cancelled`, KHÔNG phải tổng mọi giao dịch: một giao dịch
     * đang giao chưa thành hay thất bại, đưa nó vào mẫu số là kéo tỷ lệ xuống bằng những
     * ca chưa có kết luận.
     *
     * `null` khi chưa có giao dịch nào kết thúc. Trả `0` ở đó là nói sai: 0% nghĩa là
     * "thử rồi và trượt hết", còn `null` nghĩa là "chưa có gì để đo".
     */
    readonly completionRatePercent: number | null;
    /**
     * Mẫu số của tỷ lệ trên.
     *
     * Trả kèm vì một tỷ lệ trơ không kiểm được: 50% của hai giao dịch và 50% của hai
     * nghìn là hai câu chuyện khác nhau, và người đọc dashboard phải phân biệt được.
     */
    readonly completionDenominator: number;
  };
  /**
   * Phân bổ Điểm Cống hiến (UC-ADM-01).
   *
   * `byRankThreshold` cắt theo đúng `rank_tiers.threshold_points` đang hiệu lực, không
   * theo mốc tự nghĩ ra. Nhờ vậy nó so sánh được trực tiếp với `users.byRank`, và khoảng
   * lệch giữa hai bảng chính là thứ đáng xem: `byRank` là hạng hệ thống ĐANG CẤP QUYỀN
   * theo, `byRankThreshold` là hạng mà số dư nói lẽ ra phải là. Hai cái lệch nhau nghĩa là
   * có người đang giữ quyền của một hạng họ không còn đủ điểm, hoặc ngược lại.
   */
  readonly points: {
    /** Tổng số dư đang lưu hành — số điểm hệ thống đang nợ người dùng. */
    readonly totalBalance: number;
    readonly issuedInWindow: number;
    readonly spentInWindow: number;
    readonly byRankThreshold: readonly {
      readonly rank: string;
      readonly thresholdPoints: number;
      readonly users: number;
    }[];
  };
  readonly groups: {
    readonly total: number;
    readonly newInWindow: number;
    readonly members: number;
    readonly newMembersInWindow: number;
  };
  /**
   * Affiliate nhóm.
   *
   * `policyPublished` là trường quan trọng nhất của khối này. Bộ máy affiliate ship ở
   * trạng thái TẮT, nên mọi con số dưới nó là 0 — và `0` không phân biệt được "chưa ai
   * bật" với "đã bật mà không có hoạt động nào". Thiếu cờ này thì Admin đọc một bảng toàn
   * số 0 rồi đi tìm lỗi ở chỗ không có lỗi.
   */
  readonly affiliate: {
    readonly policyPublished: boolean;
    readonly policyEnabled: boolean;
    readonly eventsEligible: number;
    readonly eventsRejectedGeo: number;
    readonly eventsNoLocation: number;
    readonly pointsAwarded: number;
    readonly pointsReversed: number;
  };
  /**
   * Giver Accuracy (dòng Analytics: *"fraud flag, giver accuracy"*).
   *
   * `thresholdPercent` trả kèm vì không có nó thì `belowThreshold` là một con số không
   * đọc được — dưới bao nhiêu? Và ngưỡng đó Admin đổi được qua `accuracy.giver`, nên
   * không thể để người đọc đoán.
   */
  readonly accuracy: {
    readonly thresholdPercent: number;
    readonly minSamples: number;
    /** Số người đã đủ mẫu để tính — dưới mức đó thì phần trăm không có nghĩa. */
    readonly measured: number;
    readonly belowThreshold: number;
    /** Đã gắn cờ chờ Admin xem lại. Đây là con số phải LÀM GÌ ĐÓ với nó. */
    readonly reviewRequired: number;
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
