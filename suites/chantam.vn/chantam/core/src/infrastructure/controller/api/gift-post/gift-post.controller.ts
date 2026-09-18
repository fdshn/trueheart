import {
  ICreateGiftPostUseCase,
  IDeleteGiftPostUseCase,
  IGetGiftPostUseCase,
  IGetNearbyGiftPostsUseCase,
  IUpdateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import {
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  ICreateGiftPostResponseDto,
  IDeleteGiftPostResponseDto,
  IGetGiftPostResponseDto,
  IGetNearbyGiftPostsResponseDto,
  IUpdateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal, Public } from '@chantam/service.auth-lib';
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
  CreateGiftPostBodyDto,
  CreateGiftPostResponseDto,
  DeleteGiftPostParamsDto,
  DeleteGiftPostResponseDto,
  GetGiftPostParamsDto,
  GetGiftPostResponseDto,
  GetNearbyGiftPostsQueryDto,
  GetNearbyGiftPostsResponseDto,
  UpdateGiftPostBodyDto,
  UpdateGiftPostParamsDto,
  UpdateGiftPostResponseDto,
} from '../../dto/gift-post';

/**
 * Controller chỉ làm ba việc: nhận DTO đã validate, gọi `useCase.handle()`, bọc
 * kết quả vào `ResponseDto`. Không có nghiệp vụ nào ở đây.
 */
/**
 * Bài đọc vẫn công khai. Đường ghi lấy danh tính từ JWT — client không được
 * khai giverId trong body, và F07 profile gate áp dụng ở use case.
 */
@ApiTags('Bài đăng cho tặng')
@Controller('gift-posts')
export class GiftPostController {
  public constructor(
    @Inject(ICreateGiftPostUseCase)
    private readonly createGiftPostUseCase: ICreateGiftPostUseCase,
    @Inject(IGetGiftPostUseCase)
    private readonly getGiftPostUseCase: IGetGiftPostUseCase,
    @Inject(IGetNearbyGiftPostsUseCase)
    private readonly getNearbyGiftPostsUseCase: IGetNearbyGiftPostsUseCase,
    @Inject(IUpdateGiftPostUseCase)
    private readonly updateGiftPostUseCase: IUpdateGiftPostUseCase,
    @Inject(IDeleteGiftPostUseCase)
    private readonly deleteGiftPostUseCase: IDeleteGiftPostUseCase,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đăng một bài cho tặng mới',
    description: [
      'Bài tạo ra ở trạng thái `PENDING_REVIEW`, chưa hiện trên bảng tin cho tới khi được kiểm duyệt.',
      '',
      'Toạ độ gửi lên là toạ độ THẬT và được lưu nguyên vẹn, nhưng mọi kênh công khai chỉ thấy bản đã làm nhiễu trong bán kính 300m. Toạ độ thật chỉ lộ cho người đã được người tặng duyệt cho nhận.',
    ].join('\n'),
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreateGiftPostResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['giftPost.title: title should not be empty'],
  ])
  public async createGiftPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateGiftPostBodyDto,
  ): Promise<ResponseDto<ICreateGiftPostResponseDto>> {
    const result = await this.createGiftPostUseCase.handle({
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<ICreateGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Get('nearby')
  @ApiOperation({
    summary: 'Danh sách bài đăng quanh đây, sắp xếp gần → xa',
    description: [
      'Truyền vị trí NGƯỜI XEM (`lat`, `lng`) và bán kính `radiusMeters`; kết quả là các bài đã duyệt nằm trong bán kính đó, gần trước xa sau.',
      '',
      'Hai lớp bảo vệ vị trí, cả hai đều cố ý:',
      '',
      '- Toạ độ trả về đã bị làm nhiễu quanh vị trí thật (đặc tả mục 1.3)',
      '- `distanceMeters` làm tròn xuống bội số 100m, vì đo khoảng cách chính xác từ ba điểm là dò ngược ra được vị trí thật',
    ].join('\n'),
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetNearbyGiftPostsResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['radiusMeters: radiusMeters must not be greater than 50000'],
  ])
  public async getNearbyGiftPosts(
    @Query() query: GetNearbyGiftPostsQueryDto,
  ): Promise<ResponseDto<IGetNearbyGiftPostsResponseDto>> {
    const result = await this.getNearbyGiftPostsUseCase.handle({ ...query });

    return ResponseDto.create<IGetNearbyGiftPostsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Get(':giftPostId')
  @ApiOperation({
    summary: 'Chi tiết một bài đăng',
    description:
      'Trả về `isLocationApproximate` để client biết toạ độ đang là thật hay đã làm nhiễu. Bài đã gỡ trả 404.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  )
  public async getGiftPost(
    @Param() params: GetGiftPostParamsDto,
  ): Promise<ResponseDto<IGetGiftPostResponseDto>> {
    // `canViewExactLocation` cố ý KHÔNG lấy từ client. Khi có auth-lib, giá trị
    // này được suy ra từ trạng thái đơn xin của người gọi.
    const result = await this.getGiftPostUseCase.handle({
      ...params,
      canViewExactLocation: false,
    });

    return ResponseDto.create<IGetGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':giftPostId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật bài đăng',
    description: [
      'Chỉ gửi những trường muốn đổi; trường không gửi thì giữ nguyên. Legacy route chỉ sửa content; status do canonical moderation route quản lý.',
      '',
      'Bài đã đóng (`COMPLETED` hoặc `CANCELLED`) không sửa được nữa — trả 409.',
    ].join('\n'),
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdateGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [PostInvalidStateException],
  )
  public async updateGiftPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UpdateGiftPostParamsDto,
    @Body() body: UpdateGiftPostBodyDto,
  ): Promise<ResponseDto<IUpdateGiftPostResponseDto>> {
    const result = await this.updateGiftPostUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IUpdateGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Delete(':giftPostId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ bài đăng (xoá mềm)',
    description:
      'Bài biến mất khỏi mọi endpoint đọc nhưng dữ liệu vẫn nằm trong database, để giữ lịch sử giao dịch và điểm cống hiến đã ghi nhận.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(DeleteGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  )
  public async deleteGiftPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: DeleteGiftPostParamsDto,
  ): Promise<ResponseDto<IDeleteGiftPostResponseDto>> {
    const result = await this.deleteGiftPostUseCase.handle({
      ...params,
      userId: principal.userId,
    });

    return ResponseDto.create<IDeleteGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
