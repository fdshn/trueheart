import { ApiModule } from './api.module';

describe('ApiModule', () => {
  // Nạp được module này nghĩa là MỌI controller cùng decorator của chúng đã
  // chạy qua. `@ApiErrorResponses` dựng thật exception để đọc mã lỗi, nên một
  // exception có tham số mà khai thiếu tham số sẽ ném ngay lúc import — tiến
  // trình chết lúc khởi động, container không bao giờ qua nổi health check.
  // Đúng lỗi đó từng làm staging rollback, và không test nào bắt được vì không
  // test nào import tới controller.
  it('nạp được toàn bộ controller mà không ném lúc import', () => {
    expect(ApiModule).toBeDefined();
  });
});
