# AGENTS.md

Hướng dẫn cho AI agent và lập trình viên mới khi làm việc trong monorepo này.

## Bất biến kiến trúc

Trước khi viết kế hoạch hoặc bắt đầu code, đọc **`INVARIANTS.md`** ở thư mục gốc. Dùng nó
để tự phản biện mọi quyết định cấu trúc trước khi gõ dòng code đầu tiên. Nếu một quyết định
xung đột với invariant, sửa kế hoạch trước.

## Khám phá package

Khi cần hiểu một package cung cấp gì, đọc `README.md` của nó **trước** khi quét source.
Package nằm ở ba root: `kernel/`, `system/`, `suites/<suite>/<product>/`.

## Lệnh phát triển

### Ở thư mục gốc

| Lệnh | Tác dụng |
| --- | --- |
| `npm install` | Cài đặt toàn bộ workspace, liên kết dependency `file:` nội bộ |
| `npm run build` | Build tất cả package qua Lerna (lib trước, service sau) |
| `npm run test` | Chạy toàn bộ unit test |
| `npm run lint` | ESLint + tự sửa |
| `npm run format` | Prettier |
| `docker compose up -d` | Khởi động PostgreSQL (PostGIS) + Redis cho môi trường dev |
| `npm run lint:check` | ESLint **không** tự sửa — đúng bản CI chạy |
| `npm run format:check` | Prettier chỉ kiểm tra — đúng bản CI chạy |
| `npm run clean` / `npm run rebuild` | Xoá output build / xoá rồi build lại từ đầu |
| `bash scripts/smoke-test.sh <url>` | 15 phép thử đầu-cuối, gồm cả truy vấn PostGIS |

> Trước khi mở PR, chạy `npm run lint:check` và `npm run format:check` chứ không phải
> `lint`/`format` — hai bản sau tự sửa file, còn CI thì không, nên chúng có thể xanh ở máy
> bạn mà đỏ trên CI.

### Trong từng package

**Service** (`suites/chantam.vn/chantam/core`):

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy watch mode (builder SWC) + pino-pretty |
| `npm run build` | Build production (builder tsc) |
| `npm run test` | Jest |
| `npm run test -- path/to/file.spec.ts` | Chạy một file test |
| `npm run docker:generate` | Sinh lại Dockerfile từ cây dependency |

**Library** (`kernel/*`, `*-lib`):

| Lệnh | Tác dụng |
| --- | --- |
| `npm run build` | `nest build && tsc-alias` — emit ra chính thư mục gốc package |
| `npm run dev` | Watch mode |

> **Sau khi sửa một library, phải `npm run build` lại library đó** thì service phụ thuộc
> mới thấy thay đổi.

## Tổng quan kiến trúc

### Cấu trúc monorepo

Lerna (independent versioning) + npm workspaces. Ba root:

```
kernel/     # Thư viện nền tảng, không dính nghiệp vụ. Có thể tái dùng cho sản phẩm khác.
system/     # Dịch vụ và thư viện xuyên suốt: auth, storage, notification. (chưa có package)
suites/     # Nghiệp vụ, theo dạng suites/<suite>/<product>/<package>
```

Dependency nội bộ dùng giao thức `file:`:

- Cùng thư mục: `"file:../common-lib"`
- Khác thư mục: `"file:../../../../kernel/common-lib"`

Thêm dependency nội bộ: `cd` vào package tiêu thụ rồi `npm i -S <đường-dẫn-tương-đối>`.

### Công nghệ

- **Runtime**: Node.js >= 22
- **Framework**: NestJS 11 + **Fastify 5** (KHÔNG dùng Express)
- **Ngôn ngữ**: TypeScript 5.7, bật `strictNullChecks`
- **ORM**: TypeORM 0.3
- **Database**: PostgreSQL 16 + **PostGIS 3.4** (bắt buộc — nghiệp vụ lõi là truy vấn cự ly)
- **Cache/Queue**: Redis (BullMQ ở giai đoạn sau)
- **Validation**: class-validator + class-transformer
- **Mixin**: `ts-mixer` (`decorate()` cho decorator TypeORM/Swagger trong class cơ sở)

