import {
  ICreateGroupUseCase,
  IGetOwnGroupUseCase,
} from '@/application/contracts/group';
import {
  GroupAlreadyMemberException,
  GroupCreateNotAllowedException,
  GroupDefaultLocationRequiredException,
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
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateGroupBodyDto,
  CreateGroupResponseDto,
  GetOwnGroupResponseDto,
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
}
