import {
  IGetLunarTodayUseCase,
  IListLunarHolidaysUseCase,
  IReplaceLunarHolidaysUseCase,
} from '@/application/contracts/lunar';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  LunarHolidayListResponseDto,
  LunarTodayResponseDto,
  ReplaceLunarHolidaysBodyDto,
} from '../../dto/lunar/lunar.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Lịch Âm')
@Controller('config')
export class LunarController {
  public constructor(
    @Inject(IGetLunarTodayUseCase)
    private readonly getTodayUseCase: IGetLunarTodayUseCase,
  ) {}

  @Get('lunar-today')
  @Public()
  @ApiOperation({
    summary: 'Ngày âm lịch hôm nay, can chi, mốc Rằm/Mùng Một và ngày lễ',
    description:
      'Công khai, không cần token — đây là dữ liệu cho header trang chủ, hiện cả với ' +
      'khách chưa đăng nhập.\n\n' +
      'UC-LUNAR-01 nói client tự chuyển đổi ngày, và đúng là nó nên làm vậy cho phần ' +
      'hiển thị. Endpoint này tồn tại vì hai thứ khác: **danh mục Ngày lễ Phật giáo ' +
      'chuẩn** (bước 3) phải có một nguồn duy nhất — nhúng vào app thì sửa một ngày lễ ' +
      'phải chờ Store duyệt và hai bản app đang chạy hiện hai danh mục khác nhau — và ' +
      '**câu biểu ngữ** (bước 4) là nội dung sản phẩm, không phải chuỗi hardcode trong ' +
      'bản cài.\n\n' +
      'Ngày được cắt theo **UTC+7**, không theo múi giờ của máy chạy. Việt Nam không có ' +
      'DST nên cộng thẳng 7 giờ là đủ — cùng quy ước `businessDateOf` của phân hệ điểm ' +
      'danh, và hai chỗ đó PHẢI giống nhau: một bản ghi điểm danh ngày Rằm phải khớp tấm ' +
      'biểu ngữ ngày Rằm người dùng vừa thấy.\n\n' +
      '`observance` nhận hai ngày cho mỗi mốc (14 và 15 là Rằm; 30 và 1 là Mùng Một) — ' +
      'đúng danh sách đặc tả nêu, vì lễ chùa diễn ra cả đêm trước.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LunarTodayResponseDto) })
  public async getToday() {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getTodayUseCase.handle({}))
      .build();
  }
}

@ApiTags('Admin - Lịch Âm & Ngày lễ')
@ApiBearerAuth()
@Controller('admin')
export class AdminLunarController {
  public constructor(
    @Inject(IListLunarHolidaysUseCase)
    private readonly listUseCase: IListLunarHolidaysUseCase,
    @Inject(IReplaceLunarHolidaysUseCase)
    private readonly replaceUseCase: IReplaceLunarHolidaysUseCase,
  ) {}

  @Get('lunar-holidays')
  @RequiresPermission('config.read')
  @ApiOperation({
    summary: 'Danh mục Ngày lễ Phật giáo, gồm cả dòng đã tắt',
    description:
      'Trả cả dòng `isActive: false` — CMS cần thấy chúng để bật lại. Mười ngày lễ được ' +
      'seed sẵn và BẬT.\n\n' +
      'Khác mọi policy khác trong repo, vốn seed TẮT: những cái đó phát điểm hoặc đổi ' +
      'hành vi, nên một mặc định có tác dụng là tự quyết hộ Bên A. Danh mục này chỉ để ' +
      'HIỂN THỊ, và rỗng nghĩa là app không có huy hiệu nào trong khi UC-LUNAR-01 gọi ' +
      'lịch âm là "chức năng BẮT BUỘC trong Phase 1".',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LunarHolidayListResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.listUseCase.handle({ actorUserId: principal.userId }))
      .build();
  }

  @Put('lunar-holidays')
  @RequiresPermission('config.write')
  @ApiOperation({
    summary: 'Thay toàn bộ danh mục Ngày lễ',
    description:
      'Thay cả bộ trong MỘT transaction, không vá từng dòng — cùng lối ' +
      '`PUT /admin/groups/:groupId/role-permissions`. Một danh mục nửa cũ nửa mới là thứ ' +
      'không ai đọc được khi đi soát lại, và CMS vốn hiện cả bảng rồi lưu cả bảng.\n\n' +
      'Khoá là cặp (tháng, ngày) âm lịch, **không có năm**: ngày lễ lặp hằng năm theo âm ' +
      'lịch, nên lưu kèm năm là lưu cùng một dòng 50 lần và mời một năm bị bỏ sót.\n\n' +
      'Hai chỗ TỪ CHỐI: trùng cặp (tháng, ngày) — client không biết hiện huy hiệu nào; ' +
      'và danh mục rỗng — tắt từng dòng bằng `isActive` thay vì xoá hết.\n\n' +
      '`sortOrder` do VỊ TRÍ trong mảng quyết định, không nhận từ client: nhận vào thì ' +
      'hai dòng cùng số là chuyện sẽ xảy ra, và lúc đó thứ tự hiện ra tuỳ cách Postgres ' +
      'trả hàng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LunarHolidayListResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      [
        'holidays không được rỗng — tắt từng ngày lễ bằng `isActive` thay vì xoá hết',
      ],
    ],
  )
  public async replace(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ReplaceLunarHolidaysBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.replaceUseCase.handle({
          actorUserId: principal.userId,
          holidays: body.lunar.holidays,
        }),
      )
      .build();
  }
}
