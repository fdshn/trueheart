import { IUseCase } from '@chantam/service.common-lib';

export interface IQualifyReferralCommand {
  refereeId: string;
}

export interface IQualifyReferralResult {
  /**
   * `true` khi lượt này VỪA được tính trong lần gọi này.
   *
   * Trả về thay cho `void` để `point:reconcile` đếm được số lượt nó vá xong. Trước
   * 30/09 nó không cần con số đó vì nó gọi thẳng repository — và chính vì gọi thẳng
   * mà nó bỏ qua luôn thông báo lẫn phép kiểm lên hạng nằm trong use case này.
   */
  readonly qualified: boolean;
}

export interface IQualifyReferralUseCase extends IUseCase<
  IQualifyReferralCommand,
  IQualifyReferralResult
> {}

export const IQualifyReferralUseCase = Symbol('IQualifyReferralUseCase');
