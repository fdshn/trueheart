import {
  AllocationDistanceRule,
  IAllocationMatchWeights,
  IAllocationPolicy,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface IAllocationPolicyView {
  /**
   * Chính sách ĐANG CHẠY, đã chuẩn hoá.
   *
   * Luôn trả bản chuẩn hoá chứ không trả giá trị thô trong config: trọng số được
   * chia về tổng bằng 1, nên thứ Admin gõ (`5/3/2`) và thứ hệ thống dùng
   * (`0.5/0.3/0.2`) là hai con số khác nhau. Hiện giá trị thô sẽ khiến Admin đọc
   * một chính sách khác với chính sách đang có hiệu lực.
   */
  policy: IAllocationPolicy;
  /**
   * `false` khi chưa ai publish và hệ thống đang chạy theo mặc định — mặc định đó
   * trùng khít hành vi có từ trước khi có đường cấu hình này.
   */
  isConfigured: boolean;
}

export interface IGetAllocationPolicyCommand {
  actorUserId: string;
}

export interface IGetAllocationPolicyResult extends IAllocationPolicyView {}

export interface IGetAllocationPolicyUseCase extends IUseCase<
  IGetAllocationPolicyCommand,
  IGetAllocationPolicyResult
> {}

export const IGetAllocationPolicyUseCase = Symbol(
  'IGetAllocationPolicyUseCase',
);

export interface ISetAllocationPolicyCommand {
  actorUserId: string;
  categoryMatchRequired: boolean;
  distanceRule: AllocationDistanceRule;
  keywordMatchEnabled: boolean;
  autoCreateTransaction: boolean;
  maxSuggestions: number;
  weights: IAllocationMatchWeights;
  reason: string;
}

export interface ISetAllocationPolicyResult extends IAllocationPolicyView {}

export interface ISetAllocationPolicyUseCase extends IUseCase<
  ISetAllocationPolicyCommand,
  ISetAllocationPolicyResult
> {}

export const ISetAllocationPolicyUseCase = Symbol(
  'ISetAllocationPolicyUseCase',
);
