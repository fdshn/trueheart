## Thay đổi gì

<!-- Mô tả ngắn gọn. Nếu sửa lỗi, nêu cả nguyên nhân gốc chứ không chỉ triệu chứng. -->

## Vì sao

<!-- Bối cảnh: yêu cầu nào trong đặc tả, hoặc vấn đề gì đang gặp. -->

## Kiểm chứng thế nào

<!-- Cụ thể: lệnh đã chạy, endpoint đã gọi, kết quả thấy được. -->

- [ ] `npm run lint:check` và `npm run format:check` sạch
- [ ] `npm run build` xanh
- [ ] `npm test` xanh
- [ ] Đã chạy thử thật (nếu đụng vào luồng nghiệp vụ)

## Đối chiếu INVARIANTS.md

- [ ] Đã đọc `INVARIANTS.md` và không vi phạm mục nào
- [ ] Resource mới: có đủ interface DTO ở `-lib`, contract, implementation, DTO cụ thể, controller, và `.spec.ts`
- [ ] Không dùng `throw new Error(...)` trong luồng nghiệp vụ
- [ ] Truy vấn không gian đi qua `GeoQueryHelper`, không tự tính Haversine
- [ ] **Không có đường nào trả toạ độ chính xác hoặc khoảng cách chính xác ra kênh công khai**
- [ ] Không log CCCD, số điện thoại đầy đủ hay toạ độ

## Ghi chú khi triển khai

<!-- Biến môi trường mới, thay đổi schema, thứ tự triển khai. Ghi "không có" nếu không. -->
