# 29 · CI/CD & triển khai

Trạng thái: ✅ **pipeline đã chạy**. 🟡 Một số điều kiện production chưa đủ.

## 29.1 Pipeline CI

`ci.yaml` có **ba job** chạy song song trên mỗi push / PR:

```mermaid
flowchart LR
    subgraph V["verify — lint, build, unit test"]
        V1[npm ci] --> V2["lint:check · format:check"]
        V2 --> V3[Build toàn bộ package]
        V3 --> V4["typecheck:checks<br/>script test/*.check.ts"]
        V4 --> V5[Unit test]
        V5 --> V6["smoke-cli.spec.sh<br/>hợp đồng chạy qua stdin"]
        V6 --> V7["docs:errors:check<br/>bảng mã lỗi khớp nguồn"]
        V7 --> V8["docs:routes:check<br/>API-ROUTES.md khớp controller"]
        V8 --> V9["git diff --exit-code<br/>build không làm bẩn working tree"]
    end

    subgraph I["integration — PostGIS + Redis + MinIO thật"]
        I1[Build · MinIO] --> I2["migration:run trên database trắng<br/>+ kiểm postgis & bảng migrations"]
        I2 --> I3["migration:backfill-check"]
        I3 --> I4["test:config-inventory"]
        I4 --> I5["smoke-cli.sh — chạy THẬT 15 CLI"]
        I5 --> I6["smoke-docs-policy · test:returning<br/>test:lifecycle · test:concurrency"]
        I6 --> I7["MỌI script test:* còn lại<br/>danh sách tự lấy từ package.json"]
        I7 --> I8["test-cron-alert.sh"]
        I8 --> I9["seed demo → khởi động service<br/>→ test:chat-e2e → smoke-test.sh"]
    end

    subgraph D["docker — Dockerfile và image"]
        D1["nginx -t thật"] --> D2["Dockerfile khớp cây dependency"]
        D2 --> D3["Build image → chạy ở production<br/>tự migrate → /health"]
        D3 --> D4["smoke-test.sh --read-only"]
    end

    style V8 fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
    style I5 fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

> **Vì sao có bước "build không làm bẩn working tree".** Nếu build sinh ra file mà không ai
> commit, thì máy CI và máy lập trình viên đang chạy hai thứ khác nhau — và không ai biết.
>
> **Vì sao migration chạy trên database TRẮNG.** Không tạo extension bằng tay: migration đầu
> tiên phải tự dựng được postgis/unaccent/pg_trgm, nên bước này đồng thời là phép kiểm migration
> đủ sức dựng schema từ số không. `backfill-check` thì dựng database nháp riêng có dữ liệu cũ để
> câu backfill thật sự gặp dữ liệu.

## 29.2 Triển khai

```mermaid
sequenceDiagram
    autonumber
    actor D as Người triển khai
    participant GH as GitHub Actions
    participant V as VPS

    D->>GH: Push main → staging · tag v* → production<br/>(hoặc workflow_dispatch chọn môi trường)
    GH->>GH: release.yaml build + đẩy image lên GHCR
    GH->>GH: gọi deploy.yaml (workflow_call)
    GH->>GH: Môi trường đã bật chưa?
    GH->>GH: Credential của môi trường có đủ?
    GH->>GH: Nạp khoá SSH
    GH->>V: GHI LẠI image đang chạy (để rollback)
    GH->>V: Triển khai image mới
    GH->>V: Cổng kiểm tra sau triển khai
    alt Cổng kiểm tra KHÔNG qua
        GH->>V: ROLLBACK về image trước đó
        GH-->>D: ❌ Thất bại, đã quay lại bản cũ
    else Qua
        GH-->>D: ✅ Xong
    end
    GH->>GH: Dọn khoá SSH
```

> **Vì sao ghi lại image cũ TRƯỚC khi triển khai.** Ghi sau thì khi bản mới hỏng, không còn
> chỗ nào biết bản cũ là cái nào. Rollback phải là một đường đã dựng sẵn, không phải thứ đi
> tìm lúc đang cháy.

## 29.3 Hạ tầng

```mermaid
flowchart TB
    subgraph VPS
        N["Nginx + Certbot<br/>TLS, staging/prod tách path"]
        N --> C["Core API — Docker"]
        C --> P[(PostgreSQL + PostGIS)]
        C --> R[(Redis)]
        C --> S["R2 / S3 🟡"]
    end
    U[Client mobile/web] --> N

    style S fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

## 29.4 Sáu workflow

| Workflow | Làm gì |
| --- | --- |
| `ci.yaml` | Ba job `verify` · `integration` · `docker` — xem §29.1 |
| `deploy.yaml` | Workflow dùng lại (`workflow_call`): triển khai có cổng kiểm tra và rollback |
| `release.yaml` | Build và đẩy image lên GHCR rồi **tự gọi** `deploy.yaml`: push `main` → staging, tag `v*` → production; `workflow_dispatch` chọn tay môi trường |
| `codeql.yaml` | Quét bảo mật mã nguồn |
| `security-audit.yaml` | Quét lỗ hổng dependency |
| `mirror-images.yaml` | Sao ảnh hạ tầng của bên thứ ba về GHCR của chính repo. **Chạy tay**, cố ý không theo lịch — mirror là để ĐÓNG BĂNG một bản đã kiểm, không phải để lặng lẽ kéo bản mới về |

