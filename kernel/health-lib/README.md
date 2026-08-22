# `@chantam/service.health-lib`

Endpoint `GET /health` trả về trạng thái service và các phụ thuộc.

```typescript
HealthModule.forRootAsync({
  inject: [IConfig, DataSource],
  useFactory: (config: IConfig, dataSource: DataSource) => ({
    version: config.version,
    indicators: [
      async () => ({
        name: 'postgres',
        healthy: dataSource.isInitialized,
      }),
    ],
  }),
})
```

Phản hồi:

```jsonc
{
  "success": true,
  "errorCode": 0,
  "message": [],
  "body": {
    "status": "ok",              // "degraded" nếu có indicator nào hỏng
    "version": "0.1.0",
    "uptimeSeconds": 128,
    "checks": [{ "name": "postgres", "healthy": true }]
  }
}
```

Một indicator ném lỗi sẽ được ghi nhận thành `healthy: false` kèm thông báo, chứ không làm
sập cả endpoint — hệ thống giám sát cần biết *thành phần nào* hỏng, không phải chỉ thấy 500.
