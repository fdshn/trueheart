import {
  ICompleteMeritDeclarationUseCase,
  ICreateMeritUnitUseCase,
  IDeclareMeritUseCase,
  IDeleteMeritUnitUseCase,
  IListAdminMeritUnitsUseCase,
  IListOwnMeritDeclarationsUseCase,
  ISetMeritUnitActiveUseCase,
  IUpdateMeritUnitUseCase,
} from '@/application/contracts/merit';
import {
  MeritDeclarationAlreadyCompletedException,
  MeritUnitNotFoundException,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  DeclareMeritBodyDto,
  DeclareMeritResponseDto,
  DeleteMeritUnitResponseDto,
  ListAdminMeritUnitsQueryDto,
  ListMeritUnitsQueryDto,
  ListMeritUnitsResponseDto,
  ListOwnMeritDeclarationsResponseDto,
  MeritDeclarationWrapperResponseDto,
  MeritUnitIdParamDto,
  MeritUnitWrapperResponseDto,
  PatchMeritUnitBodyDto,
  SetMeritUnitActiveBodyDto,
  WriteMeritUnitBodyDto,
} from '../../dto/merit/merit.dto';
import { RequiresPermission } from '../../guards';

/**
 * Đường CẦN token cho người dùng: khai công đức và xem lại lời khai của mình.
 *
 * ## Thứ tự route
 *
 * `declarations/mine` và `declarations/:declarationId/complete` khai TRƯỚC các route nhận
 * `:id` ở gốc. Nest khớp theo thứ tự khai.
 */
@ApiTags('Công đức / Hồi hướng')
@ApiBearerAuth()
@Controller('merit-units')
export class MeritController {
  public constructor(
    @Inject(IDeclareMeritUseCase)
    private readonly declareUseCase: IDeclareMeritUseCase,
    @Inject(ICompleteMeritDeclarationUseCase)
    private readonly completeUseCase: ICompleteMeritDeclarationUseCase,
    @Inject(IListOwnMeritDeclarationsUseCase)
    private readonly listOwnUseCase: IListOwnMeritDeclarationsUseCase,
  ) {}

  @Get('declarations/mine')
  @ApiOperation({
    summary: 'Lời khai công đức của tôi',
    description:
      'KHÔNG ẩn danh ở đây — bạn xem lịch sử của chính mình. `isAnonymous` là tuỳ chọn hiển ' +
      'thị trên Sổ vàng công khai, không phải một lệnh xoá dữ liệu.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({
    type: ResponseDto.forApi(ListOwnMeritDeclarationsResponseDto),
  })
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListMeritUnitsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listOwnUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Patch('declarations/:declarationId/complete')
  @ApiOperation({
    summary: 'Đánh dấu đã chuyển',
    description:
      'Đổi `INTENDED` sang `COMPLETED`. MỘT CHIỀU: `COMPLETED` không quay lại được, vì lùi ' +
      'trạng thái là sửa lại một lời khai đã công bố trên Sổ vàng.\n\n' +
      'Chỉ người khai đổi được, và phép kiểm đó nằm trong `WHERE` của chính câu `UPDATE` — ' +
      'lời khai của người khác trả 404 chứ không 403, vì sự tồn tại của một lời khai ẩn danh ' +
      'là thứ không nên dò được bằng cách thử id.\n\n' +
      '`COMPLETED` vẫn là LỜI KHAI — hệ thống không xác minh giao dịch ngân hàng.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    MeritUnitNotFoundException,
    MeritDeclarationAlreadyCompletedException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(MeritDeclarationWrapperResponseDto),
  })
  public async complete(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('declarationId') declarationId: string,
  ) {
    const declaration = await this.completeUseCase.handle({
      actorUserId: principal.userId,
      declarationId,
    });

    return ResponseDto.create().succeed().attach({ declaration }).build();
  }

  @Post(':id/declarations')
  @ApiOperation({
    summary: 'Khai số tiền công đức',
    description:
      'UI-MERIT-01: *"User tự khai số tiền dự định/đã thực hiện TRƯỚC khi deep-link sang ứng ' +
      'dụng ngân hàng; hệ thống không mặc định xác minh giao dịch ngân hàng."*\n\n' +
      'Con số **CÓ được lưu** (Bên A đã chốt), nhưng nó là lời khai: không đối chiếu với ngân ' +
      'hàng, và **không sinh điểm** — một con số không kiểm được mà đẻ ra điểm là mở đường để ' +
      'gõ 10 tỷ lấy điểm.\n\n' +
      'Trả về `vietQrUrl` đã gắn ĐÚNG số tiền vừa khai. Đó là lý do bước khai đi trước: không ' +
      'có nó thì người dùng tự nhập số tiền trong app ngân hàng, và con số trên Sổ vàng lệch ' +
      'với con số thật ngay từ bước đầu.\n\n' +
      'Chỉ khai được cho đơn vị đang HIỆN — đơn vị đã tắt là đơn vị Admin đã rút khỏi danh ' +
      'sách, và nhận lời khai cho nó là để người dùng chuyển tiền vào một tài khoản mà hệ ' +
      'thống vừa thôi bảo đảm.',
  })
  @ApiErrorResponses(...ApiTokenErrors, MeritUnitNotFoundException, [
    ValidationFailedException,
    ['declaredAmount phải là số nguyên VNĐ'],
  ])
  @ApiCreatedResponse({ type: ResponseDto.forApi(DeclareMeritResponseDto) })
  public async declare(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: MeritUnitIdParamDto,
    @Body() body: DeclareMeritBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.declareUseCase.handle({
          actorUserId: principal.userId,
          unitId: param.id,
          declaredAmount: body.declaration.declaredAmount,
          status: body.declaration.status,
          isAnonymous: body.declaration.isAnonymous,
          note: body.declaration.note,
        }),
      )
      .build();
  }
}

