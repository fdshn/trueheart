import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { IAuthPrincipal, ITokenService } from '../contracts';
import { TokenExpiredException, TokenInvalidException } from '../exceptions';
import { IAuthOptions } from './auth-options';

/** Payload thật nằm trong JWT. Tên trường ngắn để token nhỏ. */
interface IAccessTokenPayload {
  sub: string;
  usr: string;
  rnk: string;
  sts: string;
  /**
   * Thời điểm phát hành, tính bằng **mili giây**.
   *
   * Không dùng `iat` chuẩn của JWT vì nó chỉ có độ phân giải giây — không phân
   * biệt được token phát ra ngay trước với ngay sau một lệnh thu hồi xảy ra
   * trong cùng giây đó. Payload là của ta nên cứ đóng dấu chính xác.
   */
  ims?: number;
  /** Do thư viện JWT tự đóng dấu lúc ký, tính bằng giây. Chỉ dùng để đỡ lưng. */
  iat?: number;
}

@Injectable()
export class TokenService implements ITokenService {
  public constructor(
    private readonly jwtService: JwtService,
    @Inject(IAuthOptions)
    private readonly options: IAuthOptions,
  ) {}

  public get accessTtlSeconds(): number {
    return this.options.accessTtlSeconds;
  }

  public get refreshTtlSeconds(): number {
    return this.options.refreshTtlSeconds;
  }

  public async signAccessToken(principal: IAuthPrincipal): Promise<string> {
    const payload: IAccessTokenPayload = {
      sub: principal.userId,
      usr: principal.username,
      rnk: principal.rank,
      sts: principal.status,
      ims: Date.now(),
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: this.options.accessTtlSeconds,
    });
  }

  public async verifyAccessToken(token: string): Promise<IAuthPrincipal> {
    let payload: IAccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<IAccessTokenPayload>(token);
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new TokenExpiredException();

      throw new TokenInvalidException();
    }

    // Phải có mốc phát hành. Thiếu nghĩa là token do thứ khác ký — từ chối thay
    // vì đoán, vì không có mốc thì không đối chiếu được với danh sách thu hồi.
    //
    // Lùi về `iat` khi thiếu `ims`: lúc triển khai bản mới, token cũ vẫn còn
    // hiệu lực tới 15 phút. Mất độ chính xác xuống mức giây trong quãng đó,
    // nhưng vẫn hơn là đá tất cả người đang đăng nhập ra ngoài.
    const issuedAtMs = payload?.ims ?? (payload?.iat ? payload.iat * 1000 : 0);

    if (!payload?.sub || !payload.usr || !issuedAtMs)
      throw new TokenInvalidException();

    return {
      userId: payload.sub,
      username: payload.usr,
      rank: payload.rnk,
      status: payload.sts,
      issuedAt: new Date(issuedAtMs),
    };
  }

  public generateRefreshToken(): string {
    // 32 byte ngẫu nhiên từ nguồn của hệ điều hành. Đừng thay bằng uuid: uuid v4
    // chỉ có 122 bit ngẫu nhiên và định dạng của nó khiến người ta tưởng đó là
    // định danh chứ không phải bí mật.
    return randomBytes(32).toString('base64url');
  }

  public hashRefreshToken(token: string): string {
    // SHA-256 chứ không phải bcrypt: token đã là 256 bit ngẫu nhiên nên không
    // có gì để dò từ điển, và mỗi lần refresh đều phải tra bảng — bcrypt sẽ
    // biến thao tác tra cứu thành hàng trăm mili giây vô ích.
    return createHash('sha256').update(token).digest('hex');
  }
}
