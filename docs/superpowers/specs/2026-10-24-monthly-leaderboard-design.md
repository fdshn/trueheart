# Bảng thành tích tháng — thiết kế

Ngày: 24/10/2026 · Phạm vi: backend `suites/chantam.vn/chantam/core` (+ hằng số ở `core-lib`)

## 1. Ý định

Chủ dự án muốn một bảng thành tích hằng tháng để **kích cầu ba hành vi**:

1. **Cho đồ**
2. **Đóng góp từ thiện**
3. **Tham gia đều đặn**

Thành công là có nhiều người làm ba việc này thường xuyên hơn, chứ không chỉ một nhóm nhỏ
đứng đầu. Vì vậy mỗi kiểu người phải có cửa lên bảng, và con số phải khó "cày".

## 2. Mục tiêu, phi mục tiêu, phản mục tiêu

**Mục tiêu**
- Ba bảng riêng trong cùng một màn "Bảng thành tích tháng": **Người cho**, **Tấm lòng từ thiện**,
  **Chuyên cần**.
- Bảng tháng hiện tại xem trực tiếp, tức số liệu cập nhật liên tục. Các tháng đã qua được chốt sổ
  và xem lại được.
- Người dùng xem được **vị trí của mình** trên cả ba bảng.
- Top 3 mỗi bảng nhận **huy hiệu trên hồ sơ**, có hạn.
- Người dùng chọn được **ẩn tên** trên bảng.
- Admin xem bảng với danh tính thật, loại người gian lận, gỡ huy hiệu, và cấu hình các thông số.

**Phi mục tiêu (không làm ở bản này)**
- Không cộng điểm cống hiến, không quà thật. Phần thưởng chỉ là huy hiệu.
- Không có bảng gộp điểm chung, không lọc theo khu vực.
- Không có bảng cho tụng kinh, giới thiệu bạn, bình luận hay cảm xúc.
- Không làm mục "Bảng Vàng Cống Hiến" (`CAMPAIGN_TOP_GIVERS`) trên trang chủ. Có thể dựng sau
  trên dữ liệu của tính năng này.

**Phản mục tiêu (chạy được mà vẫn là thất bại)**
- **Xếp theo tiền** hay theo giá trị món đồ, khiến bảng thành cuộc so ai giàu hơn.
- Bảng leo được bằng bình luận, cảm xúc, hoặc bằng việc chưa hoàn tất thật.
- Tên thật, username, avatar hay `userId` của người chọn ẩn danh **lọt ra ở bất kỳ response công
  khai nào**, kể cả trong id hay trường phụ.
- Kết quả một tháng đã chốt tự thay đổi về sau.

## 3. Ba bảng — đếm gì

Mọi ranh giới tháng tính theo **giờ Việt Nam** (`BusinessTimeZone` = `Asia/Ho_Chi_Minh`). Một
tháng là `[00:00 ngày 1, 00:00 ngày 1 tháng sau)` giờ Việt Nam.

Bảng đếm **số lần**, không đếm điểm. Chủ dự án đã chọn hướng này. Cách đếm số lần cũng không phụ
thuộc thang điểm Admin chỉnh. Ngoài ra, luật điểm `CHARITY_CONTRIBUTION_COMPLETED` hiện đang
**TẮT**, nên lấy từ `point_ledger` sẽ ra 0. Vì vậy **mọi bảng đều đếm từ bảng nghiệp vụ, không
lấy từ `point_ledger`**.

| Bảng (mã) | Một lần được tính khi | Nguồn | Mốc thời gian dùng để xếp vào tháng |
| --- | --- | --- | --- |
| Người cho (`GIVERS`) | một lượt trao ở trạng thái `COMPLETED` mà user là **người tặng** | `gift_transactions` (`giver_id`, `status`, `completed_at`) | `completed_at` |
| Tấm lòng từ thiện (`CHARITY`) | một lượt giao nhận từ thiện `COMPLETED` **có ít nhất một món thực nhận** | `campaign_deliveries` → `campaign_contributions.contributor_id` (và `campaign_delivery_items` cho điều kiện "thực nhận") | `campaign_deliveries.completed_at` |
| Chuyên cần (`CONSISTENCY`) | một ngày điểm danh **thật** (`kind = 'NORMAL'`) | `check_in_entries` (`user_id`, `policy_date`, `kind`) | `policy_date` (kiểu `date`, đã là ngày Việt Nam) |

