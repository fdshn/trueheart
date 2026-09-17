import {
  ICreatePostUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IModeratePostUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  PostNotFoundException,
  PostQuotaExceededException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  ICreatePostResponseDto,
  IGetPostMapResponseDto,
  IGetPostResponseDto,
  IModeratePostResponseDto,
  IUpdatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal, Public } from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreatePostBodyDto,
  CreatePostResponseDto,
  GetPostMapQueryDto,
  GetPostMapResponseDto,
  GetPostParamsDto,
  GetPostResponseDto,
  ModeratePostBodyDto,
  ModeratePostParamsDto,
  ModeratePostResponseDto,
  UpdatePostBodyDto,
  UpdatePostParamsDto,
  UpdatePostResponseDto,
} from '../../dto/post';

@ApiTags('Bài đăng')
@Controller('api/posts')
export class PostController {
  public constructor(
    @Inject(ICreatePostUseCase)
    private readonly createPostUseCase: ICreatePostUseCase,
    @Inject(IGetPostMapUseCase)
    private readonly getPostMapUseCase: IGetPostMapUseCase,
    @Inject(IGetPostUseCase)
    private readonly getPostUseCase: IGetPostUseCase,
    @Inject(IModeratePostUseCase)
    private readonly moderatePostUseCase: IModeratePostUseCase,
    @Inject(IUpdatePostUseCase)
    private readonly updatePostUseCase: IUpdatePostUseCase,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo canonical OFFER',
    description:
      'Bài tạo ở PENDING_REVIEW; tác giả, type và trạng thái do server quyết định.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreatePostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['post.categoryId: categoryId must be a UUID']],
    [ProfileIncompleteException, ['Avatar', 'SĐT']],
    [CategoryNotFoundException],
    [PostQuotaExceededException, 3],
  )
  public async createPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreatePostBodyDto,
  ): Promise<ResponseDto<ICreatePostResponseDto>> {
    const result = await this.createPostUseCase.handle({
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<ICreatePostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':postId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật nội dung canonical post',
    description:
      'Chỉ owner sửa title, description hoặc areaLabel. Status/type/author do route riêng của server quản lý.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdatePostResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['post.title: title must be longer than or equal to 5 characters'],
  ])
  public async updatePost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UpdatePostParamsDto,
    @Body() body: UpdatePostBodyDto,
  ): Promise<ResponseDto<IUpdatePostResponseDto>> {
    const result = await this.updatePostUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IUpdatePostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':postId/moderation')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối canonical post',
    description:
      'Tạm thời chỉ username nằm trong POST_OPERATOR_USERNAMES được thực hiện. Owner không thể tự publish/reject.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ModeratePostResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    [
      'post.status: status must be one of the following values: PUBLISHED, REJECTED',
    ],
  ])
  public async moderatePost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ModeratePostParamsDto,
    @Body() body: ModeratePostBodyDto,
  ): Promise<ResponseDto<IModeratePostResponseDto>> {
    const result = await this.moderatePostUseCase.handle({
      ...params,
      ...body,
      username: principal.username,
    });

    return ResponseDto.create<IModeratePostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Get('map')
  @ApiOperation({
    summary: 'Marker canonical post trong khung bản đồ',
    description:
      'Chỉ trả tối đa 200 marker PUBLISHED/RESERVED, vị trí luôn jitter. Client tự cluster marker.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetPostMapResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['minLat: minLat must be a latitude'],
  ])
  public async getPostMap(
    @Query() query: GetPostMapQueryDto,
  ): Promise<ResponseDto<IGetPostMapResponseDto>> {
    const result = await this.getPostMapUseCase.handle(query);

    return ResponseDto.create<IGetPostMapResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Get(':postId')
  @ApiOperation({
    summary: 'Chi tiết một canonical post công khai',
    description:
      'Chỉ trả bài PUBLISHED hoặc RESERVED. Toạ độ luôn bị làm nhiễu ở kênh này.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetPostResponseDto) })
  @ApiErrorResponses(
    [ValidationFailedException, ['postId: postId must be a UUID']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  )
  public async getPost(
    @Param() params: GetPostParamsDto,
  ): Promise<ResponseDto<IGetPostResponseDto>> {
    const result = await this.getPostUseCase.handle(params);

    return ResponseDto.create<IGetPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
