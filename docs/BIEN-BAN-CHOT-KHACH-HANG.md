# Tài liệu họp Bên A — Các nội dung cần chốt

**Dự án:** Nền tảng Chân Tâm  
**Cập nhật theo tài liệu đến:** 02/10/2026  
**Mục tiêu buổi họp:** Chốt chính sách đang để tính năng ở trạng thái TẮT, xác nhận các giả định có ảnh hưởng trực tiếp tới người dùng và thống nhất các đầu việc Bên A cần cung cấp để triển khai/UAT.

> Các đề xuất dưới đây là giá trị đã có trong tài liệu hoặc cấu hình hiện tại, không mặc nhiên là quyết định cuối cùng. Vui lòng ghi rõ **Đồng ý / Điều chỉnh / Hoãn**, người phụ trách và thời hạn.

## 1. Các quyết định ưu tiên cần chốt

### 1.1. Affiliate Group — chốt chính sách để có thể bật

Bộ máy và hai loại sự kiện đã có: `POST_CREATED` và `GIFT_COMPLETED`. Engine chỉ phát thưởng khi Admin publish policy hợp lệ; hiện có thể để nguyên trạng thái TẮT cho tới khi Bên A duyệt chính sách.

| Nội dung cần quyết | Phương án/đề xuất hiện có | Quyết định của Bên A |
| --- | --- | --- |
| Cách chia điểm (A1) | `SPLIT_POOL`: tổng điểm được chia đều cho thành viên đủ điều kiện; tổng chi không tăng theo quy mô nhóm. `PER_MEMBER`: mỗi người đủ điều kiện nhận toàn bộ số điểm của sự kiện. Mặc định kỹ thuật: `SPLIT_POOL`. | |
| Loại sự kiện được thưởng (A2) | Hiện có hook cho đăng bài và hoàn tất lượt trao. Có thể bổ sung sự kiện mời người mới hợp lệ và tham gia Event khi Bên A xác nhận; phân hệ Event chưa sẵn sàng. | |
| Điểm theo từng loại sự kiện (A3) | Chốt số điểm cho từng event được bật; cấu hình qua `eventPoints`. | |
| Giới hạn phát thưởng (A4) | Chốt `dailyCapPerBeneficiary` (trần/ngày/người nhận) và `maxBeneficiariesPerEvent` (số người tối đa nhận từ một sự kiện). Cả hai phải lớn hơn 0 để publish. | |

**Cần lưu ý:** Geo eligibility đã là hàng rào bắt buộc: sự kiện ngoài bán kính nhóm không được cộng điểm. Việc thu hồi thưởng khi cần cũng đã có cơ chế ghi bút toán đảo (A5); đây không còn là hạng mục chờ thiết kế.

### 1.2. Điểm danh và streak (F83) — duyệt bộ số đang để TẮT

Tài liệu ghi nhận quy tắc streak theo ngày liên tiếp và lượt bù chỉ tích từ giao dịch tặng/nhận quà hoàn tất. Mỗi giao dịch hợp lệ tích một lượt cho **cả người tặng và người nhận**. Bản policy nháp đã được seed nhưng chưa bật:

| Thông số | Giá trị đề xuất đang seed | Duyệt / điều chỉnh |
| --- | ---: | --- |
| Điểm mỗi ngày điểm danh | 2 điểm | |
| Mốc streak | 7 / 14 / 30 / 50 ngày | |
| Điểm thưởng tại các mốc | 10 / 25 / 60 / 120 điểm | |
| Giao dịch hoàn tất đổi 1 lượt bù | 4 giao dịch | |
| Cửa sổ được bù ngày bỏ lỡ | 7 ngày | |
| Giới hạn lượt bù tích trữ | Không giới hạn | |

**Sau khi duyệt:** Admin publish policy với `enabled: true`; tới lúc đó F83 vẫn TẮT. Cần xác nhận thêm cách xử lý vận hành nếu một giao dịch cấp lượt bù bị đảo sau khi người dùng đã tiêu lượt đó: tài liệu hiện nói cần đối soát thủ công nhưng chưa định nghĩa màn hình/quy trình.

### 1.3. Điểm thưởng theo đánh giá vật phẩm (F40) — xác nhận lại một con số do tài liệu lệch nhau

