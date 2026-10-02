import {
  IGetCheckInHistoryResponseDto,
  IGetCheckInPolicyResponseDto,
  IGetCheckInStateResponseDto,
  IPublishCheckInPolicyBodyDto,
  IPublishCheckInPolicyResponseDto,
  IRecordCheckInResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetCheckInStateCommand {
  userId: string;
}
export type IGetCheckInStateResult = IGetCheckInStateResponseDto;
export type IGetCheckInStateUseCase = IUseCase<
  IGetCheckInStateCommand,
  IGetCheckInStateResult
>;
export const IGetCheckInStateUseCase = Symbol('IGetCheckInStateUseCase');

export interface IGetCheckInHistoryCommand {
  userId: string;
  page?: number;
  pageSize?: number;
}
export type IGetCheckInHistoryResult = IGetCheckInHistoryResponseDto;
export type IGetCheckInHistoryUseCase = IUseCase<
  IGetCheckInHistoryCommand,
  IGetCheckInHistoryResult
>;
export const IGetCheckInHistoryUseCase = Symbol('IGetCheckInHistoryUseCase');

export interface IRecordCheckInCommand {
  userId: string;
}
export type IRecordCheckInUseCaseResult = IRecordCheckInResponseDto;
export type IRecordCheckInUseCase = IUseCase<
  IRecordCheckInCommand,
  IRecordCheckInUseCaseResult
>;
export const IRecordCheckInUseCase = Symbol('IRecordCheckInUseCase');

export interface IRepairCheckInCommand {
  userId: string;
  date: string;
}
export type IRepairCheckInUseCase = IUseCase<
  IRepairCheckInCommand,
  IRecordCheckInResponseDto
>;
export const IRepairCheckInUseCase = Symbol('IRepairCheckInUseCase');

export interface IGetCheckInPolicyCommand {
  actorUserId: string;
}
export type IGetCheckInPolicyResult = IGetCheckInPolicyResponseDto;
export type IGetCheckInPolicyUseCase = IUseCase<
  IGetCheckInPolicyCommand,
  IGetCheckInPolicyResult
>;
export const IGetCheckInPolicyUseCase = Symbol('IGetCheckInPolicyUseCase');

export interface IPublishCheckInPolicyCommand extends IPublishCheckInPolicyBodyDto {
  actorUserId: string;
}
export type IPublishCheckInPolicyResult = IPublishCheckInPolicyResponseDto;
export type IPublishCheckInPolicyUseCase = IUseCase<
  IPublishCheckInPolicyCommand,
  IPublishCheckInPolicyResult
>;
export const IPublishCheckInPolicyUseCase = Symbol(
  'IPublishCheckInPolicyUseCase',
);