> **Vì sao phải có workflow mirror.** Ngày 24/09 `quay.io/minio/minio` bị chuyển sang riêng
> tư: pull ẩn danh trả 401 cho MỌI tag **và cả digest**, `docker.io/minio/minio` thì bị xoá
> hẳn, và CI đỏ toàn bộ dù không ai sửa gì. Máy nào còn ảnh trong cache vẫn chạy, nên chỉ
> runner sạch mới lộ ra.
>
> **Ghim digest không cứu được chuyện đó** — khi cả kho bị khoá thì digest cũng 401. Thứ duy
> nhất cứu được là giữ một bản sao ở nơi mình kiểm soát. Từ 29/09 compose ghim
> `ghcr.io/fdshn/trueheart-minio`, package để Public nên runner sạch kéo được mà không cần
> đăng nhập.
>
> **Workflow kiểm ảnh TRƯỚC khi đẩy**: dựng container, tạo bucket, `mc ls`. Sao một ảnh hỏng
> về kho của mình thì chỉ đổi chỗ lỗi — đúng cái bẫy `quay.io/minio/aistor/minio` giăng ra,
> nơi container sống và healthcheck trả 200 nhưng mọi thao tác S3 báo thiếu license.

## 29.5 Điều kiện trước khi gọi production-ready

```mermaid
flowchart TD
    A{Production-ready?} --> B["✅ CI đầy đủ"]
    A --> C["✅ Deploy có rollback"]
    A --> D["🟡 Email thật đã thử staging"]
    A --> E["⛔ SMS/Zalo adapter"]
    A --> F["⛔ R2 bucket/key/CORS/CDN"]
    A --> G["⛔ Backup RESTORE test"]
    A --> H["✅ Global rate limit<br/>GlobalRateLimitGuard 600/phút theo IP"]
    A --> I["✅ Monitoring / alerting<br/>send-alert · nhịp tim · check-health"]
    A --> J["✅ Chặn xoá tài khoản khi còn lượt trao"]
    A --> K["⛔ Ledger cho MỌI đường cộng điểm"]
    A --> L["✅ Lịch cron cho 15 CLI<br/>+ cảnh báo job đỏ"]

    style E fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style F fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style G fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style K fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
```

> **`backup` không có `restore test` thì không phải backup**, nó chỉ là một thư mục file nén
> mà chưa ai chứng minh được là mở ra dùng lại được.

## Chỗ cần soát

1. ✅ **Lịch cron và alert đều đã có** (30/09) — [`deploy/cron/`](../../deploy/cron/README.md).
   `send-alert.sh` POST tới `$CHANTAM_CRON_ALERT_URL`; chưa đặt URL thì ghi vào
   `alerts-chua-gui-duoc.log` và trả mã khác 0 thay vì im lặng. Nhịp tim hằng tuần để "không có
   cảnh báo" khác được với "đường cảnh báo đã chết". `scripts/test-cron-alert.sh` chạy trong CI.
2. ✅ **Đã có 30/09** — `deploy/cron/check-health.sh`, mỗi 5 phút, dùng đúng đường cảnh báo
   của `send-alert.sh`.

   Đây là healthcheck NGOÀI tiến trình: nó không phụ thuộc vào việc service còn sống để báo rằng
   service đã chết. Cần nó vì `run-cli.sh` chỉ báo khi một JOB đỏ, mà service chết thì không job
   nào đỏ — chúng chỉ không chạy được, và giữa hai lượt job là một khoảng nằm im không ai biết.

   Ba quyết định về NHỊP báo, mỗi cái vì một cách người ta bỏ qua cảnh báo:

   - **Chỉ báo sau 3 lượt thất bại liên tiếp.** Một lượt `curl` trượt vì mạng chớp hay vì
     container đang khởi động lại sau deploy — báo ngay là dạy người ta bỏ qua.
   - **Báo ĐÚNG một lần lúc chạm ngưỡng**, không lặp mỗi 5 phút. Một sự cố hai giờ sẽ gửi 24
     dòng giống nhau, và kênh sẽ bị tắt.
   - **Báo cả lúc hồi phục.** Thiếu nó thì người nhận không biết chuyện đã xong, và họ vào xem
     một sự cố đã tự khỏi — hoặc tệ hơn, tưởng nó vẫn đang xảy ra.

   `scripts/test-cron-alert.sh` canh cả bốn hành vi đó.
3. ⛔ **Restore test chưa từng chạy.**
4. ✅ **Đã đủ sâu 30/09.** Cổng nay có hai phần: `smoke-test.sh --read-only` qua HTTP, và tự
   kiểm cây DI của cả 15 CLI trên host qua SSH.

   Chốt cách chạy: **qua SSH trên host**, không ở runner — mã sống trong container ở đó, và
   `docker compose exec` cần chính máy đó. Script đẩy qua stdin nên không cần checkout trên host;
   deploy đẩy image chứ không đẩy source, nên một checkout cũ sẽ kiểm bằng danh sách CLI lỗi thời.

   Và **không chạy CLI ở chế độ thường** — xem [28](./28-architecture.md) mục 2 để biết vì sao.
5. ✅ **Đã có ở cả hai chỗ 30/09.** CI chạy `smoke-cli.sh` ở chế độ thường (database throwaway
   nên chạy thật được); `deploy.yaml` chạy nó với `CHANTAM_CLI_SELF_CHECK=1` trên host qua SSH,
   dùng `CHANTAM_CLI_RUNNER='docker compose exec -T core node'` vì mã chạy trong container.

   Một script, hai chế độ, một danh sách CLI — quan trọng vì hai danh sách sẽ trôi khỏi nhau, và
   `smoke-cli.sh` còn có phép kiểm "không CLI nào bị bỏ ngoài danh sách" để thêm CLI mới mà quên
   khai thì đỏ.
