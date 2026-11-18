# CR chiến dịch từ thiện — điều kiện tham gia và FE Admin

## Phạm vi backend cần cập nhật

1. Bổ sung cấu hình `minimumParticipants` cho chiến dịch. Giá trị là số nguyên không âm; `0` nghĩa là không đặt số lượng tối thiểu.
2. Bổ sung cấu hình `minimumParticipantRank` cho chiến dịch. Giá trị hợp lệ: `VIEWER`, `MEMBER`, `SILVER`, `GOLD`, `DIAMOND`; `null` nghĩa là không giới hạn hạng.
3. Trả hai trường trên ở API tạo, chi tiết public, workspace của chủ chiến dịch và API Admin.
4. Khi người dùng đăng ký tham gia, backend đọc hạng hiện tại từ database và từ chối nếu thấp hơn `minimumParticipantRank`; không tin rank trong access token.
5. Giữ nguyên toàn bộ vòng đời participant hiện tại: đăng ký vào `REGISTERED`, BTC xác nhận/check-in, owner không được đẩy participant tới bước chưa phù hợp với giai đoạn chiến dịch.
6. Tổng kết phải trả số người đăng ký/tham gia thực tế và cho phép đối chiếu với `minimumParticipants`. Việc chưa đạt số tối thiểu là thông tin cảnh báo, không tự ý huỷ chiến dịch.
7. Có migration, validation, Swagger/OpenAPI, error code nghiệp vụ và test cho các case: không giới hạn hạng, đủ hạng, thiếu hạng, hạng thay đổi sau khi phát hành token, `minimumParticipants = 0`, giá trị âm và enum sai.

## Những phần backend đã hỗ trợ, không làm lại

- Hai loại `INDIVIDUAL_APPEAL` và `ORGANIZED_CAMPAIGN` dùng chung engine.
- Media chiến dịch hỗ trợ ảnh và video; bài sự kiện có quota ảnh/clip.
- Lịch 4 giai đoạn có thời gian và `deliveryMethod` cho bước trao (`ON_SITE`, `SHIP`, `TRANSFER`).
- Workspace, danh sách participant, xác nhận/check-in, tổng kết, báo cáo tài chính và promotion request đã có contract.
- Rank/capability quyết định quyền tạo và quyền công khai ngay; không hardcode tên hạng ở client.

## FE Admin cần cập nhật trong cùng đợt nghiệm thu

1. **Luồng duyệt chiến dịch:** chiến dịch mới hoặc chiến dịch gửi lại sau chỉnh sửa phải ở trạng thái chờ duyệt; chỉ chiến dịch được Admin duyệt mới được công khai. Đây là nghiệp vụ duyệt nội dung và tính hợp lệ của chiến dịch.
2. **Luồng duyệt đề xuất banner:** là yêu cầu độc lập với duyệt chiến dịch. Khi chủ chiến dịch chọn đề xuất lên trang chủ, yêu cầu phải xuất hiện trong màn quản lý banner để Admin duyệt riêng, cấu hình vị trí, thứ tự ưu tiên và thời gian hiển thị. Chiến dịch được duyệt không đồng nghĩa banner tự động được duyệt; banner chỉ hiển thị khi cả chiến dịch đang hợp lệ và đề xuất banner đã được chấp thuận.
3. Form tạo/sửa chiến dịch có hai trường:
   - Số người tham gia tối thiểu.
   - Hạng tối thiểu để được đăng ký tham gia.
4. Màn chi tiết/duyệt chiến dịch hiển thị rõ hai điều kiện này và thông tin đề xuất lên trang chủ.
5. Màn quản lý participant hiển thị hạng hiện tại, điều kiện hạng của chiến dịch và lý do không đủ điều kiện.
6. Màn tổng kết hiển thị `số thực tế / số tối thiểu`, nhưng không cho Admin tự sửa số thực tế.
7. FE Admin dùng enum/contract backend trả về, không tự suy quyền hoặc so sánh chuỗi tên hạng.

## Tiêu chí nghiệm thu

- Mobile/Admin đọc được cùng một giá trị điều kiện từ backend.
- Chiến dịch chưa được Admin duyệt không xuất hiện công khai.
- Đề xuất banner có hàng chờ và trạng thái duyệt riêng trong FE Admin.
- Duyệt chiến dịch và duyệt banner là hai quyết định độc lập; chỉ banner đã duyệt của chiến dịch còn hợp lệ mới được hiển thị.
- Người chưa đủ hạng không thể đăng ký bằng cách gọi API trực tiếp.
- Người đủ hạng đăng ký vào đúng trạng thái `REGISTERED`, không tự động được check-in hay hoàn thành.
- Chiến dịch cũ sau migration giữ hành vi cũ: `minimumParticipants = 0`, `minimumParticipantRank = null`.
