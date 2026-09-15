# Giả định

Đặc tả thiếu 10 giá trị. Ta chọn mặc định để không bị chặn, nhưng **ghi rõ ở đây** để không
ai tưởng đó là yêu cầu của Bên A.

- **4 giả định cần xác nhận** — sai thì phải sửa cấu trúc hoặc làm lại test
- **6 mặc định mềm** — Admin chỉnh được, sai chỉ tốn một dòng cấu hình

---

## 4 giả định cần Bên A xác nhận

### GĐ-1 · Một giao dịch 100% giá trị = **56 điểm**

Đặc tả chỉ ghi "100% tương ứng X điểm do Admin cấu hình", không cho X.

**Chọn 56** vì nó làm mọi ngưỡng Rank rơi đúng vào số giao dịch tròn:

| Rank | Điểm | = số giao dịch |
| --- | ---: | ---: |
| Member | 224 | 4 |
| Bạc | 672 | 12 |
| Vàng | 896 | 16 |
| Kim Cương | 1792 | 32 |

Bảng điểm đề xuất:

| Sự kiện | Điểm |
| --- | ---: |
| Vật phẩm đạt 100% mô tả | 56 |
| 75–99% | 42 |
| 50–74% | 28 |
| 25–49% | 14 |
| Dưới 25% | 0 |
| Xác minh SĐT lần đầu | 28 |
| Referral thành công | 56 |
| Report được Admin xác minh | 14 |
| Like / Comment | **0 — tắt mặc định** |

> Để Like/Comment bằng 0 lúc ra mắt là cố ý: đây là đường farm điểm rẻ nhất. Bật sau khi đã
> có dữ liệu thật về hành vi.

**Sai thì sao:** chỉ sửa dữ liệu trong bảng `point_rules`, không đụng code. Nhưng test và
kịch bản nghiệm thu phải viết lại.

---

### GĐ-2 · "Active Member" = chưa bị khoá **và** có hoạt động trong 90 ngày

Đặc tả nói thưởng affiliate chia cho "toàn bộ Active Member" nhưng không định nghĩa Active.

```sql
WHERE status = 'ACTIVE' AND last_activity_at > now() - interval '90 days'
```

**Vì sao 90 ngày:** trùng chu kỳ duy trì Rank đã có sẵn trong đặc tả — không đẻ thêm một
khoảng thời gian mới để phải nhớ.

**Vì sao cần điều kiện hoạt động:** nếu Active chỉ nghĩa là "đã tham gia", thì một nhóm 500
tài khoản ngủ đông vẫn ăn điểm mãi mãi nhờ một người hoạt động. Đó là lỗ hổng farm rõ nhất
của toàn hệ thống.

**Sai thì sao:** ⚠️ **đụng cấu trúc.** Cần cột `group_members.last_activity_at` và một
listener cập nhật nó. Thêm lúc dựng bảng thì miễn phí; thêm sau khi có dữ liệu thì phải
backfill từ ledger.

---

### GĐ-3 · Rank: **điểm là sàn, nhiệm vụ là trần**

