import { Global, Module } from '@nestjs/common';
import { ProfileGate } from './profile-gate';

/**
 * Cổng hoàn thiện hồ sơ, tách riêng khỏi `ProfileModule`.
 *
 * **Vì sao không để chung.** Cổng được gọi từ bài đăng, xin nhận, chat và sau
 * này là tạo Group — bốn module rải khắp ứng dụng. Nếu nó nằm trong
 * `ProfileModule` thì mọi nơi dùng cổng phải kéo theo cả cây use case hồ sơ,
 * và cây đó lại cần `OnboardingModule`. Một tiến trình CLI chỉ muốn kiểm hồ sơ
 * đủ hay chưa sẽ phải dựng nửa tầng ứng dụng, rồi chết vì thiếu một mắt xích
 * không liên quan gì tới việc nó đang làm.
 *
 * Ở đây cổng chỉ phụ thuộc `IUserRepository` — vốn đã toàn cục.
 */
@Global()
@Module({
  providers: [ProfileGate],
  exports: [ProfileGate],
})
export class ProfileGateModule {}
