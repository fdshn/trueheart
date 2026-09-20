import {
  IAttachPostMediaUseCase,
  ICreatePostUseCase,
  IDeletePostUseCase,
  IGetMyPostsUseCase,
  IGetNearbyPostsUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IGetSmartMatchesUseCase,
  IModeratePostUseCase,
  IRemovePostMediaUseCase,
  IReorderPostMediaUseCase,
  IRequestPostMediaUploadUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  PostNotFoundException,
  PostQuotaExceededException,
  ProfileIncompleteException,
} from '@/domain/exceptions';
import {
  IAttachPostMediaResponseDto,
  ICreatePostResponseDto,
  IGetMyPostsResponseDto,
  IGetNearbyPostsResponseDto,
  IGetPostMapResponseDto,
  IGetPostResponseDto,
  IGetSmartMatchesResponseDto,
  IModeratePostResponseDto,
  IReorderPostMediaResponseDto,
  IUpdatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
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
import { IStorageUploadResult } from '@chantam/service.storage-lib';
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
  AttachPostMediaBodyDto,
  AttachPostMediaResponseDto,
  CreatePostBodyDto,
  CreatePostResponseDto,
  GetMyPostsQueryDto,
  GetMyPostsResponseDto,
  GetNearbyPostsQueryDto,
  GetNearbyPostsResponseDto,
  GetPostMapQueryDto,
  GetPostMapResponseDto,
  GetPostParamsDto,
  GetPostResponseDto,
  GetSmartMatchesQueryDto,
  GetSmartMatchesResponseDto,
  ModeratePostBodyDto,
  ModeratePostParamsDto,
  ModeratePostResponseDto,
  PostMediaItemParamsDto,
  PostMediaParamsDto,
  PostMediaUploadResponseDto,
  ReorderPostMediaBodyDto,
  RequestPostMediaUploadDto,
  UpdatePostBodyDto,
  UpdatePostParamsDto,
  UpdatePostResponseDto,
} from '../../dto/post';