Tài liệu nghiệp vụ chi tiết và sổ quyết định ghi **100% đánh giá = 56 điểm**, mức không có đánh giá là **80% sau 7 ngày**. Tuy nhiên, [SPRINT-PLAN.md](./SPRINT-PLAN.md) vẫn ghi F40 đang chờ Bên A cho con số X.

**Đề nghị xác nhận:** 56 điểm cho 100% có phải quyết định đã duyệt và áp dụng cho F40 không? Nếu có, chốt phiên bản/ngày duyệt để cập nhật Sprint Plan; nếu không, ghi con số thay thế.  
**Lưu ý:** Không nhầm F40 (điểm phát sinh từ đánh giá sau khi trao) với F74 (đổi điểm lấy vật phẩm, đang cấu hình 2.000 VNĐ/điểm).

### 1.4. Cổng hồ sơ và xác minh

Cổng hiện yêu cầu người dùng có Họ tên, Avatar, SĐT và Email; tài liệu ghi cổng **chưa bắt buộc SĐT/Email đã xác minh**. Xác minh SĐT lại là điều kiện bắt buộc để hoàn tất onboarding.

**Cần chốt:** Có yêu cầu xác minh SĐT và/hoặc email trước khi đăng bài, xin nhận, chat, tạo Group không? Nếu có, xác định chính xác hành vi nào bị chặn. Đây là thay đổi ảnh hưởng trực tiếp tới số người sử dụng được sản phẩm.

### 1.5. Đổi vật phẩm bằng điểm — điểm thưởng của người nhận

Khi người dùng đổi vật phẩm bằng điểm, tài liệu nêu khả năng giao dịch vẫn ghi nhận điểm hoàn tất cho các bên; ví dụ người đổi trả 500 điểm có thể đồng thời nhận lại 28 điểm với vai trò người nhận.

**Cần chốt:** Người nhận vật phẩm bằng điểm có được nhận khoản `GIFT_COMPLETED_RECEIVER` không? Quyết định này sẽ thay đổi kinh tế điểm của một giao dịch đổi vật phẩm.

### 1.6. Giới thiệu — xử lý tài khoản được xác định là ảo

Đường kỹ thuật thu hồi điểm đã có, nhưng chính sách nghiệp vụ chưa chốt.

**Cần chốt:** Có thu hồi 56 điểm thưởng giới thiệu nếu tài khoản được xác minh là ảo/gian lận không? Nếu có, ai có quyền kết luận và cần điều kiện/audit nào? Các ngưỡng phát hiện dựa trên dấu vết thiết bị hiện để TẮT; tài liệu khuyến nghị chờ có dữ liệu thực khoảng 4–8 tuần rồi mới chọn ngưỡng thay vì đoán trước.

## 2. Nhà cung cấp và thông tin Bên A cần phối hợp

| Đầu việc | Cần Bên A cung cấp / xác nhận | Tác động nếu chưa có |
| --- | --- | --- |
| SMS | Chọn nhà cung cấp, cung cấp credential qua secret phù hợp, phối hợp thử gửi trên staging. | Chặn xác minh SĐT; onboarding và các luồng phụ thuộc vào đó không thể nghiệm thu thực tế. |
| Zalo ZNS | Xác nhận có dùng ở giai đoạn này không; nếu có, chọn nhà cung cấp/cung cấp credential và thông tin mẫu gửi. | Chưa gửi thông báo qua Zalo. |
| Email | Xác thực domain người gửi; xác nhận bên sở hữu SMTP relay và nơi lưu secret. SMTP adapter đã có. | Email OTP có thể không gửi thật/không vào hộp thư, ảnh hưởng khôi phục mật khẩu và xác minh email. |
| Push notification | Cấp quyền truy cập/khoá dự án Firebase (FCM) cho môi trường triển khai. | Thông báo trong app vẫn có, nhưng chưa đẩy tới thiết bị. |
| Lưu trữ media production | Cấp R2 bucket, key, CORS và CDN/public domain cho staging/production. | Chưa thể nghiệm thu upload ảnh trên môi trường thật. |
| Vận hành production | Chỉ định kênh nhận cảnh báo và cung cấp URL tích hợp; xác nhận URL healthcheck, cấu hình `TRUST_PROXY=true` nếu có reverse proxy. | Job/health alert có thể không tới người trực; cấu hình proxy sai có thể ảnh hưởng rate limit. |

## 3. Các nội dung cần xác nhận phạm vi hoặc ưu tiên

