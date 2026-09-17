import {
  IConfirmPhoneVerificationResult,
  IConfirmPhoneVerificationUseCase,
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IRequestPhoneVerificationResult,
  IRequestPhoneVerificationUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import {
  IGetOwnProfileResponseDto,
  IGetPublicProfileResponseDto,
  IUpdateOwnProfileResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal, Public } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
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
  RequestPhoneVerificationResponseDto,
  UpdateOwnProfileBodyDto,
  UpdateOwnProfileResponseDto,
} from '../../dto/profile';

@ApiTags('Hồ sơ')
@ApiBearerAuth()
@Controller('api/profile')
export class ProfileController {
  public constructor(
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
  @ApiOperation({ summary: 'Hồ sơ đầy đủ của chính chủ' })
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

  @Patch('me/phone-verification/request')
  @ApiOperation({ summary: 'Gửi OTP xác minh SĐT hiện tại' })
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
  @ApiOperation({ summary: 'Xác nhận OTP, đánh dấu SĐT đã xác minh' })
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
  @ApiOperation({ summary: 'Cập nhật hồ sơ và vị trí mặc định' })
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
  @ApiOperation({ summary: 'Hồ sơ công khai tối thiểu' })
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
