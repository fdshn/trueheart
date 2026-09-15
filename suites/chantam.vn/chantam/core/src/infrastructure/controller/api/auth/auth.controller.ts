import {
  ILoginUserUseCase,
  ILogoutUserUseCase,
  IRefreshSessionUseCase,
  IRegisterUserUseCase,
} from '@/application/contracts/auth';
import {
  ILoginResponseDto,
  ILogoutResponseDto,
  IRefreshSessionResponseDto,
  IRegisterResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal, Public } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  LoginBodyDto,
  LoginResponseDto,
  LogoutBodyDto,
  LogoutResponseDto,
  OwnUserDto,
  RefreshSessionBodyDto,
  RefreshSessionResponseDto,
  RegisterBodyDto,
  RegisterResponseDto,
} from '../../dto/auth';

@ApiTags('Xác thực')
@Controller('api/auth')
export class AuthController {
  public constructor(
    @Inject(IRegisterUserUseCase)
    private readonly registerUserUseCase: IRegisterUserUseCase,
    @Inject(ILoginUserUseCase)
    private readonly loginUserUseCase: ILoginUserUseCase,
    @Inject(IRefreshSessionUseCase)
    private readonly refreshSessionUseCase: IRefreshSessionUseCase,
    @Inject(ILogoutUserUseCase)
    private readonly logoutUserUseCase: ILogoutUserUseCase,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký tài khoản',
    description:
      'Chỉ cần username và mật khẩu. Đăng ký xong tự đăng nhập, trả luôn cặp token.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RegisterResponseDto) })
  public async registerUser(
    @Body() body: RegisterBodyDto,
  ): Promise<ResponseDto<IRegisterResponseDto>> {
    const result = await this.registerUserUseCase.handle({ ...body });

    return ResponseDto.create<IRegisterResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập',
    description: 'Định danh là username, email hoặc số điện thoại đã bổ sung.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LoginResponseDto) })
  public async loginUser(
    @Body() body: LoginBodyDto,
  ): Promise<ResponseDto<ILoginResponseDto>> {
    const result = await this.loginUserUseCase.handle({ ...body });

    return ResponseDto.create<ILoginResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Làm mới phiên',
    description:
      'Refresh token cũ bị thu hồi ngay, trả về cặp hoàn toàn mới. Endpoint công khai vì access token lúc này đã hết hạn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RefreshSessionResponseDto) })
  public async refreshSession(
    @Body() body: RefreshSessionBodyDto,
  ): Promise<ResponseDto<IRefreshSessionResponseDto>> {
    const result = await this.refreshSessionUseCase.handle({ ...body });

    return ResponseDto.create<IRefreshSessionResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đăng xuất',
    description: 'Thu hồi phiên và xoá FCM token của thiết bị đó.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(LogoutResponseDto) })
  public async logoutUser(
    @Body() body: LogoutBodyDto,
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<ILogoutResponseDto>> {
    // `userId` lấy từ access token chứ KHÔNG từ body: nếu tin body thì ai cũng
    // đăng xuất hộ người khác được.
    const result = await this.logoutUserUseCase.handle({
      ...body,
      userId: principal.userId,
    });

    return ResponseDto.create<ILogoutResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh tính của phiên hiện tại',
    description:
      'Đọc thẳng từ access token, không truy vấn database — dùng để client kiểm tra token còn sống.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(OwnUserDto) })
  public getCurrentUser(
    @CurrentUser() principal: IAuthPrincipal,
  ): ResponseDto<IAuthPrincipal> {
    return ResponseDto.create<IAuthPrincipal>()
      .succeed()
      .attach(principal)
      .build();
  }
}
