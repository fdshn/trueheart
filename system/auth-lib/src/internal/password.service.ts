import { Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { IPasswordService } from '../contracts';
import { IAuthOptions } from './auth-options';

@Injectable()
export class PasswordService implements IPasswordService {
  public constructor(
    @Inject(IAuthOptions)
    private readonly options: IAuthOptions,
  ) {}

  public async hash(plain: string): Promise<string> {
    return hash(plain, this.options.bcryptRounds);
  }

  public async verify(plain: string, hashed: string): Promise<boolean> {
    // bcryptjs tự đọc salt và số vòng từ chính chuỗi hash, nên mật khẩu băm
    // bằng số vòng cũ vẫn kiểm được sau khi ta nâng `bcryptRounds`.
    return compare(plain, hashed);
  }
}
