# 28 · Kiến trúc & khởi động

Trạng thái: ✅ **đã hiện thực**.

## 28.1 Bốn tầng

```mermaid
flowchart TD
    subgraph I["infrastructure/ — biết công nghệ"]
        I1["controller/ — Fastify route"]
        I2["repository/ — SQL thật"]
        I3["persistence/ — TypeORM, migration"]
        I4["realtime/ — Socket.io"]
        I5["cli/ — 7 lệnh chạy một lần"]
    end
    subgraph A["application/ — điều phối"]
        A1["contracts/ — interface use case"]
        A2["implementations/ — logic nghiệp vụ"]
    end
    subgraph D["domain/ — thuần, không phụ thuộc"]
        D1["ports/repository — interface"]
        D2["ports/config · storage · realtime"]
        D3["exceptions/"]
    end
    subgraph L["core-lib/ — dùng chung, thuần"]
        L1["models/ — hàm tính thuần"]
        L2["dto/ · entities/ · consts/"]
    end

    I --> A --> D
    A --> L
    I --> L

    E["Mũi tên CHỈ đi một chiều:<br/>domain KHÔNG biết gì về infrastructure"] -.-> D

    style D fill:#3ca05021,stroke:#3f8f3f,stroke-width:1.5px
    style E fill:#f0f0f0,stroke:#8a8a8a,stroke-width:1.5px,color:#2b2b2b
```

> **Vì sao model thuần nằm ở `core-lib`.** `computeGiverAccuracy`,
> `normalizeGiverAccuracyConfig`, `renderNotificationTemplate` là hàm không đụng database,
> không đụng thời gian, không đụng mạng — nên test được bằng bảng đầu vào/đầu ra, không cần
> dựng gì.

## 28.2 Tiêm phụ thuộc bằng `Symbol`

```mermaid
flowchart LR
    A["export const IChatRepository = Symbol('IChatRepository')"] --> B["vừa là TYPE vừa là TOKEN"]
    B --> C["@Inject(IChatRepository)"]
    B --> D["{ provide: IChatRepository, useClass: ChatRepository }"]

    E["Dùng class làm token sẽ kéo<br/>hiện thực vào tầng domain"] -.-> A

    style A fill:#e7f3ff,stroke:#3d7ab8,stroke-width:1.5px,color:#0d2a4a
```

## 28.3 Khởi động HTTP

```mermaid
sequenceDiagram
    autonumber
    participant M as main.ts
    participant N as NestFactory
    participant A as AppModule
    participant DB as Postgres
    participant R as Redis

    M->>M: Nạp .env.local rồi .env
    M->>N: create(AppModule, FastifyAdapter)
    N->>A: ApplicationModule + InfrastructureModule
    A->>DB: Mở connection pool
    A->>R: Kết nối
    A->>A: Đăng ký guard, pipe, filter toàn cục
    A->>A: Dựng Swagger tại /docs
    N-->>M: app
    M->>M: app.listen(port)
    M->>M: Log "Chân Tâm Core khởi động ở cổng ..."
```

## 28.4 Khởi động CLI — khác ở hai chỗ

```mermaid
flowchart LR
    subgraph H["HTTP"]
        H1["NestFactory.create"]
        H2["InfrastructureModule ĐẦY ĐỦ"]
        H3["app.listen — mở cổng"]
    end
    subgraph C["CLI"]
        C1["NestFactory.createApplicationContext<br/>PHẢI .bind(NestFactory)"]
        C2["CliInfrastructureModule<br/>bỏ Controller/Auth/Health/Realtime"]
        C3["KHÔNG mở cổng, chạy xong app.close()"]
    end

    style C fill:#dcb42826,stroke:#c9a227,stroke-width:1.5px
```

Chi tiết hai cái bẫy: [17-jobs](./17-jobs.md).

## 28.5 `@Global()` — cái bẫy đã làm cả bảy CLI chết

```mermaid
flowchart TD
    A["@Global() trên SecurityModule"] --> B{Module đã được import<br/>ở ĐÂU ĐÓ trong cây chưa?}
    B -->|Rồi| C["✅ Provider dùng được ở mọi nơi"]
    B -->|Chưa| D["❌ Nó KHÔNG TỒN TẠI<br/>@Global không tự nạp module"]

    E["Bảy *-cli.module.ts từng tự đoán<br/>bốn module mình cần — cả bảy đều thiếu"] -.-> D

    style D fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style C fill:#e6ffe6,stroke:#3f8f3f,stroke-width:1.5px,color:#0f3d12
```

## 28.6 Kiểm thử — ba tầng, mỗi tầng bắt loại lỗi khác nhau

```mermaid
flowchart TD
    A["Unit — jest, mock query<br/>584 test core · 125 core-lib"] --> A1["Bắt: logic nghiệp vụ sai"]
    A --> A2["❌ KHÔNG bắt được: SQL sai cú pháp,<br/>module thiếu export, DI hỏng"]

    B["Script Postgres thật<br/>test/*.check.ts"] --> B1["Bắt: SQL sai, ràng buộc, trigger,<br/>hành vi đồng thời"]

    C["Chạy service + CLI thật"] --> C1["Bắt: module thiếu export,<br/>DI bootstrap hỏng"]

    D["Hai loại lỗi chỉ tầng 3 bắt được,<br/>đã gặp thật trong dự án này"] -.-> C

    style A2 fill:#ffe6e6,stroke:#c0504d,stroke-width:1.5px,color:#4a1210
    style D fill:#fff3cd,stroke:#b8860b,stroke-width:1.5px,color:#3d2f00
```

| Lệnh | Kiểm gì |
| --- | --- |
| `npm test` | Unit, 118 suite |
| `npm run test:returning` | Hợp đồng `UPDATE ... RETURNING` |
| `npm run test:reviews` | Đánh giá + accuracy + reconcile |
| `npm run test:feed-merge` | Gộp thích, hai cột đếm |
| `npm run test:lifecycle` | Vòng đời bài đăng |
| `npm run test:concurrency` | Hành vi khi request song song |
| `npm run test:chat-e2e` | Chat trên service thật |

## Chỗ cần soát

1. **Chưa có test nào chạy CLI thật trong CI** — đúng loại lỗi đã làm cả bảy CLI chết.
2. **Chưa có smoke test sau deploy.**
3. Script `test/*.check.ts` phải **chạy tay**, chưa nằm trong pipeline nào.
4. Chưa có đo phủ (`test:cov` có script nhưng không có ngưỡng nào bắt buộc).