@ApiTags('Bài đăng')
@Controller('posts')
export class PostController {
  public constructor(
    @Inject(ICreatePostUseCase)
    private readonly createPostUseCase: ICreatePostUseCase,
    @Inject(IDeletePostUseCase)
    private readonly deletePostUseCase: IDeletePostUseCase,
    @Inject(IAttachPostMediaUseCase)
    private readonly attachPostMediaUseCase: IAttachPostMediaUseCase,
    @Inject(IRequestPostMediaUploadUseCase)
    private readonly requestPostMediaUploadUseCase: IRequestPostMediaUploadUseCase,
    @Inject(IReorderPostMediaUseCase)
    private readonly reorderPostMediaUseCase: IReorderPostMediaUseCase,
    @Inject(IRemovePostMediaUseCase)
    private readonly removePostMediaUseCase: IRemovePostMediaUseCase,
    @Inject(IGetPostMapUseCase)
    private readonly getPostMapUseCase: IGetPostMapUseCase,
    @Inject(IGetNearbyPostsUseCase)
    private readonly getNearbyPostsUseCase: IGetNearbyPostsUseCase,
    @Inject(IGetMyPostsUseCase)
    private readonly getMyPostsUseCase: IGetMyPostsUseCase,
    @Inject(IGetPostUseCase)
    private readonly getPostUseCase: IGetPostUseCase,
    @Inject(IGetSmartMatchesUseCase)
    private readonly getSmartMatchesUseCase: IGetSmartMatchesUseCase,
    @Inject(IModeratePostUseCase)
    private readonly moderatePostUseCase: IModeratePostUseCase,
    @Inject(IUpdatePostUseCase)
    private readonly updatePostUseCase: IUpdatePostUseCase,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo canonical post Generic MVP',
    description:
      'Type được validate từ Generic MVP; tác giả và trạng thái do server quyết định, bài luôn tạo ở PENDING_REVIEW.',
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

  @Post(':postId/media/upload')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xin presigned URL upload ảnh cho canonical post',
    description:
      'Chỉ owner. Key bind cả user và post; client phải PUT rồi submit key qua endpoint attach.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(PostMediaUploadResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['contentType: contentType should not be empty'],
  ])
  public async requestPostMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: PostMediaParamsDto,
    @Body() body: RequestPostMediaUploadDto,
  ): Promise<ResponseDto<IStorageUploadResult>> {
    const result = await this.requestPostMediaUploadUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IStorageUploadResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/media')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gắn ảnh đã upload vào canonical post',
    description:
      'Chỉ owner. Server HeadObject xác minh key, MIME, size và đúng namespace user/post trước khi lưu.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(AttachPostMediaResponseDto) })
  public async attachPostMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: PostMediaParamsDto,
    @Body() body: AttachPostMediaBodyDto,
  ): Promise<ResponseDto<IAttachPostMediaResponseDto>> {
    const result = await this.attachPostMediaUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IAttachPostMediaResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':postId/media/order')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thay thứ tự toàn bộ ảnh canonical post',
    description:
      'Chỉ owner. Gửi đầy đủ mediaIds không trùng của đúng post; server cập nhật atomically.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AttachPostMediaResponseDto) })
  public async reorderPostMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: PostMediaParamsDto,
    @Body() body: ReorderPostMediaBodyDto,
  ): Promise<ResponseDto<IReorderPostMediaResponseDto>> {
    const result = await this.reorderPostMediaUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IReorderPostMediaResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Delete(':postId/media/:mediaId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ ảnh khỏi canonical post',
    description:
      'Chỉ owner. Chỉ xoá bản ghi media của đúng post; object storage cleanup theo lifecycle riêng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(Object) })
  public async removePostMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: PostMediaItemParamsDto,
  ): Promise<ResponseDto<{}>> {
    await this.removePostMediaUseCase.handle({
      ...params,
      userId: principal.userId,
    });

    return ResponseDto.create<{}>().succeed().attach({}).build();
  }

  @Delete(':postId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ canonical post',
    description:
      'Chỉ owner. Xoá mềm và chuyển CANCELLED; transaction guard sẽ bổ sung khi M3 có giao dịch.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(Object) })
  public async deletePost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UpdatePostParamsDto,
  ): Promise<ResponseDto<{}>> {
    await this.deletePostUseCase.handle({
      ...params,
      userId: principal.userId,
    });

    return ResponseDto.create<{}>().succeed().attach({}).build();
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
  @Get('nearby')
  @ApiOperation({
    summary: 'Quét canonical post quanh đây theo loại bài',
    description:
      'Chỉ trả bài public; toạ độ luôn jitter và khoảng cách được bucket để bảo vệ vị trí chính xác.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetNearbyPostsResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    [
      'postType: postType must be one of the following values: OFFER, WANTED, CHARITY, CLASSIFIED, MERIT',
    ],
  ])
  public async getNearbyPosts(
    @Query() query: GetNearbyPostsQueryDto,
  ): Promise<ResponseDto<IGetNearbyPostsResponseDto>> {
    const result = await this.getNearbyPostsUseCase.handle(query);

    return ResponseDto.create<IGetNearbyPostsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  // PHẢI đứng trước `:postId`, nếu không "me" bị nuốt thành một postId và
  // route này không bao giờ chạy.
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bài đăng của chính mình',
    description:
      'Lọc theo loại bài, trạng thái duyệt/hiển thị và danh mục, có phân trang. ' +
      'Dùng `?postType=CLASSIFIED` để lấy danh sách tin rao vặt của bạn. ' +
      'Khác discovery công khai ở hai điểm: trả cả bài PENDING_REVIEW/REJECTED, ' +
      'và toạ độ là toạ độ THẬT vì đây là bài của chính bạn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetMyPostsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['postType: postType must be a valid enum value'],
  ])
  public async getMyPosts(
    @Query() query: GetMyPostsQueryDto,
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetMyPostsResponseDto>> {
    const result = await this.getMyPostsUseCase.handle({
      ...query,
      userId: principal.userId,
    });

    return ResponseDto.create<IGetMyPostsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  // Đặt TRƯỚC `:postId` cho dễ đọc, dù Nest khớp theo số đoạn nên không đụng
  // nhau. Người sau thêm route `:postId/...` khác sẽ theo đúng chỗ này.
  @Get(':postId/matches')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gợi ý bài ghép đôi cho bài của chính mình (Smart Match)',
    description:
      'Bài Muốn Nhận được ghép với Muốn Tặng và ngược lại, theo danh mục + từ khoá + khoảng cách. ' +
      'Chỉ GỢI Ý — không tạo giao dịch, quyết định cuối thuộc về người dùng. ' +
      'Chỉ tác giả bài nguồn gọi được, vì vị trí thật của bài được dùng làm tâm tìm kiếm. ' +
      'Toạ độ bài gợi ý vẫn bị làm nhiễu và khoảng cách làm tròn theo bậc.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetSmartMatchesResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['postId: postId must be a UUID']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
  )
  public async getSmartMatches(
    @Param() params: GetPostParamsDto,
    @Query() query: GetSmartMatchesQueryDto,
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetSmartMatchesResponseDto>> {
    const result = await this.getSmartMatchesUseCase.handle({
      postId: params.postId,
      userId: principal.userId,
      radiusMeters: query.radiusMeters,
      take: query.take,
    });

    return ResponseDto.create<IGetSmartMatchesResponseDto>()
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
