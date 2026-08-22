# `@chantam/service.logger-lib`

Logger Pino cấu hình sẵn cho toàn hệ thống.

```typescript
imports: [LoggerModule.forRoot()]
```

```typescript
// main.ts — để Nest dùng Pino thay logger mặc định
app.useLogger(app.get(Logger));
```

- **Development**: `pino-pretty`, một dòng một log, có màu.
- **Production**: JSON thuần, gom được bởi Loki hoặc bất kỳ log agent nào.
- **Redact**: che `authorization`, `password`, `otp`, `credentials`, `identityNumber`,
  `phoneNumber`, `location`, token.
- **Bỏ qua `/health`**: endpoint này bị gọi liên tục, không làm nhiễu log.

> Redact là lớp phòng vệ cuối cùng, không phải lý do để log dữ liệu cá nhân. Xem
> `docs/ARCHITECTURE.md` mục 5.
