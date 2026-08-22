# `@template`

Khuôn để tạo một service mới. **Không triển khai package này** — copy nó.

## Cách dùng

```bash
cp -r kernel/@template system/<ten>          # hoặc suites/chantam.vn/chantam/<ten>
cd system/<ten>
# Sửa "changeme" trong package.json và infrastructure.module.ts
cp .env.example .env.local
npm install && npm run dev
```

Service chạy được ngay với `/health` và `/docs` — chưa có database, chưa có resource nào.

## Đã có sẵn

| Thành phần | Nguồn |
| --- | --- |
| Fastify + shutdown hook | `main.ts` |
| Logger Pino có redact dữ liệu cá nhân | `logger-lib` |
| Validation + serialization + xử lý lỗi thống nhất | `BaseControllerModule` |
| Swagger tại `/docs` và `/docs/json` | `DocsModule` |
| `GET /health` | `health-lib` |
| Đọc và validate biến môi trường bằng Joi | `infrastructure/config/` |

## Bổ sung tầng dữ liệu

Copy theo mẫu đầy đủ ở `suites/chantam.vn/chantam/core`:

1. Thêm `@chantam/service.persistency-lib` vào dependency
2. Tạo `infrastructure/{persistence,entity,repository}/`
3. Mở rộng `IConfig` với `database.default`; bổ sung `DATABASE_URI` vào `ConfigSchema`
4. Import `PersistenceModule`, `EntityModule`, `RepositoryModule` trong `InfrastructureModule`

Checklist đầy đủ để thêm một resource mới: xem `AGENTS.md`.

## Dockerfile

```bash
npm run docker:generate
```

Bộ sinh duyệt cây dependency `file:` và tạo Dockerfile multi-stage đúng thứ tự build. Chạy
lại mỗi khi thêm hoặc bớt dependency nội bộ.
