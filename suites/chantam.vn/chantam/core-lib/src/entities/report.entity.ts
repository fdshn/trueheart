import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { IReport } from '../models/report';

export interface IReportEntity
  extends IBaseEntity, IDistributedEntity, IAuditableEntity, IReport {}

export const IReportEntity = Symbol('IReportEntity');
