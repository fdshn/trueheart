# Chân Tâm — True Heart

> *"Lánh ác làm lành – Đáp đền tiếp nối"* (Pay it forward)

Monorepo backend của nền tảng cho–tặng & từ thiện cộng đồng **Chân Tâm**.

Đặc tả nghiệp vụ: [`Dinh_Huong_Va_Yeu_Cau_Phan_Mem_Chan_Tam.md`](./Dinh_Huong_Va_Yeu_Cau_Phan_Mem_Chan_Tam.md)

---

## Bắt đầu nhanh

Yêu cầu: **Node.js >= 22**, **Docker**.

```bash
# 1. Cài đặt toàn bộ workspace
npm install

# 2. Build thư viện nền tảng rồi tới service
npm run build

# 3. Khởi động PostgreSQL (PostGIS) + Redis
cp .env.example .env
docker compose up -d

# 4. Chạy service chính
cd suites/chantam.vn/chantam/core
cp .env.example .env.local
npm run dev
```

Kiểm tra:

| Địa chỉ | Nội dung |
| --- | --- |
| http://localhost:3000/health | Trạng thái service + kết nối database |
| http://localhost:3000/docs/json | Đặc tả OpenAPI |
| http://localhost:3000/api/gift-posts/nearby | Resource mẫu — truy vấn PostGIS theo bán kính |

> Hạ tầng dev cố ý dùng cổng **15432** (PostgreSQL) và **16379** (Redis), không dùng
> 5432/6379: máy dev thường đã có sẵn PostgreSQL cài cục bộ, và cái cài sẵn sẽ thắng kết
> nối, gây lỗi xác thực rất khó lần ra.

---

## Cấu trúc

```
kernel/                         Thư viện nền tảng, không dính nghiệp vụ
├── common-lib/                 IUseCase, ResponseDto, Exception, module cơ sở
├── persistency-lib/            Entity cơ sở, PersistencyModule, tiện ích PostGIS
├── logger-lib/                 Pino có redact dữ liệu nhạy cảm
├── health-lib/                 Endpoint /health
├── @template/                  Khuôn để tạo service mới
└── @template-lib/              Khuôn để tạo library mới

system/                         Thư viện xuyên suốt (auth, eKYC, storage...) — xem system/README.md

suites/chantam.vn/chantam/
├── core-lib/                   Contract dùng chung: interface DTO/entity, model, enum, mã lỗi
└── core/                       Service chính (Clean Architecture 3 lớp)
```

---

## Kiến trúc

Clean Architecture 3 lớp, quy tắc phụ thuộc một chiều:

```
domain/  ──▶  application/  ──▶  infrastructure/
```

Chi tiết:

- **[`INVARIANTS.md`](./INVARIANTS.md)** — quy tắc bắt buộc, đọc trước khi code
- **[`AGENTS.md`](./AGENTS.md)** — hướng dẫn làm việc, checklist thêm resource mới
- **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — bối cảnh kỹ thuật, lý do lựa chọn, lộ trình

Resource **`gift-post`** trong `suites/chantam.vn/chantam/core` là mẫu tham chiếu đầy đủ:
đi từ entity → repository (có truy vấn PostGIS) → use case → controller → Swagger.
Mọi resource mới copy theo mẫu này.

---

## Công nghệ

| Tầng | Lựa chọn |
| --- | --- |
| Runtime | Node.js 22 |
| Framework | NestJS 11 + Fastify 5 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Cache / Queue | Redis 7 (BullMQ — giai đoạn sau) |
| Monorepo | npm workspaces + Lerna 8 |

---

## Giấy phép

UNLICENSED — mã nguồn thuộc quyền sở hữu của chủ đầu tư theo hợp đồng.
