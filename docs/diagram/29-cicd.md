# 29 · CI/CD & triển khai

Trạng thái: ✅ **pipeline đã chạy**. 🟡 Một số điều kiện production chưa đủ.

## 29.1 Pipeline CI

```mermaid
flowchart LR
    A[Push / PR] --> B[Cài đặt dependency]
    B --> C[Lint]
    C --> D[Kiểm tra định dạng]
    D --> E[Build toàn bộ package]
    E --> F[Unit test — 709 test]
    F --> G["Bảng tra mã lỗi còn khớp mã nguồn"]
    G --> H["Xác nhận build không làm bẩn working tree"]

    I[Job thứ hai] --> J[Khởi động MinIO]
    J --> K[Chạy migration]
    K --> L["Xác nhận schema do migration dựng<br/>khớp với entity"]

    style G fill:#e7f3ff
    style L fill:#e7f3ff
```

> **Vì sao có bước "build không làm bẩn working tree".** Nếu build sinh ra file mà không ai
> commit, thì máy CI và máy lập trình viên đang chạy hai thứ khác nhau — và không ai biết.
>
> **Vì sao xác nhận schema khớp entity.** Sửa entity mà quên viết migration là lỗi im lặng:
> local chạy được vì `synchronize` đã dựng cột, production thì không có cột đó.

## 29.2 Triển khai

```mermaid
sequenceDiagram
    autonumber
    actor D as Người triển khai
    participant GH as GitHub Actions
    participant V as VPS

    D->>GH: Chạy deploy, chọn environment
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

    style S fill:#fff3cd
```

## 29.4 Bốn workflow

| Workflow | Làm gì |
| --- | --- |
| `ci.yaml` | Lint, format, build, test, migration, schema drift |
| `deploy.yaml` | Triển khai có cổng kiểm tra và rollback |
| `release.yaml` | Đóng gói bản phát hành |
| `codeql.yaml` | Quét bảo mật mã nguồn |
| `security-audit.yaml` | Quét lỗ hổng dependency |

## 29.5 Điều kiện trước khi gọi production-ready

```mermaid
flowchart TD
    A{Production-ready?} --> B["✅ CI đầy đủ"]
    A --> C["✅ Deploy có rollback"]
    A --> D["🟡 Email thật đã thử staging"]
    A --> E["⛔ SMS/Zalo adapter"]
    A --> F["⛔ R2 bucket/key/CORS/CDN"]
    A --> G["⛔ Backup RESTORE test"]
    A --> H["⛔ Global rate limit"]
    A --> I["⛔ Monitoring / alerting"]
    A --> J["⛔ Chặn xoá tài khoản khi còn lượt trao"]
    A --> K["⛔ Ledger cho MỌI đường cộng điểm"]
    A --> L["✅ Lịch cron cho 9 CLI"]

    style E fill:#ffe6e6
    style F fill:#ffe6e6
    style G fill:#ffe6e6
    style H fill:#ffe6e6
    style I fill:#ffe6e6
    style J fill:#ffe6e6
    style K fill:#ffe6e6
```

> **`backup` không có `restore test` thì không phải backup**, nó chỉ là một thư mục file nén
> mà chưa ai chứng minh được là mở ra dùng lại được.

## Chỗ cần soát

1. ✅ **Lịch cron đã có** — [`deploy/cron/`](../../deploy/cron/README.md). ⛔ Nhưng alert chưa nối vào kênh người thật đọc.
2. ⛔ **Chưa có monitoring/alerting.** Service chết lúc 2 giờ sáng thì sáng ra mới biết.
3. ⛔ **Restore test chưa từng chạy.**
4. **Cổng kiểm tra sau triển khai kiểm gì?** Cần soát xem nó có đủ sâu để bắt được lỗi DI
   kiểu đã làm cả bảy CLI chết hay không.
5. **Chưa có smoke test chạy CLI** trong pipeline.
