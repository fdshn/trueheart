# UAT Sprint 2 — Nội dung, bản đồ, giao dịch và chat

Kịch bản nghiệm thu với Bên A. Mỗi mục là một việc **người thật làm trên ứng dụng
thật**, không phải một câu lệnh — regression tự động đã chạy xong và nằm ở phần
cuối tài liệu này.

> **Vì sao vẫn cần buổi này khi 554 unit test và 16 script đã xanh.** Test tự động
> chứng minh code làm đúng thứ nó được bảo làm. UAT trả lời câu khác: thứ đó có
> phải cái Bên A cần hay không. Hai câu hỏi khác nhau, và không câu nào thay được
> câu kia.

## Chuẩn bị

| Việc | Lệnh / ghi chú |
| --- | --- |
| Hạ tầng | `docker compose up -d` |
| Migration | `cd suites/chantam.vn/chantam/core && npm run migration:run` |
| Service | `npm run dev` — chờ log "Chân Tâm Core khởi động ở cổng 3000" |
| Tài khoản | Cần **3** tài khoản: một người tặng, hai người xin nhận. Cả ba phải đạt MEMBER (hoàn tất onboarding) |

Ghi kết quả vào cột cuối: ✅ đạt, ❌ không đạt kèm mô tả, ⚠️ đạt nhưng có ý kiến.

---

## 1. Đăng tin và vòng đời bài (epic 8)

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 1.1 | Đăng một bài Muốn Tặng có ảnh, chọn vị trí trên bản đồ | Bài vào trạng thái chờ duyệt, chưa ai thấy | |
| 1.2 | Admin duyệt bài | Bài hiện ở bảng tin | |
| 1.3 | Đăng quá hạn mức của hạng hiện tại | Bị chặn, báo rõ còn bao nhiêu lượt | |
| 1.4 | Đánh dấu một bài là Cần gấp (SOS) | Chỉ hạng được cấp quyền mới bật được | |
| 1.5 | Mở một bài sắp hết hạn, bấm gia hạn | Hạn lùi ra, **lần thứ hai bị từ chối** | |
| 1.6 | Yêu cầu chuyển bài về điểm từ thiện | Vào hàng đợi Admin, Admin duyệt/từ chối được | |

## 2. Quanh đây và bản đồ (epic 9)

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 2.1 | Mở Quanh đây khi đã bật GPS | Thấy bài trong bán kính, có khoảng cách | |
| 2.2 | **Tắt GPS** rồi mở lại | Lùi về Vị trí mặc định trong hồ sơ, và **nói rõ là đang dùng vị trí mặc định** | |
| 2.3 | Tắt GPS khi hồ sơ chưa đặt Vị trí mặc định | Báo lỗi đọc được, **không** tự quét quanh một điểm bừa | |
| 2.4 | Kéo/thu phóng bản đồ | Marker cập nhật theo khung nhìn, cụm lại khi thu nhỏ | |
| 2.5 | Chạm một marker | Thẻ xem nhanh có tiêu đề, ảnh, khoảng cách | |
| 2.6 | **So toạ độ trên bản đồ với địa chỉ thật** | Lệch vài trăm mét — đây là cố ý, chỉ người được duyệt mới biết địa chỉ chính xác | |

## 3. Xin nhận và chọn người (epic 10)

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 3.1 | Hai người cùng gửi yêu cầu xin nhận một bài | Cả hai vào danh sách ứng viên của chủ bài | |
| 3.2 | Một người rút yêu cầu | Rời danh sách, người kia còn nguyên | |
| 3.3 | Chủ bài xem danh sách ứng viên | Thấy tên, hạng, thời điểm xin | |
| 3.4 | Chủ bài duyệt một người | Tồn kho giảm, người còn lại vào hàng đợi dự phòng | |
| 3.5 | **Huỷ lượt vừa duyệt** | Tồn kho trả lại, người trong hàng đợi được mở lại cơ hội | |
| 3.6 | Bài chỉ còn 1 món, hai người bấm xin gần như cùng lúc | Chỉ một người được, không âm tồn kho | |