Ghi chú:
- **Người cho** tính cả bài Muốn Tặng (tác giả là người tặng) lẫn bài Muốn Nhận (người phản hồi là
  người tặng). Cả hai trường hợp đều ghi ở `giver_id`.
- **Từ thiện** dùng đúng điều kiện mà luật điểm `CHARITY_CONTRIBUTION_COMPLETED` đang dùng: mỗi
  đề nghị đóng góp chỉ được tính **một lần**, và chỉ khi thực nhận được ít nhất một thứ. Đếm theo
  số lượt, không theo số tiền hay số lượng món.
- **Chuyên cần — quyết định của tôi:** ngày bù (`kind = 'REPAIR'`) **không tính**. Ngày bù là để
  giữ chuỗi cho một ngày đã lỡ. Nếu tính vào bảng, người hay lỡ ngày rồi bù sẽ ngang người vào
  đều. Tối đa 31.

**Xếp hạng:** đếm nhiều hơn thì đứng trên. Hai người bằng nhau thì ai **đạt con số đó sớm hơn**
đứng trên, tức là so mốc thời gian của lần thứ N, với N là con số của họ. Nếu vẫn bằng thì so
`users.global_id` để thứ tự ổn định. Thứ hạng là dãy liền 1, 2, 3, … không có hạng đồng.

**Ai được lên bảng:** user `ACTIVE`, có con số **≥ ngưỡng sàn** của bảng đó, và **không bị Admin
loại** khỏi bảng đó trong tháng đó. Người đã xoá tài khoản hoặc bị khoá thì không hiện.

**Ngưỡng sàn** (Admin cấu hình, mặc định là quyết định của tôi): Người cho ≥ 1, Từ thiện ≥ 1,
Chuyên cần ≥ 10 ngày. Không có sàn thì tháng vắng người, ai điểm danh một ngày cũng thành top 3.

## 4. Tháng hiện tại và tháng đã chốt

- **Tháng hiện tại (`LIVE`):** tính khi được hỏi, từ bảng nghiệp vụ. Được phép cache ngắn, tối đa
  vài phút, cách làm do người xây chọn. Có thể dao động: một lượt trao bị mở lại, hay người dùng
  vừa đổi cài đặt ẩn danh, đều làm bảng đổi.
- **Chốt sổ (`CLOSED`):** một lệnh CLI `leaderboard:close-month`, theo đúng lối các job định kỳ
  hiện có trong `src/infrastructure/cli/` (`rank-evaluate.cli.ts`, `post-expire.cli.ts`…): cron
  bên ngoài gọi, không dùng `@nestjs/schedule`. Lịch là 00:05 ngày 1 giờ Việt Nam, chốt **tháng
  vừa qua**. Có tham số `--month=YYYY-MM` để chạy bù.
  - Lệnh phải **lặp lại được an toàn**. Chạy lần hai cho cùng tháng không đổi gì và không trao
    huy hiệu lần hai (ràng buộc UNIQUE ở database, không chỉ kiểm ở code).
  - Khi chốt, lệnh ghi một **bản lưu cố định** cho mỗi bảng. Bản lưu gồm mọi người đủ điều kiện,
    không chỉ top N, để "vị trí của tôi" ở tháng cũ vẫn trả lời được. Mỗi dòng có hạng, con số,
    và **cờ ẩn danh tại thời điểm chốt**.
  - Sau khi chốt, dữ liệu nghiệp vụ có đổi (lượt trao bị mở lại, đóng góp bị huỷ…) thì bản lưu
    **không đổi**.
  - Cùng lượt chốt sẽ trao huy hiệu (mục 5) và gửi thông báo cho người nhận.
