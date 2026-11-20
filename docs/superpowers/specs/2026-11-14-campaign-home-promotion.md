# Đề xuất chiến dịch lên trang chủ

## Mục tiêu

Cho phép owner chiến dịch gửi một nội dung quảng bá lên trang chủ để Admin xem
preview, duyệt/từ chối và quản lý lịch chạy. Tái sử dụng sponsor_banners và
các API public banner hiện có; không tạo thêm màn quản lý banner thứ hai.

## Luồng nghiệp vụ

1. Owner bấm **Đề xuất lên trang chủ** trong chi tiết chiến dịch.
2. Owner chọn kiểu hiển thị, placement, ảnh, nội dung/link và khoảng thời gian.
3. Backend tạo đề xuất ở trạng thái PENDING_APPROVAL.
4. Đề xuất xuất hiện trong danh sách Admin Banner tài trợ/Quản lý hiển thị.
5. Admin xem nguồn chiến dịch, preview, duyệt hoặc từ chối kèm ghi chú.
6. Sau khi duyệt, Admin vẫn phải bật banner; chỉ banner đã duyệt, đang bật và
   trong thời gian chạy mới được trả cho mobile.
7. Khi owner sửa ảnh, link, placement hoặc lịch chạy sau duyệt, đề xuất quay
   lại PENDING_APPROVAL hoặc tạo revision chờ duyệt; không thay đổi âm thầm
   nội dung đang chạy.

## Backend cần bổ sung

Mở rộng sponsor_banners với các trường:

- source_type: ADMIN | CAMPAIGN | SPONSORED.
- source_id: campaign_global_id, nullable.
- requested_by: user tạo đề xuất, nullable.
- display_type: FULLSCREEN | BANNER | SLIDER | INLINE | FLOATING.
- approval_note, nullable.

Banner do Admin tạo trực tiếp tiếp tục được duyệt ngay như hiện tại. Banner do
owner chiến dịch tạo bắt buộc đi qua PENDING_APPROVAL.

API đề xuất:

    POST  /api/v1/campaigns/:campaignId/promotions
    GET   /api/v1/campaigns/:campaignId/promotions
    PATCH /api/v1/admin/banners/:id/approval
    PATCH /api/v1/admin/banners/:id/active
    GET   /api/v1/banners?placement=...

API public tiếp tục lọc:

    approval_status = APPROVED
    is_active = true
    deleted_at IS NULL
    starts_at <= now()
    ends_at > now()

Response public cần thêm sourceType, sourceId và displayType để mobile biết
banner đến từ đâu và cách hiển thị.

## FE Admin bắt buộc cập nhật

Phần này không được bỏ qua khi merge backend:

- Giữ **một màn quản lý** /banners, không tạo màn banner mới.
- Thêm bộ lọc nguồn: Admin, Chiến dịch, Tài trợ.
- Hiển thị tên/link chiến dịch nguồn và người đề xuất.
- Thêm badge Chờ duyệt, Đã duyệt, Từ chối, Đang chạy, Hết hạn.
- Thêm preview theo displayType.
- Form tạo/sửa cho phép chọn displayType và placement.
- Thêm nút duyệt/từ chối; từ chối bắt buộc nhập lý do.
- Phân biệt banner Admin tạo trực tiếp với đề xuất từ campaign.
- Cho phép bật/tắt và chỉnh lịch chạy sau khi duyệt theo quyền.
- Trong chi tiết campaign, hiển thị trạng thái đề xuất dạng read-only và link
  sang màn quản lý banner.
- Không cho owner tự bật hoặc tự duyệt nội dung.

## Mobile contract

Mobile chỉ gọi API public banner theo placement và hiển thị theo displayType.
Poster fullscreen sau Splash có thể dùng danh sách banner hiện có, sắp theo
displayOrder, hiển thị tuần tự rồi mới vào Home.