/**
 * Quản trị đơn vị Công đức.
 *
 * `merit.manage` là quyền NHẠY NHẤT trong Admin CMS: đơn vị mang số tài khoản ngân hàng, và
 * sửa được nó là chuyển dòng tiền công đức sang tài khoản khác trong khi người dùng chỉ quét
 * mã QR do hệ thống dựng và tin nó. Vì vậy chỉ `SUPER_ADMIN` được cấp — xem migration
 * `1798800000000`.
 */
@ApiTags('Admin - Công đức')
@ApiBearerAuth()
@Controller('admin/merit-units')
export class AdminMeritController {
  public constructor(
    @Inject(IListAdminMeritUnitsUseCase)
    private readonly listUseCase: IListAdminMeritUnitsUseCase,
    @Inject(ICreateMeritUnitUseCase)
    private readonly createUseCase: ICreateMeritUnitUseCase,
    @Inject(IUpdateMeritUnitUseCase)
    private readonly updateUseCase: IUpdateMeritUnitUseCase,
    @Inject(ISetMeritUnitActiveUseCase)
    private readonly setActiveUseCase: ISetMeritUnitActiveUseCase,
    @Inject(IDeleteMeritUnitUseCase)
    private readonly deleteUseCase: IDeleteMeritUnitUseCase,
  ) {}

  @Get()
  @RequiresPermission('merit.read')
  @ApiOperation({
    summary: 'Danh sách đơn vị Công đức',
    description:
      '`includeInactive=true` để thấy cả đơn vị đã tắt. Quyền `merit.read` — ' +
      '`CAMPAIGN_MANAGER` và `AUDITOR` có quyền này để đối soát, nhưng KHÔNG sửa được.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListMeritUnitsResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminMeritUnitsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          includeInactive: query.includeInactive ?? false,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('merit.manage')
  @ApiOperation({
    summary: 'Tạo đơn vị Công đức',
    description:
      'UI-MERIT-01: đơn vị/chùa/quỹ do **Admin tự tạo và đăng từ CMS**; người dùng không có ' +
      'đường tự tạo.\n\n' +
      'Ba trường ngân hàng phải ĐỦ BỘ — thiếu một trường là một mã QR không quét được, và ' +
      'người dùng chỉ phát hiện sau khi đã mở app ngân hàng. Quyền `merit.manage`, chỉ ' +
      '`SUPER_ADMIN` có.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['bankBin phải là sáu chữ số theo chuẩn Napas'],
  ])
  @ApiCreatedResponse({ type: ResponseDto.forApi(MeritUnitWrapperResponseDto) })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteMeritUnitBodyDto,
  ) {
    const unit = await this.createUseCase.handle({
      ...body.unit,
      actorUserId: principal.userId,
    });

    return ResponseDto.create().succeed().attach({ unit }).build();
  }

  @Patch(':id')
  @RequiresPermission('merit.manage')
  @ApiOperation({
    summary: 'Sửa đơn vị Công đức',
    description:
      'Chỉ sửa những trường có gửi. **Sửa `bankAccountNumber` là chuyển dòng tiền công đức ' +
      'sang tài khoản khác** — đây là lượt ghi nhạy nhất trong hệ, nên quyền của nó là một ô ' +
      'tick riêng mà Bên A bật có ý thức.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    MeritUnitNotFoundException,
    [
      ValidationFailedException,
      ['bankBin phải là sáu chữ số theo chuẩn Napas'],
    ],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(MeritUnitWrapperResponseDto) })
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: MeritUnitIdParamDto,
    @Body() body: PatchMeritUnitBodyDto,
  ) {
    const unit = await this.updateUseCase.handle({
      ...body.unit,
      actorUserId: principal.userId,
      unitId: param.id,
    });

    return ResponseDto.create().succeed().attach({ unit }).build();
  }

  @Patch(':id/active')
  @RequiresPermission('merit.manage')
  @ApiOperation({
    summary: 'Bật hoặc tắt đơn vị',
    description:
      'Tắt thì đơn vị rời khỏi danh sách công khai và KHÔNG nhận lời khai mới. Sổ vàng đã có ' +
      'vẫn giữ nguyên.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    MeritUnitNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(MeritUnitWrapperResponseDto) })
  public async setActive(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: MeritUnitIdParamDto,
    @Body() body: SetMeritUnitActiveBodyDto,
  ) {
    const unit = await this.setActiveUseCase.handle({
      actorUserId: principal.userId,
      unitId: param.id,
      isActive: body.unit.isActive,
    });

    return ResponseDto.create().succeed().attach({ unit }).build();
  }

  @Delete(':id')
  @RequiresPermission('merit.manage')
  @ApiOperation({
    summary: 'Xoá đơn vị',
    description:
      'Xoá MỀM. Sổ vàng của một đơn vị là lịch sử phát tâm của người dùng — xoá cứng là ' +
      '`ON DELETE CASCADE` gỡ sạch những hàng đó.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    MeritUnitNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(DeleteMeritUnitResponseDto) })
  public async remove(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: MeritUnitIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.deleteUseCase.handle({
          actorUserId: principal.userId,
          unitId: param.id,
        }),
      )
      .build();
  }
}