- Tháng chưa chốt mà đã qua, tức job chưa chạy, vẫn trả `LIVE` cho tháng đó. Không có tháng nào
  "trống".

## 5. Huy hiệu

- **Ai nhận:** hạng 1, 2, 3 của mỗi bảng, mỗi tháng. Tối đa 9 huy hiệu một tháng.
- **Nội dung:** bảng + hạng + tháng, ví dụ "🥇 Người cho · Tháng 10/2026". Backend trả dữ liệu có
  cấu trúc (`board`, `rank`, `month`). Chữ và biểu tượng do mobile dựng.
- **Hạn:** hiện trên hồ sơ **3 tháng** kể từ lúc trao. Huy hiệu tháng 10, trao ngày 1/11, hiện đến
  hết 31/1. Số tháng Admin cấu hình được, mặc định 3. Hết hạn thì **thôi hiển thị nhưng không
  xoá**: vẫn nằm trong lịch sử của chính người dùng.
- Một người giữ top đều có thể đeo cùng lúc tối đa 3 tháng × 3 bảng = 9 huy hiệu.
- **Gỡ:** Admin gỡ được một huy hiệu nếu phát hiện gian lận, bắt buộc ghi lý do, và có ghi audit.
  Gỡ thì **người xếp sau không được đôn lên**, vì tháng đã chốt.
- **Thông báo:** lúc trao, gửi một thông báo loại mới (ví dụ `LEADERBOARD_BADGE_AWARDED`), nội dung
  kiểu "Bạn đứng thứ 2 bảng Chuyên cần tháng 10/2026". Phải khai đích điều hướng trong
  `NotificationTargetsByType` (`core-lib/src/consts/notification-targets.ts`). Đích là một loại
  đích mới, chẳng hạn bảng thành tích của tháng đó hoặc hồ sơ của tôi; cách thể hiện do người xây
  chọn. Nhớ nới `CHK_notifications_target` bằng migration và giữ guard spec
  `notification-target-guard.spec.ts` xanh.

## 6. Ẩn danh

- Mặc định ai cũng hiện tên. Người dùng có cài đặt **"Ẩn tên tôi trên bảng thành tích"**, lưu bền
  và sửa qua `PATCH /profile/me`.
- Bật ẩn danh thì trên bảng công khai, dòng của họ hiện "Người ẩn danh": **không** username, tên,
  avatar, rank, hay `userId`. Họ **vẫn chiếm đúng hạng**, vẫn thấy hạng của chính mình qua
  `/me`, và vẫn nhận huy hiệu.
- Theo mẫu đã có ở phần hồi hướng Diễn đàn: tên thật **không ra khỏi tầng repository**, câu SQL
  công khai không kéo nó về.
- Tháng đã chốt dùng cờ ẩn danh **lúc chốt**. Đổi cài đặt sau đó không làm lộ hay ẩn ngược tháng cũ.
  Đây là quyết định của tôi, để "kết quả đã chốt không đổi" giữ được trọn vẹn.
- Admin luôn thấy danh tính thật, chỉ trên route Admin.
- **Huy hiệu giành được lúc đang ẩn danh KHÔNG hiện trên hồ sơ công khai** (chủ dự án chốt
  24/10). Lý do: nếu hiện, người khác ghép "Người ẩn danh · hạng 2 · Chuyên cần · 10/2026" trên
  bảng với huy hiệu cùng nội dung trên hồ sơ là lộ danh tính. Dòng huy hiệu lưu cờ ẩn danh **lúc
  chốt**. `GET /profile/:username` chỉ trả huy hiệu có cờ đó bằng `false`. Còn `GET /profile/me` và
  `/profile/me/badges` trả đủ cho chính chủ, có đánh dấu huy hiệu nào chỉ mình thấy. Về sau
  người dùng tắt ẩn danh thì huy hiệu cũ **vẫn không hiện công khai**, vì tháng đó đã được công
  bố là ẩn danh. `test:leaderboard` phải canh đúng trường hợp này.

