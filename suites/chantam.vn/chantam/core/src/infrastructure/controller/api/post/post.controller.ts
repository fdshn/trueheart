import {
  IAttachPostMediaUseCase,
  ICreatePostUseCase,
  IDeletePostUseCase,
  IGetMyPostsUseCase,
  IGetNearbyPostsUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IGetSmartMatchesUseCase,
  IRemovePostMediaUseCase,
  IRenewPostUseCase,
  IReorderPostMediaUseCase,
  IRequestCharityTransferUseCase,
  IRequestPostMediaUploadUseCase,
  IReviewCharityTransferUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  PostCharityTransferInvalidStateException,
  PostHasLiveTransactionException,
  PostInvalidStateException,
  PostMediaLimitExceededException,
  PostMediaOrderInvalidException,
  PostNotFoundException,
  PostNotRenewableException,
  PostQuotaExceededException,
  PostRenewalLimitReachedException,
  PostSosNotAllowedException,
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
  IRenewPostResponseDto,
  IReorderPostMediaResponseDto,
  IRequestCharityTransferResponseDto,
  IReviewCharityTransferResponseDto,
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
  PostMediaItemParamsDto,
  PostMediaParamsDto,
  PostMediaUploadResponseDto,
  RenewPostParamsDto,
  RenewPostResponseDto,
  ReorderPostMediaBodyDto,
  RequestCharityTransferBodyDto,
  RequestCharityTransferParamsDto,
  RequestCharityTransferResponseDto,
  RequestPostMediaUploadDto,
  ReviewCharityTransferBodyDto,
  ReviewCharityTransferParamsDto,
  ReviewCharityTransferResponseDto,
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
    @Inject(IRenewPostUseCase)
    private readonly renewPostUseCase: IRenewPostUseCase,
    @Inject(IRequestCharityTransferUseCase)
    private readonly requestCharityTransferUseCase: IRequestCharityTransferUseCase,
    @Inject(IReviewCharityTransferUseCase)
    private readonly reviewCharityTransferUseCase: IReviewCharityTransferUseCase,
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
    @Inject(IUpdatePostUseCase)
    private readonly updatePostUseCase: IUpdatePostUseCase,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo canonical post Generic MVP',
    description:
      'Type được validate từ Generic MVP; tác giả và trạng thái do server quyết định. Bài lên thẳng `PUBLISHED`, hạn ba tháng tính từ lúc đăng — không có bước duyệt trước.',
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
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['contentType: contentType should not be empty'],
    ],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    PostMediaLimitExceededException,
    [PostInvalidStateException],
    [PostHasLiveTransactionException],
  )
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
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['storageKey: storageKey should not be empty']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    PostMediaLimitExceededException,
    [PostInvalidStateException],
    [PostHasLiveTransactionException],
  )
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
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['mediaIds: mediaIds should not be empty']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    PostMediaOrderInvalidException,
    [PostInvalidStateException],
    [PostHasLiveTransactionException],
  )
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
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['mediaId: mediaId must be an integer number']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    [PostInvalidStateException],
    [PostHasLiveTransactionException],
  )
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
    summary: 'Gỡ bài',
    description:
      'Chỉ chủ bài. Xoá mềm và chuyển CANCELLED. TỪ CHỐI khi bài đang có lượt trao sống (`RESERVED`) — gỡ ngang để lại bên kia một giao dịch trỏ vào bài không còn tồn tại. Những yêu cầu còn ở `REQUESTED` được đóng lại và người xin nhận thông báo; không đóng thì mỗi yêu cầu treo vẫn ăn một suất trong trần "yêu cầu đang mở" của họ.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(Object) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['postId: postId must be a UUID']],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    [PostHasLiveTransactionException],
  )
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
    summary: 'Cập nhật nội dung bài',
    description:
      'Chỉ chủ bài: sửa nội dung, danh mục, số lượng, vị trí, giao nhận, SOS theo quyền và trường riêng theo loại. Không sửa type/status/author/hạn đăng. Request đang chờ giữ nguyên. Khóa nội dung và media khi có lượt trao ACCEPTED/DELIVERING, kể cả bài còn PUBLISHED; từ chối trạng thái kết thúc hoặc đã hết hạn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdatePostResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['post.title: title must be longer than or equal to 5 characters'],
    ],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [ForbiddenException],
    [PostHasLiveTransactionException],
    [PostInvalidStateException],
    [CategoryNotFoundException],
    [PostSosNotAllowedException],
  )
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

  @Post(':postId/renew')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gia hạn bài đăng thêm 3 tháng',
    description:
      'Chỉ chủ bài, tối đa một lần cho mỗi bài (CHỐT-07). Bài đã hết hạn cũng gia hạn được và sẽ hiển thị lại. Tin rao vặt KHÔNG gia hạn được vì khi hết hạn nó tự chuyển thành bài Muốn Tặng (CHỐT-05). Lượt gia hạn tính quota như một bài mới, nên hết hạn mức thì bị từ chối.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(RenewPostResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    // Bài của người khác cũng trả NOT_FOUND: phân biệt là cho người lạ dò
    // được id nào có thật.
    [PostNotFoundException, 'a3f1c0de-0000-4000-8000-000000000000'],
    PostNotRenewableException,
    PostRenewalLimitReachedException,
    [PostQuotaExceededException, 3],
  )
  public async renewPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RenewPostParamsDto,
  ): Promise<ResponseDto<IRenewPostResponseDto>> {
    const result = await this.renewPostUseCase.handle({
      ...params,
      userId: principal.userId,
    });

    return ResponseDto.create<IRenewPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/charity-transfer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xin chuyển vật phẩm về điểm từ thiện',
    description:
      'Chỉ chủ bài. Gửi được khi bài đang hiển thị hoặc đã hết hạn và vẫn còn vật phẩm. Mỗi bài chỉ có một yêu cầu đang chờ duyệt — ràng buộc đặt ở database. Admin duyệt qua PATCH cùng đường dẫn (F23).',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCharityTransferResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'a3f1c0de-0000-4000-8000-000000000000'],
    PostCharityTransferInvalidStateException,
  )
  public async requestCharityTransfer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RequestCharityTransferParamsDto,
    @Body() body: RequestCharityTransferBodyDto,
  ): Promise<ResponseDto<IRequestCharityTransferResponseDto>> {
    const result = await this.requestCharityTransferUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IRequestCharityTransferResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':postId/charity-transfer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối yêu cầu chuyển về điểm từ thiện',
    description:
      'Cần quyền `post.moderate` trong Admin CMS. Duyệt thì bài sang ARCHIVED (Kho Từ Thiện Chung); từ chối thì bài GIỮ NGUYÊN trạng thái cũ và chủ bài vẫn dùng bình thường (F23).',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ReviewCharityTransferResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [PostNotFoundException, 'a3f1c0de-0000-4000-8000-000000000000'],
    PostCharityTransferInvalidStateException,
  )
  public async reviewCharityTransfer(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReviewCharityTransferParamsDto,
    @Body() body: ReviewCharityTransferBodyDto,
  ): Promise<ResponseDto<IReviewCharityTransferResponseDto>> {
    const result = await this.reviewCharityTransferUseCase.handle({
      ...params,
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<IReviewCharityTransferResponseDto>()
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
    @CurrentUser() principal?: IAuthPrincipal,
  ): Promise<ResponseDto<IGetNearbyPostsResponseDto>> {
    const result = await this.getNearbyPostsUseCase.handle({
      ...query,
      currentUserId: principal?.userId,
    });

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
      'Khác discovery công khai ở hai điểm: trả cả bài REJECTED và EXPIRED, ' +
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
    @CurrentUser() principal?: IAuthPrincipal,
  ): Promise<ResponseDto<IGetPostResponseDto>> {
    const result = await this.getPostUseCase.handle({
      postId: params.postId,
      currentUserId: principal?.userId,
    });

    return ResponseDto.create<IGetPostResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
