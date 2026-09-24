import {
  OnboardingIncompleteException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { missingProfileFields } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Cổng hoàn thiện hồ sơ (F07).
 *
 * **Chốt 2026-09-24:** cổng chặn **đăng bài, xin nhận, chat và tạo Group** —
 * không chỉ riêng đăng bài như đặc tả ban đầu ghi.
 *
 * Gom về một chỗ thay vì viết lại ở từng use case. Bốn nơi tự kiểm là bốn danh
 * sách trường bắt buộc có thể trôi khỏi nhau, và chỗ nào quên một trường thì
 * chỗ đó lặng lẽ mở cửa cho hồ sơ chưa đủ.
 */
@Injectable()
export class ProfileGate {
  public constructor(
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
  ) {}

  /**
   * Chặn nếu hồ sơ chưa đủ, và trả về chính người dùng đó.
   *
   * Trả `user` chứ không trả `void`: mọi chỗ gọi đều cần bản ghi ngay sau đó,
   * và bắt họ nạp lại là thêm một lượt đi database cho mỗi hành vi bị canh.
   */
  public async assertComplete(userId: string): Promise<IUserEntity> {
    const user = await this.users.findOneBy({ globalId: userId });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    const missing = missingProfileFields(user);
    if (missing.length > 0) throw new ProfileIncompleteException(missing);

    return user;
  }

  /**
   * Cổng hồ sơ, cộng thêm điều kiện đã xong onboarding.
   *
   * Viewer là người chưa hoàn tất onboarding. Tách riêng khỏi `assertComplete`
   * vì hai thứ trả lời hai câu khác nhau — "hồ sơ đủ chưa" và "đã qua cửa vào
   * chưa" — và có hành vi chỉ cần câu thứ nhất.
   */
  public async assertOnboarded(userId: string): Promise<IUserEntity> {
    const user = await this.assertComplete(userId);
    if (user.rank === UserRanks.VIEWER)
      throw new OnboardingIncompleteException();

    return user;
  }
}
