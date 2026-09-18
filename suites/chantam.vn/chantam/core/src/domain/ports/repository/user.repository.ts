import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface ICreateUserWithReferralParams {
  globalId: string;
  username: string;
  passwordHash: string;
  referralCode?: string;
}

export interface ICreateUserWithReferralResult {
  user: IUserEntity | null;
  referralApplied: boolean;
}

export interface IUserRepository extends Repository<IUserEntity> {
  /**
   * Tìm theo username, email hoặc số điện thoại — đăng nhập đa định danh (F02).
   *
   * Bỏ qua tài khoản đã xoá mềm.
   */
  findByIdentifier(identifier: string): Promise<IUserEntity | null>;

  createWithReferral(
    params: ICreateUserWithReferralParams,
  ): Promise<ICreateUserWithReferralResult>;

  /** `true` nếu đã có tài khoản dùng username này (không phân biệt hoa thường). */
  isUsernameTaken(username: string): Promise<boolean>;

  /** Hồ sơ công khai: chỉ tài khoản còn hoạt động, không bị xoá. */
  findActiveByUsername(username: string): Promise<IUserEntity | null>;

  isEmailTaken(email: string, exceptUserId: string): Promise<boolean>;
  isPhoneTaken(phone: string, exceptUserId: string): Promise<boolean>;
}

export const IUserRepository = Symbol('IUserRepository');