## 7. API

Tiền tố `/api/v1`. Các mã `board`: `GIVERS`, `CHARITY`, `CONSISTENCY`. `month` dạng `YYYY-MM`,
mặc định là tháng hiện tại theo giờ Việt Nam.

**Công khai / người dùng**

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/leaderboards/monthly` | Công khai | `?board=&month=&page=&pageSize=`. Trả `month`, `board`, `status` (`LIVE`/`CLOSED`), `closedAt`, danh sách `{ rank, count, isAnonymous, user: {username, fullName, avatarUrl, rank} \| null }`. Gọi kèm token thì thêm `me` là dòng của chính mình (hoặc `null`). |
| `GET` | `/leaderboards/monthly/me` | Bearer | `?month=`. Vị trí của tôi trên **cả ba** bảng: `rank` (hoặc `null` nếu chưa đủ sàn), `count`, ngưỡng sàn, và **khoảng cách** tới hạng 3 (ngưỡng huy hiệu) cùng tới người ngay trên. |
| `GET` | `/leaderboards/months` | Công khai | Các tháng đã chốt, mới nhất trước, để mobile dựng bộ chọn tháng. |
| `GET` | `/profile/:username` | (như hiện tại) | Thêm `badges[]`: huy hiệu **còn hạn, chưa bị gỡ**. |
| `GET` | `/profile/me` | Bearer | Thêm `badges[]` còn hạn và cờ `leaderboardAnonymous`. |
| `GET` | `/profile/me/badges` | Bearer | Toàn bộ huy hiệu của tôi, gồm cả đã hết hạn và đã bị gỡ (có trạng thái). |
| `PATCH` | `/profile/me` | Bearer | Nhận thêm `leaderboardAnonymous: boolean`. |

**Admin** (quyền mới, ví dụ `leaderboard.read`, `leaderboard.moderate`, seed cho `SUPER_ADMIN`
theo cách các quyền hiện có đang seed)

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/admin/leaderboards/monthly` | `leaderboard.read` | Như route công khai nhưng **luôn có danh tính thật**, kèm cờ ẩn danh, và hiện cả người đã bị loại (đánh dấu). |
| `GET` | `/admin/leaderboards/exclusions` | `leaderboard.read` | Danh sách người bị loại, lọc theo tháng/bảng. |
| `POST` | `/admin/leaderboards/exclusions` | `leaderboard.moderate` | Loại một user khỏi một bảng (hoặc cả ba) trong một tháng **chưa chốt**, bắt buộc `reason`, có audit. |
| `DELETE` | `/admin/leaderboards/exclusions/:id` | `leaderboard.moderate` | Bỏ loại (tháng chưa chốt), có audit. |
| `GET` | `/admin/badges` | `leaderboard.read` | Huy hiệu đã trao, lọc theo tháng/bảng/user. |
| `PATCH` | `/admin/badges/:id/revoke` | `leaderboard.moderate` | Gỡ huy hiệu, bắt buộc `reason`, có audit. Không đôn hạng. |

Tháng đã chốt thì loại người dùng `PATCH /admin/badges/:id/revoke`. Thứ hạng trong bản lưu giữ
nguyên. Đây là quyết định của tôi, cho khớp nguyên tắc "đã chốt không đổi".

**Cấu hình** (`system_configs`, qua cơ chế cấu hình động sẵn có): bật/tắt tính năng, ngưỡng sàn
từng bảng, số hạng được huy hiệu (mặc định 3), số tháng huy hiệu còn hạn (mặc định 3). Bảng **tắt**
thì route công khai trả danh sách rỗng kèm `enabled: false`, không trả lỗi. Lúc tắt, job chốt bỏ
qua tháng đó.

## 8. Ràng buộc

- Theo đúng nếp repo, xem `AGENTS.md`:
  - SQL thô qua TypeORM; `updateReturning()` cho UPDATE/DELETE … RETURNING.
  - Lỗi khai trong error catalog (`core-lib/src/consts/error-codes.ts` + `error-catalog.ts`).
  - Route `@Public` thêm vào `public-route-inventory.spec.ts`.
  - Route tĩnh đứng trước route có tham số trong cùng file. Ví dụ `/leaderboards/monthly/me`
    nằm trước mọi `:param`.
