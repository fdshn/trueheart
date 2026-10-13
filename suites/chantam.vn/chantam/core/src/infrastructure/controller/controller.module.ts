import { IConfig } from '@/domain/ports/config';
import {
  BaseControllerModule,
  DocsModule,
  IAppContext,
} from '@chantam/service.common-lib/modules';
import { Global, INestApplication, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiModule } from './api/api.module';
import { PointsAwardedInterceptor } from './interceptors/points-awarded.interceptor';

@Global()
@Module({
  imports: [
    ApiModule,
    DocsModule.forRootAsync({
      inject: [IAppContext, IConfig],
      useFactory: (
        appContext: IAppContext<INestApplication>,
        config: IConfig,
      ) => ({
        title: 'Chân Tâm — Core API',
        description: [
          'API lõi của nền tảng cho–tặng & từ thiện cộng đồng **Chân Tâm** (True Heart).',
          '',
          '### Mọi phản hồi cùng một hình dạng',
          '',
          'Kể cả khi lỗi — nhờ vậy lớp xử lý ở mobile/web chỉ phải viết một lần:',
          '',
          '```json',
          '{ "success": true, "errorCode": 0, "message": [], "body": { } }',
          '```',
          '',
          'Lỗi thì `success: false`, `body: null`, và `message` là danh sách mô tả.',
          '',
          '### Phân biệt lỗi bằng CẶP (errorOrigin, errorCode)',
          '',
          'Không phải bằng riêng `errorCode`: hai tầng khác nhau được phép dùng trùng số.',
          'Ví dụ mã `257` là "thiếu access token" ở `system/auth-lib`, nhưng là "không tìm',
          'thấy bài đăng" ở `chantam/core`.',
          '',
          'Đừng bắt lỗi theo `message` — câu chữ sẽ đổi. Bảng tra đầy đủ nằm ở',
          '`docs/API-ERRORS.md` trong repo; mỗi endpoint bên dưới cũng liệt kê sẵn',
          'các mã nó có thể trả về, kèm ví dụ response.',
          '',
          '### Đăng nhập để gọi thử',
          '',
          '1. Gọi `POST /api/v1/auth/register` hoặc `POST /api/v1/auth/login`',
          '2. Chép `body.session.accessToken`',
          '3. Bấm **Authorize** ở góc trên, dán token (KHÔNG kèm chữ `Bearer`)',
          '',
          'Access token sống 15 phút. Hết hạn thì gọi `POST /api/v1/auth/refresh` bằng',
          '`refreshToken` để lấy cặp mới — refresh token xoay vòng, bản cũ chết ngay.',
          '',
          '### Body luôn bọc dưới một khoá tài nguyên',
          '',
          '`{ "giftPost": { ... } }` chứ không phải `{ ... }` trần. Quy ước này giúp thêm',
          'trường cấp ngoài về sau mà không phá client cũ.',
          '',
          '### Điểm thưởng trong header',
          '',
          'API nào có CỘNG điểm cho người gọi đều trả thêm `X-Points-Awarded` (tổng điểm) và',
          '`X-Points-Message` (tiêu đề, **percent-encode** — giải bằng `decodeURIComponent`).',
          'Không cộng điểm thì không có hai header này. Chi tiết: `docs/API.md` §1.',
        ].join('\n'),
        version: config.version,
        servers: config.docsServers,
        app: () => appContext.waitForApp(),
      }),
    }),
    BaseControllerModule.forRoot(),
  ],
  providers: [
    // `APP_INTERCEPTOR` áp cho MỌI route, kể cả route thêm sau này — đúng yêu cầu
    // "API nào có cộng điểm cũng trả X-Points-*" mà không phải nhớ gắn từng chỗ.
    { provide: APP_INTERCEPTOR, useClass: PointsAwardedInterceptor },
  ],
})
export class ControllerModule {}
