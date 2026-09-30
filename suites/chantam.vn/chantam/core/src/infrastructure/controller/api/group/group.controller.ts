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
  Delete,
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
  GetGroupAffiliateResponseDto,
  GetGroupInviteResponseDto,
  GetGroupOverviewResponseDto,
  GetOwnGroupResponseDto,
  GroupIdParamDto,
  ListGroupActivitiesQueryDto,
  ListGroupActivitiesResponseDto,
  ListGroupMembersQueryDto,
  ListGroupMembersResponseDto,
  ListSubTeamsResponseDto,
  SubTeamParamDto,
  UpdateGroupSettingsBodyDto,
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
    @Inject(IDeleteSubTeamUseCase)
    private readonly deleteSubTeamUseCase: IDeleteSubTeamUseCase,
    @Inject(IGetGroupOverviewUseCase)
    private readonly getGroupOverviewUseCase: IGetGroupOverviewUseCase,
    @Inject(IListGroupActivitiesUseCase)
    private readonly listGroupActivitiesUseCase: IListGroupActivitiesUseCase,
    @Inject(IGetGroupInviteUseCase)
    private readonly getGroupInviteUseCase: IGetGroupInviteUseCase,
    @Inject(IGetGroupAffiliateUseCase)
    private readonly getGroupAffiliateUseCase: IGetGroupAffiliateUseCase,
    @Inject(IUpdateGroupSettingsUseCase)
    private readonly updateGroupSettingsUseCase: IUpdateGroupSettingsUseCase,
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

  @Get(':groupId')
  @ApiOperation({
    summary: 'Trang tổng quan nhóm',
    description:
      'Cần `group.overview.view` TRÊN CHÍNH nhóm đó — quyền duy nhất của vai `MEMBER`, và tới 30/09 không dòng code nào kiểm nó. `inviteCode` CHỈ trả cho Owner. Nhóm không tồn tại và người xem không thuộc nhóm cùng một câu trả lời 404: phân biệt là cho người lạ dò xem id nào là một nhóm thật.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(GetGroupOverviewResponseDto) })
  public async getGroupOverview(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
  ): Promise<ResponseDto<GetGroupOverviewResponseDto>> {
    const result = await this.getGroupOverviewUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
    });

    return ResponseDto.create<GetGroupOverviewResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/activities')
  @ApiOperation({
    summary: 'Dòng hoạt động của nhóm',
    description:
      'Cần `group.activity.view` (trả CẢ nhóm) hoặc `group.subteam.activity.view` (trả CHỈ hoạt động của người trong tổ mình). Ba loại sự kiện, dựng TỪ dữ liệu đã có chứ không từ một bảng sự kiện riêng: `MEMBER_JOINED`, `POST_PUBLISHED` (chỉ bài công khai), `GIFT_COMPLETED` (tính cho phía người tặng). `scopedToSubTeamId` nói rõ đang xem phạm vi nào.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListGroupActivitiesResponseDto) })
  public async listGroupActivities(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
    @Query() query: ListGroupActivitiesQueryDto,
  ): Promise<ResponseDto<ListGroupActivitiesResponseDto>> {
    const result = await this.listGroupActivitiesUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      page: query.page,
      limit: query.limit,
    });

    return ResponseDto.create<ListGroupActivitiesResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/invite')
  @ApiOperation({
    summary: 'Link mời của nhóm',
    description:
      'Cần `group.invite.view` — chỉ Owner có. Link mời là CỬA VÀO nhóm: lộ cho thành viên thường là cho họ mời người khác thay Owner. Link KHÔNG tự hết hạn và KHÔNG giới hạn lượt dùng (BR-GRP-04); nó chỉ ngừng dùng được khi nhóm rời khỏi ACTIVE. Trả kèm số người đã vào qua link, không tính Owner.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(GetGroupInviteResponseDto) })
  public async getGroupInvite(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
  ): Promise<ResponseDto<GetGroupInviteResponseDto>> {
    const result = await this.getGroupInviteUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
    });

    return ResponseDto.create<GetGroupInviteResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/affiliate')
  @ApiOperation({
    summary: 'Điều kiện affiliate của nhóm',
    description:
      'Cần `group.affiliate.view` — chỉ Owner có; trưởng tổ KHÔNG xem được affiliate toàn nhóm. Đây KHÔNG phải số điểm đã chia: bộ máy chia thưởng chưa có dòng code nào, và `rewardEngineReady: false` nói thẳng điều đó thay vì im lặng trả 0. Những gì trả về là ĐẦU VÀO của bộ máy — bao nhiêu người đủ điều kiện nếu nó chạy hôm nay, tính trực tiếp từ `users.status` và `users.last_active_at` chứ không qua cột cờ nào.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(GetGroupAffiliateResponseDto) })
  public async getGroupAffiliate(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
  ): Promise<ResponseDto<GetGroupAffiliateResponseDto>> {
    const result = await this.getGroupAffiliateUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
    });

    return ResponseDto.create<GetGroupAffiliateResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Patch(':groupId')
  @ApiOperation({
    summary: 'Sửa thông tin nhóm',
    description:
      'Cần `group.settings.manage` — chỉ Owner có. Sửa được tên, mô tả, ảnh đại diện, ảnh bìa. **KHÔNG sửa được tâm và bán kính**: cả hai là snapshot lúc tạo (BR-GRP-03), và cho sửa là cho người ta dời vùng theo nơi đang có nhiều sự kiện để gom điểm affiliate. Bỏ trống một trường là GIỮ NGUYÊN; gửi `null` tường minh mới xoá mô tả hoặc ảnh. Nhóm đã giải tán không sửa được gì.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    [
      ValidationFailedException,
      ['cần ít nhất một trong: name, description, avatarUrl, coverUrl'],
    ],
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(GetGroupOverviewResponseDto) })
  public async updateGroupSettings(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GroupIdParamDto,
    @Body() body: UpdateGroupSettingsBodyDto,
  ): Promise<ResponseDto<GetGroupOverviewResponseDto>> {
    const result = await this.updateGroupSettingsUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      settings: body.settings,
    });

    return ResponseDto.create<GetGroupOverviewResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }

  @Get(':groupId/members')
  @ApiOperation({
    summary: 'Danh sách thành viên nhóm',
    description:
      'Cần `group.member.view` (trả CẢ nhóm) hoặc `group.subteam.member.view` (trả CHỈ tổ của chính người gọi) TRÊN CHÍNH nhóm đó. Quyền nhóm luôn mang phạm vi — trưởng nhóm này không xem được nhóm khác. Trưởng tổ chưa được xếp vào tổ nào thì bị từ chối, không phải được xem cả nhóm.',
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

  @Delete(':groupId/sub-teams/:subTeamId')
  @ApiOperation({
    summary: 'Xoá tổ',
    description:
      'CHỈ Owner — cùng quyền `group.subteam.manage` với tạo tổ. Xoá MỀM: người trong tổ vẫn ở lại NHÓM, chỉ rời tổ, vì tổ là cách tổ chức chứ không phải điều kiện ở lại. Trưởng tổ của tổ bị xoá hạ về `MEMBER`: phạm vi của vai đó đọc từ `sub_team_id`, nên giữ vai là để lại một người mang danh trưởng mà mọi endpoint đều từ chối. Trả danh sách tổ còn lại.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    GroupNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(ListSubTeamsResponseDto) })
  public async deleteSubTeam(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: SubTeamParamDto,
  ): Promise<ResponseDto<ListSubTeamsResponseDto>> {
    const result = await this.deleteSubTeamUseCase.handle({
      userId: principal.userId,
      groupId: params.groupId,
      subTeamId: params.subTeamId,
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
      'Tổ phải thuộc CHÍNH nhóm này. Vai `OWNER` không gán được và vai Owner hiện tại không hạ được — chủ nhóm là người tạo nhóm, và đổi được sẽ để lại một nhóm không ai quản trị. BỎ TRỐNG `subTeamId` để giữ tổ hiện tại; gửi `null` tường minh mới là gỡ khỏi tổ. Cần ít nhất một trong hai trường.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    [
      ValidationFailedException,
      [
        'role: không gán được vai OWNER — chủ nhóm là người tạo nhóm',
        'cần ít nhất một trong hai: subTeamId (null để gỡ khỏi tổ) hoặc role',
      ],
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
      // KHÔNG `?? null`. JSON không gửi được `undefined`, nên thiếu khoá là
      // `undefined` và đó là ý "giữ tổ hiện tại"; `null` tường minh mới là gỡ ra.
      subTeamId: body.membership.subTeamId,
      role: body.membership.role,
    });

    return ResponseDto.create<ListGroupMembersResponseDto>()
      .succeed()
      .attach(result as never)
      .build();
  }
}
