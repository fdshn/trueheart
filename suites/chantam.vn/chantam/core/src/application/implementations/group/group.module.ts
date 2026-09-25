import {
  IAssignGroupMemberUseCase,
  ICreateGroupUseCase,
  ICreateSubTeamUseCase,
  IGetOwnGroupUseCase,
  IListGroupMembersUseCase,
  IListSubTeamsUseCase,
} from '@/application/contracts/group';
import { Global, Module } from '@nestjs/common';
import {
  AssignGroupMemberUseCase,
  CreateSubTeamUseCase,
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
  ],
  exports: [
    ICreateGroupUseCase,
    IGetOwnGroupUseCase,
    IListGroupMembersUseCase,
    IListSubTeamsUseCase,
    ICreateSubTeamUseCase,
    IAssignGroupMemberUseCase,
  ],
})
export class GroupModule {}
