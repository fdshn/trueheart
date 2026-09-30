# Lịch job nền — runbook

Core **cố ý không dựng scheduler nào trong tiến trình**. Hai bản sao service cùng
chạy `@nestjs/schedule` sẽ chạy mọi job hai lần, và không có gì ngăn được điều đó
từ bên trong. Lịch nằm ngoài là chỗ duy nhất biết "chỉ một máy chạy cái này".

## Cài đặt

```bash
# Trên VPS, dưới user deploy
sudo install -o deploy -g deploy -d /var/log/chantam

# Bit thực thi đã được git giữ từ 30/09, nên bản checkout mới không cần bước
# này. Giữ lại cho những máy đã clone trước đó — và `chmod` trên file vốn đã
# +x thì không hại gì.
chmod +x /home/deploy/chantam/deploy/cron/*.sh

# Sửa CHANTAM_DIR trong file crontab cho khớp môi trường, rồi:
sudo cp deploy/cron/chantam.crontab /etc/cron.d/chantam
sudo chmod 644 /etc/cron.d/chantam
sudo cp deploy/cron/chantam-cron.logrotate /etc/logrotate.d/chantam-cron
```

> **Mỗi môi trường một file.** Staging và production ở hai thư mục project khác
> nhau nên `CHANTAM_DIR` khác nhau. Dùng chung một file `/etc/cron.d/chantam` cho
> cả hai là chạy job của staging bằng dữ liệu production hoặc ngược lại.
>
> **Chỉ cài trên MỘT máy.** `gift:settle-rewards` có khoá chống trùng nên chạy hai
> lần không cộng điểm hai lần, nhưng `notify:reminders` chạy song song hai máy vẫn
> đẻ hai lượt đọc và hai lượt ghi vô ích.

## Lịch

Giờ Việt Nam (`CRON_TZ=Asia/Ho_Chi_Minh`). Hiểu theo UTC thì lời nhắc tới máy
người dùng lúc 3 giờ chiều, và `post:expire` cắt ngày lệch 7 tiếng.

| Giờ | Lệnh | Tần suất |
| --- | --- | --- |
| `:19` mỗi giờ | `point:reconcile` | hằng giờ |
| `:37` mỗi giờ | `selection:auto-select` | hằng giờ |
| 00:11 | `post:expire` | hằng ngày |
| 02:07 | `transaction:autocomplete` | hằng ngày |
| 02:23 | `gift:settle-rewards` | hằng ngày |
| 03:31 | `rank:evaluate` | hằng ngày |
| 03:47 | `chat:purge` | hằng ngày |
| 04:09 | `notification:purge` | hằng ngày |
| 08:17 | `notify:reminders` | hằng ngày |
| CN 04:41 | `feed:reconcile-counts` | hằng tuần |
| T2 04:13 | `accuracy:reconcile` | hằng tuần |
| T3 05:29 | `media:sweep-orphans` | hằng tuần, **chạy khô** |

### Vì sao mỗi cái ở giờ đó

**`media:sweep-orphans` chạy KHÔ theo lịch.** Nó xoá object không hoàn tác được,
và danh sách nguồn key trong mã là thứ duy nhất đứng giữa nó và ảnh thật — thiếu
một dòng ở đó là xoá sạch ảnh của cả một phân hệ. Lịch chỉ để báo con số hằng
tuần; thấy bất thường thì người thật xem rồi mới chạy tay:

```bash
docker compose exec -T core node dist/infrastructure/cli/media-sweep-orphans.cli.js --apply
```

**`point:reconcile` mỗi giờ.** Nó vá phần thưởng xác minh SĐT bị thiếu khi tiến
trình chết giữa hai bước. Người vừa xác minh xong mà không thấy điểm sẽ nghĩ hệ
thống hỏng, và họ **không có cách nào xác minh lại** để được thưởng.

**`selection:auto-select` mỗi giờ.** Đồng hồ hết lúc 14 giờ mà tới 2 giờ sáng hôm
sau mới chốt là để người xin chờ thêm 12 tiếng **sau khi** đã hết hạn — họ nhìn
thấy đồng hồ về 0 và không có gì xảy ra.

