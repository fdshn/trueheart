export interface IPasswordService {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export const IPasswordService = Symbol('IPasswordService');
