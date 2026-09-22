import { CandidateSelectionCriteria } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICandidateSelectionOrderItem {
  code: CandidateSelectionCriteria;
  priority: number;
}

export interface ICandidateSelectionView {
  order: ICandidateSelectionOrderItem[];
  isConfigured: boolean;
}

export interface IGetCandidateSelectionCommand {
  actorUserId: string;
}

export interface IGetCandidateSelectionResult extends ICandidateSelectionView {}

export interface IGetCandidateSelectionUseCase extends IUseCase<
  IGetCandidateSelectionCommand,
  IGetCandidateSelectionResult
> {}

export const IGetCandidateSelectionUseCase = Symbol(
  'IGetCandidateSelectionUseCase',
);

export interface ISetCandidateSelectionCommand {
  actorUserId: string;
  order: CandidateSelectionCriteria[];
  reason: string;
}

export interface ISetCandidateSelectionResult extends ICandidateSelectionView {}

export interface ISetCandidateSelectionUseCase extends IUseCase<
  ISetCandidateSelectionCommand,
  ISetCandidateSelectionResult
> {}

export const ISetCandidateSelectionUseCase = Symbol(
  'ISetCandidateSelectionUseCase',
);