**`post:expire` ngay sau nửa đêm.** Hạn của bài tính theo ngày, nên chạy đầu ngày
là đúng ranh giới.

**`transaction:autocomplete` trước `gift:settle-rewards`.** Lượt vừa được cron đóng
cũng vào tầm ngắm của vòng trả thưởng cùng đêm.

**`rank:evaluate` sau `gift:settle-rewards`.** Điểm vừa cộng được tính vào lần xét
hạng, và khoản trừ do trượt nhiệm vụ cũng kéo xét hạng lại ngay trong lượt đó.

**`notify:reminders` buổi SÁNG.** Một lời nhắc tới lúc người ta đang ngủ sẽ nằm
dưới hàng chục thông báo khác khi họ mở máy.

**Hai job đối soát hằng tuần.** Số đếm feed chỉ lệch khi có lỗi ghi, và lệch một
tuần không làm ai mất gì. `accuracy:reconcile` chỉ có việc sau khi Admin đổi ngưỡng
— chạy tay ngay sau mỗi lần đổi thì tốt hơn là chờ tới thứ Hai.

**Phút lẻ, không phải `:00`.** Mọi job đặt ở `:00` sẽ cùng đánh vào database một
lúc. Phút lẻ cũng khiến hai job không bao giờ trùng nhau ở cùng một phút.

## Job cấp bách nhất

`gift:settle-rewards`. **Không chạy là điểm của người tặng treo vô hạn** mỗi khi
người nhận không đánh giá — mà đó là phần lớn trường hợp. Nếu phải chọn một job để
canh alert, chọn cái này.

## Đọc exit code

| Mã | Nghĩa |
| --- | --- |
| `0` | Xong, không có gì đáng nói |
| `1` từ `transaction:autocomplete` | **Không phải sự cố.** Có lượt bị giữ vì báo xấu chưa xử. Vào hàng đợi Admin xử báo xấu, lượt sẽ tự đóng ở lần chạy sau |
| `1` từ `*:reconcile --dry-run` | Phát hiện số liệu lệch. Chạy lại không có `--dry-run` để sửa |
| `1` khác | Sự cố thật. Xem `/var/log/chantam/<tên>.log` |

> Vài CLI cố ý thoát khác 0 khi **phát hiện việc cần biết**. Cron gửi mail/alert
> đúng những lượt đó, và đó chính là điều ta muốn — im lặng mới là vấn đề.

## Chạy tay một lệnh

```bash
cd /home/deploy/chantam-production

# Xem trước, không sửa gì
docker compose exec -T core node dist/infrastructure/cli/accuracy-reconcile.cli.js --dry-run

# Chạy thật
/home/deploy/chantam/deploy/cron/run-cli.sh /home/deploy/chantam-production accuracy-reconcile
```

## Khi Core đang chết

`docker compose exec` thất bại và cron báo lỗi. Đó là hành vi đúng: `run --rm` sẽ
dựng container mới và chạy được, nghĩa là **job vẫn xanh trong khi service đang
chết** — và không ai biết.

## Chưa có

