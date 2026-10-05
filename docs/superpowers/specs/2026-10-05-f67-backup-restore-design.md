# Thiết kế F67 — Sao lưu và phục hồi database

> **Trạng thái: đã chốt thiết kế, CHƯA viết mã.** Chốt 05/10/2026. Hai câu hỏi ở mục
> [Còn treo](#còn-treo) phải trả lời trước khi viết script.

## Mục tiêu

Gạch đầu dòng đầu tiên của Definition of Done Sprint 4 là *"Backup **và restore test** đã
chạy"*, và `deploy/PRODUCTION.md:34` đặt nó thành điều kiện tiên quyết: *"có kế hoạch backup
database và đã thử restore tối thiểu một lần trước khi nhận dữ liệu thật"*.

Đo 05/10: **không có một dòng script nào.** `pg_dump`/`pg_restore` không xuất hiện ở bất kỳ
file thực thi nào trong repo — chỉ trong 7 file tài liệu. Không có job cron nào cho backup
(crontab hiện có 14 dòng, không dòng nào là backup).

Thiết kế này nhằm: bản sao database nằm ngoài host, phục hồi được, và **có phép kiểm tự động
chứng minh nó phục hồi được** thay vì chỉ tin như vậy.

## Bối cảnh đo được

- Postgres chạy **trong container** `postgis/postgis:16-3.4`, chỉ publish `127.0.0.1:15432`
  (`deploy/docker-compose.yml`). Host **không** có `postgresql-client`.
- `deploy/bootstrap.sh:70` cài `ca-certificates curl gnupg` + bộ `docker-ce`. Không có
  `rclone`, không có `age`.
- Dự án đã dùng **Cloudflare R2** cho media (`deploy/STAGING.md:306`), nên tài khoản R2 đã có.
- Lối nhà cho script vận hành đã rõ qua 3 script trong `deploy/cron/`: `#!/usr/bin/env bash`,
  `set -Eeuo pipefail`, docblock tiếng Việt giải thích **vì sao** (kể cả vì sao KHÔNG làm cách
  khác), cấu hình qua `${CHANTAM_*:-mặc định}`, báo lỗi qua `send-alert.sh "<tiêu đề>" "<thân>"`.

## Quyết định

Bốn quyết định do Bên A chốt 05/10, kèm lý do để lượt sau không phải đoán lại.

### QĐ-1 · Đích off-site: Cloudflare R2, bucket RIÊNG

Tái dùng tài khoản đã có, và R2 không tính phí egress nên một lượt restore khẩn cấp không
phát sinh hoá đơn bất ngờ.

Bucket **tách khỏi bucket media**. Một bản backup nằm cùng bucket với dữ liệu nó bảo vệ thì
một lượt xoá sai tay cuốn cả hai.

> **Sửa một điều tôi nói sai lúc đề xuất:** tôi từng nói "token chỉ-ghi". R2 **không** cấp
> token ở độ mịn đó — các mức là *Object Read & Write* hoặc *Object Read only*, và retention
> cần quyền xoá nên buộc phải *Read & Write*. Nghĩa là token trên host **đọc được** nội dung
> bucket backup. Hệ quả: mã hoá (QĐ-3) không còn là "một lớp phòng thêm" mà là **lớp duy nhất**
> ngăn kẻ chiếm được host đọc dữ liệu người dùng từ các bản backup.

### QĐ-2 · Nhịp hằng ngày, giữ 7 bản ngày + 4 bản tuần

Mất tối đa một ngày dữ liệu. 11 file trên R2 cho phép lùi lại gần một tháng mà không trả tiền
cho 30 bản.

Phù hợp giai đoạn chưa có dữ liệu thật. Tăng lên mỗi 6 giờ về sau là **sửa một dòng cron**,
không phải viết lại.

### QĐ-3 · Mã hoá bằng khoá CÔNG KHAI, khoá riêng không nằm trên host

Host chỉ giữ recipient công khai, nên kẻ chiếm được host không đọc được **bất kỳ** bản backup
nào, kể cả bản nó vừa tạo.

Đánh đổi thật, phải ghi ra: **mất khoá riêng là mất toàn bộ backup.** Nên lượt diễn tập phục
hồi định kỳ (mục [Diễn tập](#diễn-tập-khoá-riêng)) không chỉ kiểm bản dump — nó kiểm **khoá
còn dùng được**.

### QĐ-4 · Restore test tự động hằng tuần, kiểm TRƯỚC khi mã hoá

Đây là cách gỡ một mâu thuẫn: restore test tự động muốn giải mã, nhưng để khoá riêng trên host
thì mất đúng cái lợi của QĐ-3.

Thứ tự **dump → verify → mã hoá → đẩy** làm bản dump được chứng minh phục hồi được *trước khi*
nó được mã hoá. Nên khoá riêng không cần có mặt trên host mà vẫn có phép kiểm tự động chứng
minh dump dùng được.

Phần duy nhất không được kiểm tự động là **giải mã**, và nó được phủ bằng diễn tập tay.

## Kiến trúc — bốn script

Ranh giới chia theo **mức tin cậy của khoá**, không theo chức năng.

| Script | Chạy bởi | Cần khoá riêng | Việc |
| --- | --- | :-: | --- |
| `backup-database.sh` | cron, hằng ngày, không người trông | **Không** | Điều phối 6 bước |
| `verify-dump.sh <file>` | script trên, và gọi tay được | **Không** | Restore một dump vào database **tạm** trong container, chạy bất biến, drop |
| `check-backup-fresh.sh` | cron, hằng ngày | **Không** | Công tắc người chết — báo khi bản mới nhất trên R2 quá cũ |
| `restore-database.sh` | **người**, khi có sự cố | **Có** | Tải từ R2, giải mã, restore vào đích chỉ định |

**Vì sao `restore-database.sh` tách riêng:** nó là script duy nhất đụng khoá riêng. Gộp vào
script cron chạy mỗi đêm nghĩa là đoạn xử lý khoá nằm sẵn trong một file được gọi tự động —
một lượt sửa cẩu thả sau này là khoá bị đọc ở ngữ cảnh không ai định.

**Vì sao `verify-dump.sh` tách riêng chứ không là một hàm:** nó phải dùng được **một mình**
trên một file dump bất kỳ. Khi cần biết một bản tải từ R2 về còn sống không, không nên phải
chạy cả lượt backup để biết.

**Vì sao `check-backup-fresh.sh` tồn tại:** xem [Công tắc người chết](#công-tắc-người-chết).

## Luồng dữ liệu

### Định dạng và tên

`pg_dump -Fc` (custom format). Đã nén sẵn bằng zlib nên **không cần bước `gzip` riêng**, và
`pg_restore` đọc được chọn lọc từng bảng — thứ rất đáng có lúc 2 giờ sáng khi chỉ cần cứu một
bảng.

```text
daily/chantam-20261005.dump.age      ← giữ 7 bản mới nhất
weekly/chantam-20261005.dump.age     ← giữ 4 bản mới nhất, tạo vào Chủ nhật
```

Chủ nhật, sau khi đẩy vào `daily/`, copy **remote → remote** sang `weekly/`. Không tải lên hai
lần.

### Sáu bước của `backup-database.sh`

1. **Tiền kiểm** — container postgres trả `pg_isready`; có `age` và `rclone`; đủ biến môi
   trường; còn chỗ đĩa. Thiếu gì thì báo và dừng **trước khi** tạo file rác.
2. **Dump** — `docker compose exec -T postgres pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"`
   ra file tạm trên host, mode `0600`.

   Chạy **bên trong container** là chủ ý: host không cần `postgresql-client`, và không bao giờ
   có chuyện `pg_dump` 17 trên host gặp server 16 rồi hỏng giữa đường.
3. **Verify** — gọi `verify-dump.sh` trên đúng file vừa tạo.
4. **Mã hoá** — khoá công khai → `.dump.age`.
5. **Đẩy** — lên `daily/`; Chủ nhật copy remote→remote sang `weekly/`.
6. **Dọn bản cũ** — chỉ sau khi đã **xác nhận bản mới có mặt trên remote**.

### Ba quy tắc trong đó là quyết định, không phải thứ tự tuỳ ý

**Bước 3 đỏ thì DỪNG, không đẩy.** Đẩy một bản không phục hồi được lên R2 rồi xoá bản cũ theo
retention là tự tay đổi một bản tốt lấy một bản hỏng. Thà hôm nay không có bản mới còn hơn mất
bản cũ.

**Retention đếm theo SỐ BẢN, không theo tuổi.** Luật "xoá bản quá 7 ngày" mà backup ngừng chạy
hai tuần sẽ xoá sạch, để lại số không — đúng lúc cần nó nhất. Luật "giữ 7 bản mới nhất" thì
backup có ngừng bao lâu cũng còn 7 bản cuối dùng được.

**Xoá sau khi xác nhận, không xoá trước.** Đẩy trượt rồi xoá thành công là mỗi ngày bớt một bản.

### `flock` quanh toàn script

Dump chậm hơn dự kiến mà lượt sau đã tới thì hai tiến trình cùng ghi, cùng dọn — và retention
chạy song song có thể xoá quá tay. Khoá file làm việc chồng lượt thành **không thể**, không
phải chuyện hiếm gặp.

## Phép kiểm bất biến của `verify-dump.sh`

Restore vào một database **tạm trong cùng container** nên phiên bản và PostGIS khớp tuyệt đối,
miễn phí. Sau đó:

1. So **số hàng các bảng trụ** giữa bản gốc và bản restore.
2. PostGIS gọi được (`SELECT ST_Y(ST_MakePoint(1, 2))`).
3. Đủ số bảng.

Rồi drop database tạm.

**Vì sao bất biến quyết định đạt/không đạt, chứ không phải mã thoát của `pg_restore`:**
`pg_restore` trả mã khác 0 cả khi chỉ là cảnh báo, và database PostGIS hay sinh cảnh báo quanh
`spatial_ref_sys`. Một allowlist cảnh báo "lành" sẽ mục theo thời gian; so số hàng thì không.

Mã thoát và stderr của `pg_restore` **vẫn** được ghi log và đính vào cảnh báo — chúng là dữ
kiện điều tra, chỉ không phải tiêu chí phán quyết.

## Cảnh báo

| Tình huống | Hành vi |
| --- | --- |
| Tiền kiểm thiếu công cụ / biến / chỗ đĩa | Báo động, dừng — lần đầu cấu hình sai phải ồn |
| `pg_dump` thất bại | Báo động |
| **Verify thất bại** | Báo động kèm stderr `pg_restore` **và tên bảng lệch số hàng**; không đẩy, không xoá |
| Mã hoá thất bại | Báo động |
| Đẩy R2 thất bại | Báo động; **không xoá bản cũ** |
| Dọn bản cũ thất bại | Báo động, nhưng lượt backup tính **đạt** — bản mới đã an toàn, hậu quả chỉ là tốn chỗ |
| Mọi bước đạt | **Im lặng** |

Dòng cuối là chủ ý. Báo "backup xong" mỗi đêm là 365 tin một năm, và người nhận sẽ lọc chúng
vào thư mục không đọc — rồi lọc luôn tin thật.

### Công tắc người chết

Im lặng khi đạt tạo ra đúng một lỗ: nếu cron bị gỡ, project đổi tên, hay đĩa hết chỗ đến mức
cron không chạy nổi, thì **không gì đỏ cả** — vì không gì chạy. Im lặng lúc đó trông y hệt im
lặng lúc thành công.

`check-backup-fresh.sh` chạy hằng ngày, vài giờ sau cửa sổ backup: hỏi R2 bản mới nhất trong
`daily/` bao nhiêu tuổi, quá ngưỡng (mặc định 36 giờ) thì báo động.

Nó **không phụ thuộc script backup còn chạy** để nói rằng script backup đã ngừng chạy — đúng
lập luận `deploy/cron/check-health.sh` đã dùng cho service.

### Phụ thuộc phải nói rõ: F68 chưa xong

Mọi cảnh báo trên đi qua `send-alert.sh`, và **`CHANTAM_CRON_ALERT_URL` hiện chưa được đặt**
(phần còn treo của F68). Tới khi chốt kênh gửi, các cảnh báo này rơi vào
`alerts-chua-gui-duoc.log` thay vì tới tay người nhận.

Nó hỏng **lộ ra** chứ không hỏng im lặng — nhưng **F67 chỉ thật sự có tác dụng sau khi F68 có
URL.**

## Cái giá đã biết và chấp nhận

**Cửa sổ dump chưa mã hoá trên đĩa host.** Từ bước 2 đến bước 4, bản dump nằm trên đĩa ở dạng
đọc được — tức số điện thoại, địa chỉ và toạ độ nhà của người dùng. Đây là cái giá bắt buộc của
QĐ-4 (verify trước khi mã hoá), và không có cách tránh.

Giảm nhẹ: file `0600` trong thư mục `0700` của user `deploy`, và `trap ... EXIT` xoá nó kể cả
khi script chết giữa đường. **Không khử được, chỉ thu hẹp.**

## Kế hoạch kiểm chứng

Đo trên máy phát triển 05/10: `pg_dump`/`pg_restore`/`initdb` **17.6 đầy đủ**, nhưng **không có
PostGIS**, Docker daemon **không chạy**, và không có `rclone`/`age`/`flock`. `gpg 2.4.9` có.

### Tầng 1 — thật, chạy được trên máy phát triển

Dựng cụm PG17 tạm bằng `initdb`, tạo lược đồ có dữ liệu, `pg_dump -Fc` thật, `pg_restore` thật
vào database tạm, so số hàng. Chứng minh **phần lõi quyết định đạt/không đạt** của
`verify-dump.sh` bằng công cụ thật.

Giới hạn: PG17 không phải PG16, và không có PostGIS — nhánh `spatial_ref_sys` và phép kiểm
`ST_*` **không** được chứng minh ở tầng này.

### Tầng 2 — hợp đồng bằng mock, `scripts/backup-restore.spec.sh`

Mock `docker`, `rclone`, `age` theo lối `scripts/smoke-docs-policy.spec.sh` đang mock `curl`.

> Bài học 05/10, ghi ở đây vì nó vừa làm CI đỏ: **mock phải tôn trọng cờ thật.** Mock `curl`
> không hiểu `-o <file>` nên bên gọi luôn đọc được chuỗi rỗng. Mock nào ở đây cũng phải nhận
> đúng cờ mà script thật truyền.

Bốn điều phải chứng minh, **mỗi điều kèm một lượt tái lập lỗi** để biết phép kiểm thật sự bắt
được:

1. Verify đỏ → **không** gọi `rclone` lần nào, **không** xoá gì.
2. Đẩy đỏ → **không** xoá bản cũ.
3. Retention giữ đúng 7 `daily/` và 4 `weekly/`, và xoá đúng bản **cũ nhất**.
4. `check-backup-fresh.sh` đỏ khi bản mới nhất quá 36 giờ, xanh khi trong hạn.

### Tầng 3 — chỉ host chứng minh được

Lớp `docker compose exec`, bất biến PostGIS, `age` thật, R2 thật, `flock`.

Checklist trong `deploy/PRODUCTION.md` để chạy đúng một lượt trên host và **ghi lại kết quả** —
đó chính là gạch DoD *"Backup và restore test đã chạy"*.

**F67 KHÔNG được ghi ✅ trước khi lượt đó chạy.** Trong `docs/SPRINT-PLAN.md` nó là 🟡 kèm đúng
câu "còn thiếu lượt chạy thật trên host".

### Diễn tập khoá riêng

Thứ duy nhất không được phủ bởi tầng nào ở trên là **giải mã**. Một lượt diễn tập tay định kỳ
(đề xuất: mỗi quý, và bắt buộc một lượt trước khi nhận dữ liệu thật): tải một bản từ R2, giải
mã bằng khoá riêng, `verify-dump.sh`, ghi biên bản.

Đây đồng thời là phép kiểm **khoá riêng còn dùng được** — thứ mà QĐ-3 làm thành điểm hỏng đơn
lẻ.

## File sẽ thêm và sửa

| File | |
| --- | --- |
| `deploy/cron/backup-database.sh` | mới |
| `deploy/cron/verify-dump.sh` | mới |
| `deploy/cron/check-backup-fresh.sh` | mới |
| `deploy/cron/restore-database.sh` | mới |
| `scripts/backup-restore.spec.sh` | mới — hợp đồng tầng 2 |
| `deploy/cron/chantam.crontab` | thêm 2 dòng, lệch phút khỏi 14 dòng đang có |
| `deploy/cron/README.md` | mục backup |
| `deploy/bootstrap.sh` | cài `age` và `rclone` |
| `deploy/PRODUCTION.md` | thay điều kiện tiên quyết ở `:34` bằng quy trình thật + checklist tầng 3 + diễn tập |
| `docs/SPRINT-PLAN.md`, `docs/FEATURES.md` | trạng thái F67 |

## Còn treo

Hai câu phải trả lời trước khi viết script. Cả hai **thu hẹp tầng 3**.

### (a) Có bật Docker Desktop trên máy phát triển không?

Bật thì tầng 1 chạy được trên chính image `postgis/postgis:16-3.4` của production — đúng phiên
bản, đúng PostGIS, và cả lớp `docker compose exec` cũng được chứng minh. Tầng 3 co lại gần như
chỉ còn `age` và R2 thật.

Đây là khác biệt giữa *"tôi tin nó chạy"* và *"tôi đã thấy nó chạy"*.

### (b) `age` hay `gpg`?

Bên A chọn "age/gpg khoá công khai", nên cả hai trong phạm vi đã duyệt. Chúng khác nhau thật:

- **`age`** — `age -r age1xyz...` cần **đúng một chuỗi recipient**: không keyring, không trạng
  thái gì trên host. Ít thứ hỏng nhất trong một job cron. Nhưng phải thêm vào `bootstrap.sh`,
  và **không kiểm được trên máy phát triển hiện tại**.
- **`gpg`** — `bootstrap.sh:70` **đã cài `gnupg`**, và máy phát triển có `gpg 2.4.9` nên bước mã
  hoá kiểm được thật ở tầng 1. Đổi lại: cần keyring của user `deploy` trên host, tức thêm trạng
  thái phải quản, và `gpg` có thể đòi tương tác nếu cấu hình trượt.

**Đề xuất: `age`** cho host production — "không trạng thái" quan trọng hơn trong một script chạy
không người trông, và một binary tĩnh thêm vào bootstrap là chi phí một lần.

## Nối vào Sprint 4

| DoD Sprint 4 | Mục này phủ |
| --- | --- |
| "Backup **và restore test** đã chạy" | Toàn bộ, sau khi chạy tầng 3 |
| "Monitoring/alerting có hiệu lực" | Một phần — `check-backup-fresh.sh`; còn chờ F68 có URL |