Không nhất thiết phải chốt hết trong buổi này; cần xác nhận nội dung nào thuộc đợt bàn giao/ra mắt đầu tiên:

- **Giao diện Admin CMS:** API quản trị nền đã có, nhưng giao diện CMS chưa có.
- **Phạm vi sản phẩm còn lại:** Dharma Hub; các phần quảng cáo/campaign/blog liên quan; các màn hình app cho tính năng mới như F83.
- **UAT với người dùng thật:** thống nhất ngày, người tham gia, môi trường, tài khoản mẫu và người có quyền ký nghiệm thu. Kịch bản Sprint 2 đã có tại [UAT-SPRINT-2.md](./UAT-SPRINT-2.md).
- **Sao lưu và khôi phục:** cần chỉ định người phối hợp để chạy restore test trước khi tuyên bố sẵn sàng production.

## 4. Việc nên rà soát nội bộ trước/sau buổi họp

Các mục dưới đây có trạng thái mâu thuẫn giữa tài liệu. Không nên hỏi khách hàng như thể chưa từng có quyết định; mang theo quyết định được ghi nhận và chỉ hỏi xác nhận lại khi cần.

| Nội dung | Tài liệu đang ghi | Việc cần làm |
| --- | --- | --- |
| F40 = 56 điểm | [FEATURES.md](./FEATURES.md), [ASSUMPTIONS.md](./plan/ASSUMPTIONS.md) và [21-open-issues.md](./diagram/21-open-issues.md) ghi đã chốt; [SPRINT-PLAN.md](./SPRINT-PLAN.md) lại ghi đang chờ con số. | Xác nhận F40 tại buổi họp, sau đó thống nhất một trạng thái trong tài liệu. |
| Cap báo xấu | Có tài liệu ghi 10 báo cáo/ngày, tài liệu khác ghi `REPORT_UPHELD` 5/ngày. Đây có thể là hai loại giới hạn khác nhau nhưng chưa được diễn đạt nhất quán. | Kỹ thuật đối chiếu cap gửi báo cáo với cap thưởng báo cáo; hỏi Bên A nếu vẫn còn khác biệt nghiệp vụ. |
| Quyết định đã chốt trong SRS | Rank theo balance, tiêu điểm và xét lại hạng; Active Member 90 ngày; F74 2.000 VNĐ/điểm; mật khẩu recovery không có kênh xác minh thì liên hệ Admin support; gia hạn bài Muốn Tặng một lần thêm 3 tháng. | Không mở lại các quyết định này trừ khi Bên A chủ động thay đổi phạm vi. |

## 5. Biên bản quyết định

| Mã | Quyết định / đầu việc | Kết quả (Đồng ý / Điều chỉnh / Hoãn) | Chủ trì | Hạn hoàn thành |
| --- | --- | --- | --- | --- |
| A1–A4 | Affiliate policy | | | |
| F83 | Duyệt policy điểm danh/streak | | | |
| F40 | Xác nhận điểm cho 100% | | | |
| F07 | Điều kiện xác minh trước các hành vi chính | | | |
| D1 | Có/không cộng điểm cho người nhận khi đổi vật phẩm | | | |
| R2 | Có/không thu hồi điểm referral khi xác định gian lận | | | |
| Providers | SMS / Zalo / Email / FCM | | | |
| Media | R2 staging/production | | | |
| Scope/UAT | Phạm vi đợt bàn giao và lịch nghiệm thu | | | |

## Tài liệu nguồn

- [31-open-items.md](./diagram/31-open-items.md) — sổ các mục còn treo, gồm affiliate, referral, F83, hạ tầng.
- [SPRINT-PLAN.md](./SPRINT-PLAN.md) — tiến độ và trạng thái triển khai cập nhật đến 02/10/2026.
- [ASSUMPTIONS.md](./plan/ASSUMPTIONS.md) — quyết định đã chốt và policy F83 đề xuất.
- [FEATURES.md](./FEATURES.md) — định nghĩa chức năng và quyết định F40/F74.
- [CONFIG-INVENTORY.md](./CONFIG-INVENTORY.md) — cấu hình hiện tại và nhà cung cấp.
- [SRS_Chan_Tam_v1.15.0.md](./software-requirement-specification/SRS_Chan_Tam_v1.15.0.md) — bản đặc tả đang dùng; tên file giữ v1.15.0, nội dung ghi v1.15.3.
