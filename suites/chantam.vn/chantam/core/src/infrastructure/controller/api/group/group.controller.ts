import {
  IAssignGroupMemberUseCase,
  ICreateGroupUseCase,
  ICreateSubTeamUseCase,
  IGetOwnGroupUseCase,
  IListGroupMembersUseCase,
  IListSubTeamsUseCase,
} from '@/application/contracts/group';
import {
  GroupAlreadyMemberException,
  GroupCreateNotAllowedException,
  GroupDefaultLocationRequiredException,
  GroupNotFoundException,
  OnboardingIncompleteException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AssignGroupMemberBodyDto,
  AssignGroupMemberParamDto,
  CreateGroupBodyDto,
  CreateGroupResponseDto,
  CreateSubTeamBodyDto,
  GetOwnGroupResponseDto,
  GroupIdParamDto,
  ListGroupMembersQueryDto,
  ListGroupMembersResponseDto,
  ListSubTeamsResponseDto,
} from '../../dto/group';

@ApiTags('Nhóm')
@ApiBearerAuth()
@Controller('groups')
export class GroupController {
  public constructor(
    @Inject(ICreateGroupUseCase)
    private readonly createGroupUseCase: ICreateGroupUseCase,
    @Inject(IGetOwnGroupUseCase)
    private readonly getOwnGroupUseCase: IGetOwnGroupUseCase,
    @Inject(IListGroupMembersUseCase)
    private readonly listGroupMembersUseCase: IListGroupMembersUseCase,
    @Inject(IListSubTeamsUseCase)
    private readonly listSubTeamsUseCase: IListSubTeamsUseCase,
    @Inject(ICreateSubTeamUseCase)
    private readonly createSubTeamUseCase: ICreateSubTeamUseCase,
    @Inject(IAssignGroupMemberUseCase)
    private readonly assignGroupMemberUseCase: IAssignGroupMemberUseCase,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Nhóm của tôi',
    description:
      'Trả `group: null` khi chưa thuộc nhóm nào — client dùng đó để hiện nút Tạo nhóm. `inviteCode` CHỈ trả cho Owner: link mời là cửa vào nhóm, lộ cho thành viên thường là cho họ mời người khác thay Owner.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnGroupResponseDto) })
  public async getOwnGroup(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<GetOwnGroupResponseDto>> {
    const result = await this.getOwnGroupUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<GetOwnGroupResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Post()
  @ApiOperation({
    summary: 'Tạo nhóm',
    description:
      'Tâm và bán kính vùng KHÔNG nhận từ body: tâm chụp từ Vị trí mặc định của người tạo, bán kính từ Rank Config. Cả hai cố định sau khi tạo (BR-GRP-03) — cho đổi thì người ta dời vùng theo nơi đang có nhiều sự kiện để gom điểm affiliate. Mỗi người sở hữu tối đa một nhóm và thuộc tối đa một nhóm.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ProfileIncompleteException, ['Avatar', 'SĐT']],
    OnboardingIncompleteException,
    GroupCreateNotAllowedException,
    GroupAlreadyMemberException,
    GroupDefaultLocationRequiredException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(CreateGroupResponseDto) })
  public async createGroup(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateGroupBodyDto,
  ): Promise<ResponseDto<CreateGroupResponseDto>> {
    const result = await this.createGroupUseCase.handle({
      ownerId: principal.userId,
      group: body.group,
    });

    return ResponseDto.create<CreateGroupResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/members')
  @ApiOperation({
    summary: 'Danh sách thành viên nhóm',
    description:
      'Cần quyền `group.member.view` TRÊN CHÍNH nhóm đó. Quyền nhóm luôn mang phạm vi — trưởng nhóm này không xem được nhóm khác.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListGroupMembersResponseDto) })
  public async listGroupMembers(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
    @Query() query: ListGroupMembersQueryDto,
  ): Promise<ResponseDto<ListGroupMembersResponseDto>> {
    const result = await this.listGroupMembersUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      page: query.page,
      limit: query.limit,
    });

    return ResponseDto.create<ListGroupMembersResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/sub-teams')
  @ApiOperation({ summary: 'Danh sách tổ trong nhóm' })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListSubTeamsResponseDto) })
  public async listSubTeams(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
  ): Promise<ResponseDto<ListSubTeamsResponseDto>> {
    const result = await this.listSubTeamsUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
    });

    return ResponseDto.create<ListSubTeamsResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Post(':groupId/sub-teams')
  @ApiOperation({
    summary: 'Tạo tổ',
    description:
      'CHỈ Owner (BR-GRP-05). Trưởng nhóm con không tạo được tổ, kể cả tổ của chính mình. Sub-team sâu đúng một tầng và không ảnh hưởng gì tới chia thưởng affiliate — Phase 1 depth = 1.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['name không được để trống'],
  ])
  @ApiOkResponse({ type: ResponseDto.forApi(ListSubTeamsResponseDto) })
  public async createSubTeam(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
    @Body() body: CreateSubTeamBodyDto,
  ): Promise<ResponseDto<ListSubTeamsResponseDto>> {
    const result = await this.createSubTeamUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      name: body.subTeam.name,
    });

    return ResponseDto.create<ListSubTeamsResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Patch(':groupId/members/:memberId')
  @ApiOperation({
    summary: 'Xếp thành viên vào tổ, hoặc đổi vai',
    description:
      'Tổ phải thuộc CHÍNH nhóm này. Vai `OWNER` không gán được và vai Owner hiện tại không hạ được — chủ nhóm là người tạo nhóm, và đổi được sẽ để lại một nhóm không ai quản trị.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    [
      ValidationFailedException,
      ['role: không gán được vai OWNER — chủ nhóm là người tạo nhóm'],
    ],
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(ListGroupMembersResponseDto) })
  public async assignGroupMember(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AssignGroupMemberParamDto,
    @Body() body: AssignGroupMemberBodyDto,
  ): Promise<ResponseDto<ListGroupMembersResponseDto>> {
    const result = await this.assignGroupMemberUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      memberId: params.memberId,
      subTeamId: body.membership.subTeamId ?? null,
      role: body.membership.role,
    });

    return ResponseDto.create<ListGroupMembersResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }
}
