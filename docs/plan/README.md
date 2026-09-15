# Kế hoạch triển khai

Bốn tài liệu, mỗi cái trả lời một câu hỏi:

| File | Trả lời | Khi nào đọc |
| --- | --- | --- |
| [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) | Chỗ đặc tả thiếu thì ta giả định gì? | **Đọc trước tiên.** Có 4 giả định cần Bên A xác nhận |
| [`DATA-MODEL.md`](./DATA-MODEL.md) | Có bảng nào, quan hệ ra sao, trạng thái đi thế nào? | Trước khi viết entity |
| [`ROADMAP.md`](./ROADMAP.md) | Làm gì trước, làm gì sau, đang ở đâu? | Đầu mỗi tuần |
| [`../FEATURES.md`](../FEATURES.md) | Chức năng F01–F72 làm gì? | Khi code một chức năng cụ thể |

## Đang ở đâu

| Mốc | Nội dung | Trạng thái |
| --- | --- | --- |
| M0 | Nền tảng monorepo + CI/CD | ✅ Xong |
| M1 | Người dùng, hồ sơ, danh mục, media | ⬜ Chưa bắt đầu |
| M2 | Nội dung & bản đồ | ⬜ |
| M3 | Giao dịch & chat | ⬜ |
| M4 | Điểm & thứ hạng | ⬜ |
| M5 | Group & affiliate | ⬜ |
| M6 | Quản trị & bàn giao | ⬜ |

Chi tiết từng mốc: [`ROADMAP.md`](./ROADMAP.md).

## Quy tắc dùng tài liệu này

1. **Xong một chức năng → tick vào ROADMAP.md** trong cùng commit. Không tick riêng.
2. **Gặp chỗ đặc tả thiếu → thêm vào ASSUMPTIONS.md**, đừng quyết ngầm trong code.
3. **Đổi cấu trúc bảng → sửa DATA-MODEL.md** trong cùng commit với migration.
4. Quy tắc code nằm ở [`../../INVARIANTS.md`](../../INVARIANTS.md), không lặp lại ở đây.

## Việc cần Bên A trả lời

4 câu hỏi ở [`ASSUMPTIONS.md`](./ASSUMPTIONS.md#4-giả-định-cần-bên-a-xác-nhận). Chưa có trả
lời thì vẫn code được — ta dùng giả định. Nhưng **giả định #2 và #3 đụng tới cấu trúc bảng**,
nên càng trả lời sớm càng rẻ.
