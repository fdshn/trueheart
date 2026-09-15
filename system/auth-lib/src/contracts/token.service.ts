import { IAuthPrincipal } from './auth-principal';

export interface ITokenService {
  signAccessToken(principal: IAuthPrincipal): Promise<string>;

  /** Ném `TokenInvalidException` / `TokenExpiredException` khi không hợp lệ. */
  verifyAccessToken(token: string): Promise<IAuthPrincipal>;

  /**
   * Sinh refresh token dạng chuỗi ngẫu nhiên, KHÔNG phải JWT.
   *
   * Chuỗi mờ vì nó phải thu hồi được ngay lập tức: JWT chỉ hết hiệu lực khi hết
   * hạn, nên muốn thu hồi vẫn phải tra một bảng — mà đã tra bảng thì JWT không
   * còn đem lại lợi ích nào, chỉ thêm kích thước và thêm chỗ sai.
   */
  generateRefreshToken(): string;

  /** Băm để tra cứu và lưu trữ. Không bao giờ lưu token gốc. */
  hashRefreshToken(token: string): string;

  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
}

export const ITokenService = Symbol('ITokenService');
