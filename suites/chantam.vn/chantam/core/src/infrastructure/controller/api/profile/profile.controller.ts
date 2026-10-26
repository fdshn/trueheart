import { IListOwnBadgesUseCase } from '@/application/contracts/leaderboard';
import { IListUserPostsUseCase } from '@/application/contracts/post';
import {
  IConfirmEmailVerificationResult,
  IConfirmEmailVerificationUseCase,
  IConfirmPhoneVerificationResult,
  IConfirmPhoneVerificationUseCase,
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IRequestAvatarUploadUseCase,
  IRequestEmailVerificationResult,
  IRequestEmailVerificationUseCase,
  IRequestIntroVideoUploadUseCase,
  IRequestPhoneVerificationResult,
  IRequestPhoneVerificationUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import {
  EmailAlreadyUsedException,
  EmailRequiredException,
  InvalidEmailFormatException,
  OtpInvalidException,
  PhoneTakenException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IGetOwnProfileResponseDto,
  IGetPublicProfileResponseDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IStorageUploadResult } from '@chantam/service.storage-lib';
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
import { ListOwnBadgesResponseDto } from '../../dto/leaderboard';
import {
  ConfirmEmailVerificationBodyDto,
  ConfirmEmailVerificationResponseDto,
  ConfirmPhoneVerificationBodyDto,
  ConfirmPhoneVerificationResponseDto,
  GetOwnProfileResponseDto,
  GetPublicProfileParamsDto,
  GetPublicProfileResponseDto,
  ListUserPostsQueryDto,
  ListUserPostsResponseDto,
  RequestAvatarUploadDto,
  RequestAvatarUploadResponseDto,
  RequestEmailVerificationResponseDto,
  RequestIntroVideoUploadBodyDto,
  RequestPhoneVerificationResponseDto,
  UpdateOwnProfileBodyDto,
  UpdateOwnProfileResponseDto,
} from '../../dto/profile';

@ApiTags('Hồ sơ')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  public constructor(
    @Inject(IRequestAvatarUploadUseCase)
    private readonly requestAvatarUploadUseCase: IRequestAvatarUploadUseCase,
    @Inject(IRequestPhoneVerificationUseCase)
    private readonly requestPhoneVerificationUseCase: IRequestPhoneVerificationUseCase,
    @Inject(IConfirmPhoneVerificationUseCase)
    private readonly confirmPhoneVerificationUseCase: IConfirmPhoneVerificationUseCase,
    @Inject(IRequestEmailVerificationUseCase)
    private readonly requestEmailVerificationUseCase: IRequestEmailVerificationUseCase,
    @Inject(IConfirmEmailVerificationUseCase)
    private readonly confirmEmailVerificationUseCase: IConfirmEmailVerificationUseCase,
    @Inject(IGetOwnProfileUseCase)
    private readonly getOwnProfileUseCase: IGetOwnProfileUseCase,
    @Inject(IGetPublicProfileUseCase)
    private readonly getPublicProfileUseCase: IGetPublicProfileUseCase,
    @Inject(IUpdateOwnProfileUseCase)
    private readonly updateOwnProfileUseCase: IUpdateOwnProfileUseCase,
    @Inject(IListOwnBadgesUseCase)
    private readonly listOwnBadgesUseCase: IListOwnBadgesUseCase,
    @Inject(IRequestIntroVideoUploadUseCase)
    private readonly requestIntroVideoUploadUseCase: IRequestIntroVideoUploadUseCase,
    @Inject(IListUserPostsUseCase)
    private readonly listUserPostsUseCase: IListUserPostsUseCase,
  ) {}

  @Get('me/badges')
  @ApiOperation({
    summary: 'Toàn bộ huy hiệu bảng thành tích của tôi',
    description:
      'Gồm cả huy hiệu đã hết hạn (`EXPIRED`) và đã bị Admin gỡ (`REVOKED`) — lịch sử của chính mình. `GET /profile/me` chỉ trả huy hiệu còn hạn.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(ListOwnBadgesResponseDto) })
  public async listOwnBadges(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listOwnBadgesUseCase.handle({ userId: principal.userId }),
      )
      .build();
  }

  @Get('me')
  @ApiOperation({
    summary: 'Hồ sơ đầy đủ của chính chủ',
    description:
      'Gồm cả dữ liệu riêng tư mà hồ sơ công khai không trả: email, SĐT, trạng thái xác minh và vị trí mặc định. Vị trí ở đây là toạ độ THẬT, không làm nhiễu, vì đây là dữ liệu của chính người gọi.',
  })
  @ApiErrorResponses(...ApiTokenErrors, UserNotFoundException)
  @ApiOkResponse({ type: ResponseDto.forApi(GetOwnProfileResponseDto) })
  public async getOwnProfile(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IGetOwnProfileResponseDto>> {
    const result = await this.getOwnProfileUseCase.handle({
      userId: principal.userId,
    });
    return ResponseDto.create<IGetOwnProfileResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch('me/avatar-upload')
  @ApiOperation({
    summary: 'Xin presigned URL upload avatar trực tiếp lên storage',
    description:
      'Ảnh đi thẳng từ máy người dùng lên storage, không qua server. Key được bind theo user nên không ghi đè được ảnh của người khác. URL có hạn ngắn; hết hạn thì xin lại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RequestAvatarUploadResponseDto) })
  public async requestAvatarUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestAvatarUploadDto,
  ): Promise<ResponseDto<IStorageUploadResult>> {
    const result = await this.requestAvatarUploadUseCase.handle({
      userId: principal.userId,
      ...body,
    });
    return ResponseDto.create<IStorageUploadResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post('me/intro-video/upload-url')
  @ApiOperation({
    summary: 'Xin presigned URL tải clip giới thiệu hoặc ảnh bìa của nó',
    description:
      '`kind=VIDEO`: video/mp4 hoặc video/quicktime, tối đa 50 MB. `kind=THUMBNAIL`: ảnh bìa do app tạo (JPEG/PNG/WebP, tối đa 2 MB) — server không transcode nên không tự tạo ảnh bìa và không kiểm thời lượng; app tự giới hạn 60 giây. ' +
      'PUT xong thì gửi `key` trong `PATCH /profile/me` (`introVideoKey`, `introVideoThumbnailKey`). Server không nhận URL tuỳ ý.',
  })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['upload: Clip giới thiệu chỉ nhận video/mp4 hoặc video/quicktime.'],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestAvatarUploadResponseDto),
  })
  public async requestIntroVideoUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestIntroVideoUploadBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.requestIntroVideoUploadUseCase.handle({
          userId: principal.userId,
          ...body.upload,
        }),
      )
      .build();
  }

  @Patch('me/phone-verification/request')
  @ApiOperation({
    summary: 'Gửi OTP xác minh SĐT hiện tại',
    description:
      'Gửi tới SĐT đã lưu trong hồ sơ, không nhận số từ body. Chưa cấu hình nhà cung cấp SMS thì trả 501 chứ KHÔNG âm thầm coi như đã gửi.',
  })
  @ApiErrorResponses(...ApiTokenErrors, UserNotFoundException)
  @ApiOkResponse({
    type: ResponseDto.forApi(RequestPhoneVerificationResponseDto),
  })
  public async requestPhoneVerification(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IRequestPhoneVerificationResult>> {
    const result = await this.requestPhoneVerificationUseCase.handle({
      userId: principal.userId,
    });
    return ResponseDto.create<IRequestPhoneVerificationResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch('me/phone-verification/confirm')
  @ApiOperation({
    summary: 'Xác nhận OTP, đánh dấu SĐT đã xác minh',
    description:
      'Xác minh lần đầu thưởng điểm đúng MỘT lần qua Point Ledger với khoá idempotency. Đổi số rồi xác minh lại không thưởng lại — khoá nằm ở ledger chứ không ở cột `phone_verified_at` vốn reset được.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['otp: otp phải là 6 chữ số']],
    OtpInvalidException,
    UserNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(ConfirmPhoneVerificationResponseDto),
  })
  public async confirmPhoneVerification(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ConfirmPhoneVerificationBodyDto,
  ): Promise<ResponseDto<IConfirmPhoneVerificationResult>> {
    const result = await this.confirmPhoneVerificationUseCase.handle({
      userId: principal.userId,
      ...body,
    });
    return ResponseDto.create<IConfirmPhoneVerificationResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch('me/email-verification/request')
  @ApiOperation({
    summary: 'Gửi OTP xác minh email hiện tại',
    description:
      'Gửi tới địa chỉ đã lưu trong hồ sơ, không nhận địa chỉ từ body. Cần xác minh thì email mới dùng được làm kênh khôi phục mật khẩu — email chưa xác minh khiến luồng quên mật khẩu rơi về ADMIN_SUPPORT. Chưa cấu hình kênh email thì trả 501 chứ KHÔNG âm thầm coi như đã gửi.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    UserNotFoundException,
    EmailRequiredException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(RequestEmailVerificationResponseDto),
  })
  public async requestEmailVerification(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<IRequestEmailVerificationResult>> {
    const result = await this.requestEmailVerificationUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<IRequestEmailVerificationResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch('me/email-verification/confirm')
  @ApiOperation({
    summary: 'Xác nhận OTP, đánh dấu email đã xác minh',
    description:
      'KHÔNG thưởng điểm — khác xác minh SĐT, vì đây không nằm trong danh sách onboarding đã chốt. Đổi email về sau thì dấu xác minh mất, phải làm lại.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['otp: otp phải là 6 chữ số']],
    OtpInvalidException,
    UserNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(ConfirmEmailVerificationResponseDto),
  })
  public async confirmEmailVerification(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ConfirmEmailVerificationBodyDto,
  ): Promise<ResponseDto<IConfirmEmailVerificationResult>> {
    const result = await this.confirmEmailVerificationUseCase.handle({
      userId: principal.userId,
      ...body,
    });

    return ResponseDto.create<IConfirmEmailVerificationResult>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ và vị trí mặc định',
    description:
      'Email và SĐT phải chưa có người khác dùng. Vị trí mặc định KHÁC GPS hiện tại: nó là giá trị dùng khi đăng bài và là điều kiện bắt buộc để tạo Group, nên server không bao giờ tự ghi đè nó từ GPS.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['profile.email: email không hợp lệ']],
    EmailAlreadyUsedException,
    InvalidEmailFormatException,
    PhoneTakenException,
    UserNotFoundException,
  )
  @ApiOkResponse({ type: ResponseDto.forApi(UpdateOwnProfileResponseDto) })
  public async updateOwnProfile(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: UpdateOwnProfileBodyDto,
  ): Promise<ResponseDto<IUpdateOwnProfileResponseDto>> {
    const result = await this.updateOwnProfileUseCase.handle({
      ...body,
      userId: principal.userId,
    });
    return ResponseDto.create<IUpdateOwnProfileResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  // Static /me phải đứng TRƯỚC :username; Fastify/Nest match theo thứ tự.
  @Public()
  @Get(':username')
  @ApiOperation({
    summary: 'Hồ sơ công khai tối thiểu',
    description:
      'Chạy theo danh sách CHO PHÉP tường minh: username, họ tên, avatar, hạng, số bài đã đăng, điểm tích luỹ và link chia sẻ. Từ 25/10 thêm slogan, suy nghĩ hôm nay, clip giới thiệu, vị trí bảng Người cho tháng này (`null` khi ẩn danh) và `contacts`. Cố ý không trả điểm khả dụng — đó là sức mua của người ta; không trả vị trí; email và SĐT chỉ có trong `contacts` khi chủ hồ sơ tự đặt `PUBLIC`.',
  })
  @ApiErrorResponses(UserNotFoundException)
  @ApiOkResponse({ type: ResponseDto.forApi(GetPublicProfileResponseDto) })
  public async getPublicProfile(
    @Param() params: GetPublicProfileParamsDto,
  ): Promise<ResponseDto<IGetPublicProfileResponseDto>> {
    const result = await this.getPublicProfileUseCase.handle(params);
    return ResponseDto.create<IGetPublicProfileResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Get(':username/posts')
  @ApiOperation({
    summary: 'Bài đăng trên hồ sơ của một người',
    description:
      'Người khác (kể cả khách) chỉ thấy bài `PUBLISHED`/`RESERVED`; chính chủ thấy mọi bài chưa xoá. Cùng hình dạng bảng tin quanh đây: vị trí đã làm nhiễu, `distanceMeters` luôn `null`, tác giả là author summary và KHÔNG có liên hệ. Mới nhất trước.',
  })
  @ApiErrorResponses(UserNotFoundException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListUserPostsResponseDto) })
  public async listUserPosts(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: GetPublicProfileParamsDto,
    @Query() query: ListUserPostsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUserPostsUseCase.handle({
          username: params.username,
          viewerId: principal?.userId ?? null,
          postType: query.postType,
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }
}
