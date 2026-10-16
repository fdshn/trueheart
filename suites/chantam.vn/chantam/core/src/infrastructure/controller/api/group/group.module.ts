import { Module } from '@nestjs/common';
import { GroupInvitePublicController } from './group-invite-public.controller';
import { GroupController } from './group.controller';

@Module({ controllers: [GroupController, GroupInvitePublicController] })
export class GroupControllerModule {}
