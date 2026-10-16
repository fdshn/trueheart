import {
  IAssignGroupMemberUseCase,
  ICreateGroupUseCase,
  ICreateSubTeamUseCase,
  IDeleteSubTeamUseCase,
  IGetGroupAffiliateUseCase,
  IGetGroupInviteUseCase,
  IGetGroupOverviewUseCase,
  IGetOwnGroupUseCase,
  IListGroupActivitiesUseCase,
  IListGroupMembersUseCase,
  IListSubTeamsUseCase,
  IUpdateGroupSettingsUseCase,
} from '@/application/contracts/group';
import { Global, Module } from '@nestjs/common';
import { GroupCreationEligibility } from './group-creation-eligibility';
import {
  AssignGroupMemberUseCase,
  CreateSubTeamUseCase,
  DeleteSubTeamUseCase,
  GetGroupAffiliateUseCase,
  GetGroupInviteUseCase,
  GetGroupOverviewUseCase,
  ListGroupActivitiesUseCase,
  ListGroupMembersUseCase,
  ListSubTeamsUseCase,
  UpdateGroupSettingsUseCase,
} from './group-management.use-cases';
import { CreateGroupUseCase, GetOwnGroupUseCase } from './group.use-cases';

@Global()
@Module({
  providers: [
    GroupCreationEligibility,
    { provide: ICreateGroupUseCase, useClass: CreateGroupUseCase },
    { provide: IGetOwnGroupUseCase, useClass: GetOwnGroupUseCase },
    { provide: IListGroupMembersUseCase, useClass: ListGroupMembersUseCase },
    { provide: IListSubTeamsUseCase, useClass: ListSubTeamsUseCase },
    { provide: ICreateSubTeamUseCase, useClass: CreateSubTeamUseCase },
    { provide: IAssignGroupMemberUseCase, useClass: AssignGroupMemberUseCase },
    { provide: IDeleteSubTeamUseCase, useClass: DeleteSubTeamUseCase },
    { provide: IGetGroupOverviewUseCase, useClass: GetGroupOverviewUseCase },
    {
      provide: IListGroupActivitiesUseCase,
      useClass: ListGroupActivitiesUseCase,
    },
    { provide: IGetGroupInviteUseCase, useClass: GetGroupInviteUseCase },
    { provide: IGetGroupAffiliateUseCase, useClass: GetGroupAffiliateUseCase },
    {
      provide: IUpdateGroupSettingsUseCase,
      useClass: UpdateGroupSettingsUseCase,
    },
  ],
  exports: [
    GroupCreationEligibility,
    ICreateGroupUseCase,
    IGetOwnGroupUseCase,
    IListGroupMembersUseCase,
    IListSubTeamsUseCase,
    ICreateSubTeamUseCase,
    IAssignGroupMemberUseCase,
    IDeleteSubTeamUseCase,
    IGetGroupOverviewUseCase,
    IListGroupActivitiesUseCase,
    IGetGroupInviteUseCase,
    IGetGroupAffiliateUseCase,
    IUpdateGroupSettingsUseCase,
  ],
})
export class GroupModule {}
