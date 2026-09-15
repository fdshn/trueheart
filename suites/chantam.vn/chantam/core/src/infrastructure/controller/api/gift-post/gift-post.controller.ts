import {
  ICreateGiftPostUseCase,
  IDeleteGiftPostUseCase,
  IGetGiftPostUseCase,
  IGetNearbyGiftPostsUseCase,
  IUpdateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import {
  GiftPostAlreadyClosedException,
  GiftPostNotFoundException,
} from '@/domain/exceptions';
import {
  ICreateGiftPostResponseDto,
  IDeleteGiftPostResponseDto,
  IGetGiftPostResponseDto,
  IGetNearbyGiftPostsResponseDto,
  IUpdateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { Public } from '@chantam/service.auth-lib';
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
 * TẠM THỜI mở toàn bộ bằng `@Public()`.
 *
 * Guard mặc định khoá mọi endpoint, mà `gift-post` là resource mẫu dựng trước
 * khi có xác thực — khoá lại sẽ làm hỏng smoke test đang chạy. Khi làm M2 thì
 * bỏ `@Public()` ở các endpoint ghi (tạo/sửa/xoá) và lấy `giverId` từ token.
 */
@Public()
@ApiTags('Bài đăng cho tặng')
@Controller('api/gift-posts')
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
  @ApiOperation({ summary: 'Đăng một bài cho tặng mới' })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreateGiftPostResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['giftPost.title: title should not be empty'],
  ])
  public async createGiftPost(
    @Body() body: CreateGiftPostBodyDto,
  ): Promise<ResponseDto<ICreateGiftPostResponseDto>> {
    const result = await this.createGiftPostUseCase.handle({ ...body });

    return ResponseDto.create<ICreateGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Danh sách bài đăng quanh đây, sắp xếp gần → xa',
    description:
      'Toạ độ trả về luôn được làm nhiễu vì đây là kênh công khai (đặc tả mục 1.3).',
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

  @Get(':giftPostId')
  @ApiOperation({ summary: 'Chi tiết một bài đăng' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [GiftPostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
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
  @ApiOperation({ summary: 'Cập nhật bài đăng' })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdateGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [GiftPostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [
      GiftPostAlreadyClosedException,
      '4182a141-a5c5-5c25-92ab-0d4488158e8f',
      'COMPLETED',
    ],
  )
  public async updateGiftPost(
    @Param() params: UpdateGiftPostParamsDto,
    @Body() body: UpdateGiftPostBodyDto,
  ): Promise<ResponseDto<IUpdateGiftPostResponseDto>> {
    const result = await this.updateGiftPostUseCase.handle({
      ...params,
      ...body,
    });

    return ResponseDto.create<IUpdateGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Delete(':giftPostId')
  @ApiOperation({ summary: 'Gỡ bài đăng (xoá mềm)' })
  @ApiOkResponse({ type: ResponseDto.forApi(DeleteGiftPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['giftPost.title: title should not be empty']],
    [GiftPostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  )
  public async deleteGiftPost(
    @Param() params: DeleteGiftPostParamsDto,
  ): Promise<ResponseDto<IDeleteGiftPostResponseDto>> {
    const result = await this.deleteGiftPostUseCase.handle({ ...params });

    return ResponseDto.create<IDeleteGiftPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
