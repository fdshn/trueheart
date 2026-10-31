import {
  IBlockUserUseCase,
  IListBlockedUsersUseCase,
  IUnblockUserUseCase,
} from '@/application/contracts/user-block';
import {
  UserBlockSelfException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
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
  BlockedUserParamsDto,
  BlockUserBodyDto,
  BlockUserResponseDto,
  ListBlockedUsersQueryDto,
  ListBlockedUsersResponseDto,
  UnblockUserResponseDto,
} from '../../dto/user-block/user-block.dto';

/**
 * Chặn người dùng. Hiệu lực hai chiều: không ai trong hai người mở được phòng chat trực tiếp
 * mới hay gửi tin vào phòng trực tiếp đã có, và hai người không thấy nhau trong danh sách
 * online. Phòng giao dịch tặng đồ và phòng Rao vặt không bị ảnh hưởng. Người bị chặn không
 * được báo.
 */
@ApiTags('Chặn người dùng')
@ApiBearerAuth()
@Controller('me/blocks')
export class UserBlockController {
  public constructor(
    @Inject(IBlockUserUseCase) private readonly blockUseCase: IBlockUserUseCase,
    @Inject(IUnblockUserUseCase)
    private readonly unblockUseCase: IUnblockUserUseCase,
    @Inject(IListBlockedUsersUseCase)
    private readonly listUseCase: IListBlockedUsersUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Chặn một người',
    description:
      'Chỉ định bằng đúng một trong `userId` hoặc `username`. Chặn lại người đã chặn không lỗi (`created: false`). ' +
      'Hiệu lực hai chiều với chat trực tiếp và danh sách online; không đụng phòng giao dịch hay Rao vặt. Người bị chặn không được báo.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(BlockUserResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['block: cần đúng một trong userId hoặc username'],
    ],
    UserBlockSelfException,
    UserNotFoundException,
  )
  public async block(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: BlockUserBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.blockUseCase.handle({
          userId: principal.userId,
          target: body.block,
        }),
      )
      .build();
  }

  @Get()
  @ApiOperation({
    summary: 'Những người tôi đã chặn',
    description: 'Mới chặn trước, có phân trang.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListBlockedUsersResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListBlockedUsersQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          userId: principal.userId,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Delete(':userId')
  @ApiOperation({
    summary: 'Bỏ chặn',
    description: 'Gọi lại khi vốn không chặn không lỗi (`unblocked: false`).',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UnblockUserResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['userId must be a UUID'],
  ])
  public async unblock(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: BlockedUserParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.unblockUseCase.handle({
          userId: principal.userId,
          blockedUserId: params.userId,
        }),
      )
      .build();
  }
}
