import {
  IAssignGroupMemberUseCase,
  ICreateGroupUseCase,
  ICreateSubTeamUseCase,
  IDeleteSubTeamUseCase,
  IGetGroupOverviewUseCase,
  IGetOwnGroupUseCase,
  IListGroupActivitiesUseCase,
  IListGroupMembersUseCase,
  IListSubTeamsUseCase,
} from '@/application/contracts/group';
import { Global, Module } from '@nestjs/common';
import {
  AssignGroupMemberUseCase,
  CreateSubTeamUseCase,
  DeleteSubTeamUseCase,
  GetGroupOverviewUseCase,
  ListGroupActivitiesUseCase,
  ListGroupMembersUseCase,
  ListSubTeamsUseCase,
} from './group-management.use-cases';
import { CreateGroupUseCase, GetOwnGroupUseCase } from './group.use-cases';

@Global()
@Module({
  providers: [
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
  ],
  exports: [
    ICreateGroupUseCase,
    IGetOwnGroupUseCase,
    IListGroupMembersUseCase,
    IListSubTeamsUseCase,
    ICreateSubTeamUseCase,
    IAssignGroupMemberUseCase,
    IDeleteSubTeamUseCase,
    IGetGroupOverviewUseCase,
    IListGroupActivitiesUseCase,
  ],
})
export class GroupModule {}