- Tính đúng của SQL phải được canh bằng **script kiểm trên Postgres thật** (`npm run test:leaderboard`,
  mẫu `test/*.check.ts`), vì unit test mock query không thấy SQL sai. Phải canh ít nhất:
  - ranh giới tháng theo giờ Việt Nam: 23:30 ngày 31 giờ Việt Nam vẫn thuộc tháng đó;
  - ngày bù không tính;
  - đóng góp không thực nhận gì thì không tính;
  - phá hoà theo "đạt sớm hơn";
  - người ẩn danh không lộ danh tính trong response công khai;
  - chốt hai lần không trao huy hiệu hai lần;
  - dữ liệu đổi sau chốt không làm bản lưu đổi.
- Thêm script vào `package.json` để CI tự chạy, như các `test:*` khác.
- Cập nhật `docs/API.md`, và bàn giao cho mobile phần đích thông báo mới.

## 8b. Quyết định sau vòng review (quyết định của tôi — chủ dự án kiểm lại)

- **Hạn huy hiệu tính theo THÁNG CỦA BẢNG**, không theo lúc trao. Huy hiệu tháng `M` hiện đến
  hết tháng `M + N`, với `N` là số tháng cấu hình. Tháng 10 với N=3 thì hiện đến hết 31/1. Lúc trao,
  ghi cố định `expires_at` vào dòng huy hiệu. Admin đổi `N` chỉ ảnh hưởng huy hiệu trao **sau
  đó**. Chốt bù một tháng cũ mà `expires_at` đã qua thì vẫn ghi huy hiệu vào lịch sử, nhưng không
  hiện và **không gửi thông báo**.
- **Một công tắc cho cả tính năng**, không phải ba công tắc. Tắt chỉ **ẩn** bảng ở phía công khai:
  route công khai trả `enabled: false` kèm danh sách rỗng, còn route Admin vẫn xem được. Job chốt
  **vẫn chốt sổ** mọi tháng kể cả lúc tắt, nhưng lúc tắt thì **không trao huy hiệu và không gửi
  thông báo**. Nhờ vậy không có tháng nào nằm `LIVE` mãi, và "đã chốt không đổi" luôn đúng.
- **Điều kiện tài khoản xét LÚC CHỐT.** Bản lưu cố định, đọc lại không lọc theo trạng thái hiện
  tại, và hạng vẫn liền mạch. User bị khoá hoặc xoá **sau** khi chốt vẫn giữ dòng và hạng, nhưng
  phía công khai hiện dòng đó là "Tài khoản không còn hoạt động", không danh tính, giống người ẩn
  danh. Hồ sơ của user bị khoá vốn đã không xem công khai được (`findActiveByUsername`), nên huy
  hiệu của họ cũng không hiện.
- **Số hạng được huy hiệu là cấu hình thật**, mặc định 3. "Khoảng cách" trong `/me` là khoảng cách
  tới **hạng cuối còn nhận huy hiệu**, và chữ trong thông báo đọc theo cấu hình. "Tối đa 9" ở
  mục 5 là con số với giá trị mặc định.
- Công tắc lưu trong `system_configs` dạng INTEGER 0/1, vì endpoint chung chỉ nhận INTEGER.

## 9. Để người xây tự quyết

- Tên bảng, cột, index; cách lưu bản chốt và huy hiệu.
- Cách cache bảng `LIVE` và thời lượng cache (≤ vài phút).
- Kích thước trang mặc định / tối đa của `GET /leaderboards/monthly`.
- Dạng response cụ thể, miễn đủ các trường ở mục 7.
- Loại đích thông báo mới tên gì và mở màn nào (mục 5).
- Có cần index mới cho các truy vấn đếm theo tháng hay không. Nếu cần thì đo trên dữ liệu seed.
