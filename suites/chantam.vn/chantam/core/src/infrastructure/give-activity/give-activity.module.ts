import { IGiveActivityCounter } from '@/domain/ports/give-activity.counter';
import { Global, Module } from '@nestjs/common';
import { GiftActivityCounter } from './gift-activity.counter';

/**
 * Nguồn hoạt động đã chuyển sang giao dịch M3 thật.
 *
 * Bản `UnavailableGiveActivityCounter` trước đây giữ toàn bộ nhánh rank nằm im:
 * không ai lên được Bạc, không chu kỳ duy trì nào được mở. Giữ lại file đó làm
 * tài liệu lịch sử thì chỉ tạo hai đường đi cho cùng một quyết định, nên nó đã
 * bị xoá.
 */
@Global()
@Module({
  providers: [{ provide: IGiveActivityCounter, useClass: GiftActivityCounter }],
  exports: [IGiveActivityCounter],
})
export class GiveActivityModule {}