## 4. Hoàn tất lượt trao (epic 11)

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 4.1 | Người tặng bấm đã bàn giao, **kèm ảnh** | Ghi nhận mốc bàn giao | |
| 4.2 | Người nhận xác nhận đã nhận, **kèm ảnh** | Lượt trao hoàn tất | |
| 4.3 | Kiểm điểm của cả hai bên sau khi hoàn tất | Cộng đúng theo rule Admin cấu hình | |
| 4.4 | Bàn giao nhưng **không** gửi ảnh | Vẫn hoàn tất được, nhưng **mất quyền báo xấu** về lượt này | |
| 4.5 | Để một lượt đã bàn giao quá 5 ngày rồi chạy `npm run transaction:autocomplete` | Tự hoàn tất | |

## 5. Chat (epic 12)

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 5.1 | Mở chat **trước khi** được duyệt | Không có phòng chat nào | |
| 5.2 | Sau khi được duyệt, hai bên nhắn qua lại | Tin đến ngay, không phải tải lại | |
| 5.3 | Người thứ ba thử mở phòng đó | Không vào được | |
| 5.4 | **Gửi ảnh** trong chat (tối đa 3) | Ảnh hiện đúng thứ tự, người kia thấy ngay | |
| 5.5 | Gửi tin **chỉ có ảnh**, không chữ | Gửi được | |
| 5.6 | Gửi tin rỗng cả chữ lẫn ảnh | Bị từ chối | |
| 5.7 | Cuộn ngược lên đọc lịch sử dài | Không lặp tin, không sót tin | |
| 5.8 | Sau khi lượt trao hoàn tất | Vẫn đọc lại được, **ô soạn tin bị khoá** | |
| 5.9 | Kiểm thông báo của người nhận | Có báo tin nhắn mới; người gửi **không** tự nhận báo | |

## 6. Quyền riêng tư — mục Bên A nên soi kỹ nhất

| # | Việc làm | Kỳ vọng | KQ |
| --- | --- | --- | --- |
| 6.1 | Xem hồ sơ công khai của người lạ | **Không** thấy email, số điện thoại, vị trí mặc định | |
| 6.2 | Xem chi tiết bài của người lạ khi chưa được duyệt nhận | **Không** thấy số điện thoại và địa chỉ chính xác | |
| 6.3 | Sau khi được duyệt nhận | Mới thấy thông tin liên lạc | |
| 6.4 | Gọi API bảng tin mà không đăng nhập | Vẫn xem được bài, nhưng toạ độ làm nhiễu | |

---

## Regression tự động — đã chạy

Chạy lại bất cứ lúc nào để đối chứng:

```bash
# Unit
cd suites/chantam.vn/chantam/core && npm test          # 554 test

# Trên Postgres thật (cần docker compose up -d)
npm run test:concurrency        # 6 bất biến trừ tồn kho song song
npm run test:lifecycle          # 21 bất biến vòng đời bài
npm run test:post-status
npm run test:handover
npm run test:gift-points
npm run test:returning
npm run test:chat-paging
npm run test:chat-access
npm run test:chat-purge
npm run test:feed-foundation
npm run test:feed-reactions
npm run test:feed-comments
npm run test:feed-media
npm run test:feed-shares
npm run test:feed-merge
npm run migration:backfill-check

# Cần service đang chạy
npm run test:chat-e2e
bash scripts/smoke-test.sh http://localhost:3000       # 53 phép kiểm
```

## Những thứ KHÔNG nằm trong buổi nghiệm thu này

Nói trước để không ai kỳ vọng nhầm:

- **Gửi SMS/Zalo thật** — chưa tích hợp nhà cung cấp. Xác minh số điện thoại chạy
  được về mặt logic nhưng không có tin nhắn nào đi ra.
- **Đẩy thông báo xuống điện thoại (FCM)** — thông báo trong app có đủ; đẩy push
  thì fail-closed ở production vì chưa cấu hình nhà cung cấp.
- **Giao diện Admin CMS** — API và phân quyền đã có, màn hình chưa.
- **Lifecycle rule của bucket** xoá ảnh tải lên rồi bỏ dở. Là việc cấu hình hạ
  tầng, chưa làm.
- Toàn bộ Sprint 3–4: group, affiliate, chống gian lận, nội dung Phật Pháp.
