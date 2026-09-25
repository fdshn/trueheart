import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
  ISoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { IGroup, IGroupMembership, ISubTeam } from '../models';

export interface IGroupEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    IGroup {}

export const IGroupEntity = Symbol('IGroupEntity');

export interface ISubTeamEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    ISubTeam {}

export const ISubTeamEntity = Symbol('ISubTeamEntity');

export interface IGroupMembershipEntity
  extends IBaseEntity, IDistributedEntity, IAuditableEntity, IGroupMembership {}

export const IGroupMembershipEntity = Symbol('IGroupMembershipEntity');