Đặc tả nói cả hai cơ chế và chúng triệt tiêu nhau (xem [FEATURES.md F12](../FEATURES.md#f12--rank-5-tầng--chu-kỳ-duy-trì-3-tháng)).

Quy tắc chọn:

| Tình huống | Kết quả |
| --- | --- |
| Đủ điểm mốc kế tiếp | Lên hạng (Bạc cần thêm 1 Cho + 1 referral) |
| Đạt nhiệm vụ duy trì quý | Giữ hạng |
| **Trượt nhiệm vụ duy trì** | **Tụt đúng 1 bậc**, không rơi tự do theo điểm |
| Sau khi tụt | Muốn lên lại thì theo quy tắc lên hạng bình thường |

**Vì sao:** làm nhiệm vụ duy trì có ý nghĩa thật, đồng thời giữ điểm làm thước đo chính.
Tụt 1 bậc thay vì rơi tự do vì đây là ứng dụng thiện nguyện — người dùng là tình nguyện viên,
phạt nặng sẽ khiến họ bỏ đi.

**Sai thì sao:** ⚠️ **đụng cấu trúc.** Cần bảng `rank_maintenance_cycles`. Nếu Bên A chốt
"chỉ xét theo điểm" thì xoá bảng và xoá một cron — rẻ, **miễn là quyết trong M4**.

---

### GĐ-4 · "2+2 / 3+3 / 4+4" = **N giao dịch Cho hoàn tất + N referral**

Suy từ dòng "Nhiệm vụ lên Bạc: 1 Cho hoàn tất + 1 referral".

Tính trong chu kỳ 3 tháng:
- **Cho hoàn tất** = giao dịch ở trạng thái `COMPLETED` mà người đó là bên Cho
- **Referral** = tài khoản mới đăng ký qua mã/link của người đó (đúng sự kiện của F13)

**Sai thì sao:** cron xét hạng chạy sai điều kiện. Lỗi chỉ lộ ra sau 3 tháng, khi chu kỳ đầu
tiên chốt — lúc đó hàng loạt người dùng đã bị tụt hạng oan.

> ⚠️ Rủi ro đã biết: đếm referral theo lượt đăng ký (không đòi người mới phải hoạt động) thì
> tài khoản ảo là cách giữ hạng rẻ nhất. Hàng rào duy nhất là geo-eligibility (F57) và chống
> gian lận (F50). Cả hai phải xong **cùng lúc** với affiliate, không để sau.

---

## 6 mặc định mềm

Admin chỉnh được qua CMS. Sai chỉ tốn một dòng cấu hình.

| # | Hạng mục | Mặc định | Nguồn |
| --- | --- | --- | --- |
| MĐ-1 | Quota bài đang mở / Rank | Viewer 0 · Member 3 · Bạc 10 · Vàng 20 · Kim Cương 50 | F15, F16 |
| MĐ-2 | Rank được dùng SOS | Từ **Bạc** trở lên | F17 |
| MĐ-3 | Bán kính Group | **10 km**, Admin chỉnh trong khoảng 1–50 km | F52 |
| MĐ-4 | Độ sâu Sub-team | **1 tầng** (Group → Sub-team), Phase 1 không sâu hơn | F53 |
| MĐ-5 | Cap theo ngày | 5 giao dịch tính điểm · 3 referral | F61 |
| MĐ-6 | Cap report | 10 report/người/ngày; chỉ report đã xác minh mới được điểm | F41, F49 |

---

## Câu hỏi gửi Bên A

Copy nguyên bốn câu dưới đây:

> 1. Một vật phẩm được người nhận đánh giá **đúng 100% như mô tả** thì được bao nhiêu điểm?
>    (Chúng tôi đang tạm dùng 56 điểm, tương ứng 4 giao dịch để lên Member.)
>
> 2. Phần thưởng affiliate chia cho "Active Member". **Thế nào là Active?** Chỉ cần đã tham
>    gia nhóm, hay phải có hoạt động gần đây? (Chúng tôi đang tạm dùng: có hoạt động trong
>    90 ngày.)
>
> 3. Một thành viên **đủ điểm Kim Cương nhưng trượt nhiệm vụ duy trì 4+4** trong quý thì
>    kết quả là gì — giữ hạng, tụt 1 bậc, hay tụt về theo số điểm? (Chúng tôi đang tạm
>    dùng: tụt đúng 1 bậc.)
>
> 4. Ký hiệu **"2+2 / 3+3 / 4+4"** nghĩa là *N giao dịch Cho hoàn tất + N referral*, đúng
>    không? Nếu khác thì là hai loại hoạt động nào?

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-09-15 | Lập lần đầu — 4 giả định + 6 mặc định |
