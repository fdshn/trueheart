import { makeGlobalId } from '@chantam/service.common-lib/utils';

/**
 * Danh tính công khai của một tài khoản.
 *
 * Sinh tất định từ username nên đăng ký lặp (client retry) không tạo hai tài
 * khoản. Username không đổi được sau khi tạo, nên ID cũng không đổi.
 */
export class UserId {
  private constructor(private readonly value: string) {}

  public static create(username: string): UserId {
    return new UserId(makeGlobalId(`/users/${username.toLowerCase()}`));
  }

  public static from(value: string): UserId {
    return new UserId(value);
  }

  public toString(): string {
    return this.value;
  }
}
