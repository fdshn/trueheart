import {
  IConfirmPhoneVerificationResult,
  IConfirmPhoneVerificationUseCase,
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IRequestAvatarUploadUseCase,
  IRequestPhoneVerificationResult,
  IRequestPhoneVerificationUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import {
  EmailTakenException,
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
import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConfirmPhoneVerificationBodyDto,
  ConfirmPhoneVerificationResponseDto,
  GetOwnProfileResponseDto,
  GetPublicProfileParamsDto,
  GetPublicProfileResponseDto,
  RequestAvatarUploadDto,
  RequestAvatarUploadResponseDto,
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
    @Inject(IGetOwnProfileUseCase)
    private readonly getOwnProfileUseCase: IGetOwnProfileUseCase,
    @Inject(IGetPublicProfileUseCase)
    private readonly getPublicProfileUseCase: IGetPublicProfileUseCase,
    @Inject(IUpdateOwnProfileUseCase)
    private readonly updateOwnProfileUseCase: IUpdateOwnProfileUseCase,
  ) {}

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

  @Patch('me')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ và vị trí mặc định',
    description:
      'Email và SĐT phải chưa có người khác dùng. Vị trí mặc định KHÁC GPS hiện tại: nó là giá trị dùng khi đăng bài và là điều kiện bắt buộc để tạo Group, nên server không bao giờ tự ghi đè nó từ GPS.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['profile.email: email không hợp lệ']],
    EmailTakenException,
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
      'Chạy theo danh sách CHO PHÉP tường minh: username, họ tên, avatar, hạng, số bài đã đăng, điểm tích luỹ và link chia sẻ. Cố ý không trả điểm khả dụng — đó là sức mua của người ta; cũng không trả email, SĐT hay vị trí.',
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
}
