import {
  ICreateSponsorBannerUseCase,
  IDecideSponsorBannerApprovalUseCase,
  IDeleteSponsorBannerUseCase,
  IListAdminSponsorBannersUseCase,
  ISetSponsorBannerActiveUseCase,
  IUpdateSponsorBannerUseCase,
} from '@/application/contracts/sponsor-banner';
import {
  SponsorBannerApprovalAlreadyDecidedException,
  SponsorBannerNotFoundException,
} from '@/domain/exceptions';
import {
  BannerApprovalStatus,
  BannerPlacement,
} from '@chantam.vn/chantam.core-lib/models';
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
  AdminBannerWrapperResponseDto,
  BannerIdParamDto,
  DecideBannerApprovalBodyDto,
  DeleteBannerResponseDto,
  ListAdminBannersQueryDto,
  ListAdminBannersResponseDto,
  PatchSponsorBannerBodyDto,
  SetBannerActiveBodyDto,
  WriteSponsorBannerBodyDto,
} from '../../dto/sponsor-banner/sponsor-banner.dto';
import { RequiresPermission } from '../../guards';

/**
 * Quản trị Banner Tài Trợ / Quảng Cáo (UC-ADM-06).
 *
 * Quyền là cặp RIÊNG `banner.read` / `banner.manage`, không dùng lại `campaign.*`: duyệt một
 * banner là xác nhận với đối tác rằng nội dung của họ chạy đúng khung giờ đã bán, và
 * `impressionCount` là con số đối soát. Đó là hành vi thương mại, khác việc biên tập bố cục
 * Home. Xem migration `1798600000000`.
 */
@ApiTags('Admin - Banner Tài Trợ')
@ApiBearerAuth()
@Controller('admin/banners')
export class AdminSponsorBannerController {
  public constructor(
    @Inject(IListAdminSponsorBannersUseCase)
    private readonly listUseCase: IListAdminSponsorBannersUseCase,
    @Inject(ICreateSponsorBannerUseCase)
    private readonly createUseCase: ICreateSponsorBannerUseCase,
    @Inject(IUpdateSponsorBannerUseCase)
    private readonly updateUseCase: IUpdateSponsorBannerUseCase,
    @Inject(IDecideSponsorBannerApprovalUseCase)
    private readonly decideUseCase: IDecideSponsorBannerApprovalUseCase,
    @Inject(ISetSponsorBannerActiveUseCase)
    private readonly setActiveUseCase: ISetSponsorBannerActiveUseCase,
    @Inject(IDeleteSponsorBannerUseCase)
    private readonly deleteUseCase: IDeleteSponsorBannerUseCase,
  ) {}

  @Get()
  @RequiresPermission('banner.read')
  @ApiOperation({
    summary: 'Danh sách banner, kèm số liệu',
    description:
      'Lọc theo `placement` và `approvalStatus`. Trả `impressionCount`, `clickCount` và ' +
      '`clickThroughRate` để đối soát với đối tác.\n\n' +
      '`clickThroughRate` tính hai chữ số thập phân, không làm tròn về phần trăm nguyên: ' +
      'CTR banner thường dưới 1%, nên làm tròn nguyên biến mọi banner thành "0%" và Admin ' +
      'mất hẳn cách so banner nào hiệu quả hơn.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminBannersResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminBannersQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          placement: query.placement as BannerPlacement | undefined,
          approvalStatus: query.approvalStatus as
            BannerApprovalStatus | undefined,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('banner.manage')
  @ApiOperation({
    summary: 'Tạo banner',
    description:
      'UC-POST-04: Phase 1 banner **chỉ do Admin tạo từ CMS**, nên banner vào thẳng ' +
      '`APPROVED` và `approvedBy` ghi chính người tạo.\n\n' +
      'Máy trạng thái ba bước vẫn giữ nguyên dù hiện chưa dùng tới bước chờ: khi nào mở cho ' +
      'đối tác tự gửi hồ sơ thì chỉ phải đổi hai dòng trong use case, không phải thêm một ' +
      'cột và một luồng duyệt.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['endsAt phải sau startsAt'],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(AdminBannerWrapperResponseDto),
  })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteSponsorBannerBodyDto,
  ) {
    const banner = await this.createUseCase.handle({
      ...body.banner,
      actorUserId: principal.userId,
    });

    return ResponseDto.create().succeed().attach({ banner }).build();
  }

  @Patch(':id')
  @RequiresPermission('banner.manage')
  @ApiOperation({
    summary: 'Sửa banner',
    description:
      'Chỉ sửa những trường có gửi; trường bỏ trống nghĩa là "không đổi". Không gửi gì thì ' +
      '**không** chạy câu `UPDATE` nào — một `UPDATE` rỗng vẫn đụng `updatedAt`, và Admin ' +
      'mất cách biết banner nào thật sự được sửa.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    SponsorBannerNotFoundException,
    [ValidationFailedException, ['endsAt phải sau startsAt']],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(AdminBannerWrapperResponseDto) })
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: BannerIdParamDto,
    @Body() body: PatchSponsorBannerBodyDto,
  ) {
    const banner = await this.updateUseCase.handle({
      ...body.banner,
      actorUserId: principal.userId,
      bannerId: param.id,
    });

    return ResponseDto.create().succeed().attach({ banner }).build();
  }

  @Patch(':id/approval')
  @RequiresPermission('banner.manage')
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối banner',
    description:
      'Chỉ đổi được banner còn `PENDING_APPROVAL`. Hai Admin bấm cùng lúc thì người sau ' +
      'nhận 409 — phép kiểm đó nằm trong `WHERE` của chính câu `UPDATE`.\n\n' +
      'Hiện mọi banner do Admin tạo đã là `APPROVED`, nên đường này dành cho khi mở cho đối ' +
      'tác tự gửi hồ sơ.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    SponsorBannerNotFoundException,
    SponsorBannerApprovalAlreadyDecidedException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(AdminBannerWrapperResponseDto) })
  public async decide(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: BannerIdParamDto,
    @Body() body: DecideBannerApprovalBodyDto,
  ) {
    const banner = await this.decideUseCase.handle({
      actorUserId: principal.userId,
      bannerId: param.id,
      approve: body.approval.approve,
      note: body.approval.note,
    });

    return ResponseDto.create().succeed().attach({ banner }).build();
  }

  @Patch(':id/active')
  @RequiresPermission('banner.manage')
  @ApiOperation({
    summary: 'Bật hoặc tắt banner',
    description:
      'Tắt thì banner rời khỏi đường phục vụ ngay, nhưng số liệu đã tích vẫn giữ nguyên — ' +
      'đó là con số đối soát của phần đã chạy.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    SponsorBannerNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(AdminBannerWrapperResponseDto) })
  public async setActive(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: BannerIdParamDto,
    @Body() body: SetBannerActiveBodyDto,
  ) {
    const banner = await this.setActiveUseCase.handle({
      actorUserId: principal.userId,
      bannerId: param.id,
      isActive: body.banner.isActive,
    });

    return ResponseDto.create().succeed().attach({ banner }).build();
  }

  @Delete(':id')
  @RequiresPermission('banner.manage')
  @ApiOperation({
    summary: 'Xoá banner',
    description:
      'Xoá MỀM. `impressionCount` của một banner đã chạy là bằng chứng của một hợp đồng đã ' +
      'thực hiện — xoá cứng là huỷ bằng chứng đó.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    SponsorBannerNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(DeleteBannerResponseDto) })
  public async remove(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: BannerIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.deleteUseCase.handle({
          actorUserId: principal.userId,
          bannerId: param.id,
        }),
      )
      .build();
  }
}