- ✅ **Alert đã nối** (30/09) — chỉ còn điền URL. `run-cli.sh` gọi
  `send-alert.sh` khi job đỏ, và nó POST một JSON tới `$CHANTAM_CRON_ALERT_URL`.

  **Việc duy nhất cần làm để bật:** đặt biến đó trong môi trường của cron.

  ```bash
  # Trong crontab, ngay dưới CHANTAM_DIR:
  CHANTAM_CRON_ALERT_URL=https://hooks.slack.com/services/xxx/yyy/zzz
  ```

  Payload mang **cả `text` lẫn `content`** nên webhook của Slack, Mattermost hay
  Discord đều đọc được mà không phải sửa script — mỗi bên bỏ qua khoá nó không
  biết. Telegram cần hình khác (`chat_id` trên query string); nếu chốt Telegram thì
  thêm một nhánh, và chưa thêm sẵn vì một nhánh không ai dùng là một nhánh không ai
  thử.

  **Không dùng `MAILTO`** vì cron luôn đi qua MTA cục bộ, mà một VPS chỉ chạy
  docker-compose thường chưa cài MTA — lúc đó cron ghi "no MTA, discarding output"
  rồi bỏ, bất kể `MAILTO` là gì. Gửi tới Gmail còn cần SPF/DKIM; thiếu thì bị chặn
  im lặng, tức **có alert mà không biết mình không nhận được alert**. Và credential
  SMTP sẽ tồn tại ở hai nơi: app trong `system_configs`, hệ thống trong cấu hình
  MTA. Một lượt `curl` không cần thứ nào trong đó.

  **Chưa đặt URL thì KHÔNG im lặng.** `send-alert.sh` ghi vào
  `/var/log/chantam/alerts-chua-gui-duoc.log` và trả mã khác 0. Một hệ báo động
  trông như đang chạy mà không gửi gì là đúng cái bệnh đã làm `post:expire` chết ba
  tháng. Cùng lý do, lượt `curl` thất bại cũng được ghi vào đó — cảnh báo về việc
  cảnh báo hỏng không đi qua cùng kênh đó được.

  **Nhịp tim hằng tuần** (thứ Hai 09:07) để im lặng có nghĩa. Mọi dòng khác chỉ gửi
  khi job đỏ, nên "cả tuần không có gì" vừa có thể là mọi thứ tốt, vừa có thể là
  đường cảnh báo đã chết. Không thấy nhịp tim nghĩa là nó đã chết. Hằng tuần chứ
  không hằng ngày: một dòng "vẫn ổn" mỗi ngày là thứ người ta học cách bỏ qua trong
  hai tuần.

  **Thử trước khi tin:** `bash scripts/test-cron-alert.sh` chạy thật qua HTTP —
  dựng một webhook cục bộ, kiểm payload là JSON hợp lệ sau khi nhét log nhiều dòng
  có dấu ngoặc kép, gạch chéo ngược và tab, kiểm cả hai nhánh thất bại. Nó đã bắt
  được hai lỗi thật lúc viết: một dấu tab làm payload hỏng, và `python` đọc stdin
  bằng code page của hệ nên mọi chữ có dấu ra mojibake.

  Cần `jq` HOẶC `python` trên host để đóng gói JSON. Thiếu cả hai thì script từ
  chối gửi và ghi lại — thà không gửi hơn là gửi một payload hỏng rồi tưởng đã gửi.

- ✅ **KHÔNG cần job kiểm Active Member** — chốt 29/09, nên đừng thêm.

  "Active Member" là điều kiện lọc lúc chia thưởng affiliate, không phải trạng thái
  được đánh dấu: `status = ACTIVE` và `last_active_at` trong 90 ngày thì có tên trong
  danh sách chia của kỳ đó. Không ai bị đánh dấu nên không có hệ quả nào giáng xuống
  người dùng.

  Một job quét toàn bảng rồi ghi cột `is_active` sẽ tạo con số THỨ HAI nói về cùng một
  sự thật, và nó sẽ lệch: người mở app hôm qua vẫn mang cờ `false` từ lần job chạy
  tuần trước, rồi mất phần chia. Đọc mốc trực tiếp lúc cần dùng thì không lệch được.

  Phần buộc phải đúng ngay — ghi `last_active_at` ở **mọi** lần cấp phiên, không riêng
  đăng nhập — thì đã đúng và đã có canh. Xem `docs/diagram/17-jobs.md` mục 2.

### Đã có, từng ghi thiếu ở đây

- ✅ **Dọn object mồ côi** — `media:sweep-orphans`, hằng tuần `29 5 * * 2`, chạy
  **KHÔ** (không `--apply`). Chỉ báo con số là lựa chọn đúng cho một job xoá thứ
  không hoàn tác được; muốn xoá thật thì chạy tay sau khi đọc con số.
- ✅ **Nhắc bài sắp hết hạn** — nằm trong `notify:reminders` từ đợt 10-notification.
- ✅ **`notification:purge`** — 04:09 hằng ngày, thêm vào crontab 29/09. Nó được viết
  từ đợt 10 và **vẽ vào biểu đồ lịch** của `17-jobs.md`, nhưng không ai xếp lịch
  thật: ngoài production hộp thư chưa bao giờ được dọn trong khi tài liệu nói đã
  xếp. Dạng lỗi tệ hơn quên làm, vì nó trông như đã làm.