### Clean Architecture 3 lớp

**1. `domain/`** — nghiệp vụ thuần, không phụ thuộc hạ tầng:

```
domain/ports/config/          IConfig
domain/ports/repository/      Interface repository
domain/exceptions/            Exception nghiệp vụ
domain/consts/                Hằng số nghiệp vụ nội bộ service
```

**2. `application/`** — use case điều phối domain và hạ tầng:

```
application/contracts/<resource>/         Command, Result, IXUseCase + Symbol
application/implementations/<resource>/   Class hiện thực + module của resource
application/application.module.ts         Gom các feature module
```

**3. `infrastructure/`** — tích hợp bên ngoài:

```
infrastructure/config/                    Đọc + validate biến môi trường (Joi)
infrastructure/persistence/               Kết nối TypeORM
infrastructure/entity/                    Entity TypeORM + EntityModule (bind interface → class)
infrastructure/repository/                Hiện thực repository + RepositoryModule
infrastructure/controller/dto/            DTO cụ thể (validation + Swagger)
infrastructure/controller/api/            Controller theo resource, mỗi cái một module
infrastructure/infrastructure.module.ts   Module gốc của lớp hạ tầng
```

### Path alias

```typescript
import { IConfig } from '@/domain/ports/config';
import { ICreateGiftPostUseCase } from '@/application/contracts/gift-post';
import { GiftPostEntity } from '@/infrastructure/entity';
```

### Import chuẩn

```typescript
import { IUseCase } from '@chantam/service.common-lib';
import { ResponseDto, PaginationQueryDto } from '@chantam/service.common-lib/dto';
import { Exception } from '@chantam/service.common-lib/exception';
import { AppContextModule, BaseControllerModule, DocsModule } from '@chantam/service.common-lib/modules';
import { PersistencyModule, Repositories } from '@chantam/service.persistency-lib';
import { GeoQueryHelper, GeoColumn } from '@chantam/service.persistency-lib/geo';
import { LoggerModule } from '@chantam/service.logger-lib';
import { HealthModule } from '@chantam/service.health-lib';
```

## Quy ước code

- **Class**: PascalCase + hậu tố (`GiftPostRepository`, `CreateGiftPostUseCase`)
- **Interface**: PascalCase, tiền tố `I` (`IGiftPostRepository`)
- **Hằng số**: PascalCase (`MaxSearchRadiusMeters`)
- **Enum**: PascalCase số nhiều, thành viên UPPER_SNAKE_CASE
- **DTO**: `<Action><Entity><Type>Dto` (`CreateGiftPostBodyDto`)
- **Access modifier**: luôn ghi rõ `public`/`private`/`protected` — **trừ** thuộc tính của
  DTO và entity (mặc định public; thêm `public` chỉ làm nhiễu giữa rừng decorator).

## Thêm một resource mới — checklist

1. **Interface DTO** trong `core-lib/src/dto/<resource>/`
2. **Interface entity + model + value object** trong `core-lib/src/{entities,models,values}/`
3. **Mã lỗi** trong `core-lib/src/consts/error-codes.ts`
4. **Contract use case** trong `core/src/application/contracts/<resource>/`
5. **Hiện thực use case** trong `core/src/application/implementations/<resource>/` + module
6. **Entity TypeORM** trong `core/src/infrastructure/entity/` + đăng ký `EntityModule`
7. **Repository** trong `core/src/infrastructure/repository/` + đăng ký `RepositoryModule`
8. **DTO cụ thể** trong `core/src/infrastructure/controller/dto/<resource>/`
9. **Controller** trong `core/src/infrastructure/controller/api/<resource>/` + module
10. **Đăng ký**: feature module vào `ApplicationModule`, controller module vào `ApiModule`
11. **Unit test** `.spec.ts` cạnh mỗi use case
12. Cập nhật `README.md` của package

Mẫu đầy đủ để copy: resource **`gift-post`** trong `suites/chantam.vn/chantam/core`.
