# Kế hoạch triển khai

Bốn tài liệu, mỗi cái trả lời một câu hỏi:

| File | Trả lời | Khi nào đọc |
| --- | --- | --- |
| [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) | Chỗ đặc tả thiếu thì ta giả định gì? | **Đọc trước tiên.** Có 4 giả định cần Bên A xác nhận |
| [`DATA-MODEL.md`](./DATA-MODEL.md) | Có bảng nào, quan hệ ra sao, trạng thái đi thế nào? | Trước khi viết entity |
| [`ROADMAP.md`](./ROADMAP.md) | Làm gì trước, làm gì sau, đang ở đâu? | Đầu mỗi tuần |
| [`../SPRINT-PLAN.md`](../SPRINT-PLAN.md) | Sprint nào có chức năng nào, điều kiện kết thúc là gì? | Lập kế hoạch/kiểm soát sprint |
| [`../FEATURES.md`](../FEATURES.md) | Chức năng F01–F72 làm gì? | Khi code một chức năng cụ thể |
| [`CHECK-IN-STREAK-DESIGN.md`](./CHECK-IN-STREAK-DESIGN.md) | F83 điểm danh, streak, lượt bù, API và UAT mục tiêu | Khi triển khai backend/app/CMS cho yêu cầu 30/09 |

## Đang ở đâu

| Mốc | Nội dung | Trạng thái |
| --- | --- | --- |
| M0 | Nền tảng monorepo + CI/CD | ✅ Xong |
| M1 | Người dùng, hồ sơ, danh mục, media | 🟡 Nền code xong; provider/acceptance xem `DEFERRED.md` |
| M2 | Nội dung & bản đồ | 🟡 M2.1 canonical OFFER/map đang triển khai |
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

## Nghiệp vụ đã chốt từ Bên A

4 câu hỏi lớn trước đây ở [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) đã được Bên A làm rõ và chốt chính thức trong [`../../SRS_Chan_Tam_v1.15.0.md`](../../SRS_Chan_Tam_v1.15.0.md) (Mục 1.7 - CHỐT-01 đến CHỐT-07). Các quyết định này chi phối trực tiếp cấu trúc Rank, Point, Group Affiliate và vòng đời bài đăng.


## Deferred / release blocker

Xem [`DEFERRED.md`](./DEFERRED.md) để biết state đã có nhưng provider/vận hành/M3–M6 còn thiếu trước production-ready.
