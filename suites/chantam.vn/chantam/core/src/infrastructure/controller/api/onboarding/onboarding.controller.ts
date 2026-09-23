import {
  IEvaluateOnboardingTasksUseCase,
  IGetOnboardingTasksUseCase,
} from '@/application/contracts/onboarding';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  EvaluateOnboardingTasksResponseDto,
  GetOnboardingTasksResponseDto,
} from '../../dto/onboarding';

@ApiTags('Nhiệm vụ Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  public constructor(
    @Inject(IGetOnboardingTasksUseCase)
    private readonly getOnboardingTasksUseCase: IGetOnboardingTasksUseCase,
    @Inject(IEvaluateOnboardingTasksUseCase)
    private readonly evaluateOnboardingTasksUseCase: IEvaluateOnboardingTasksUseCase,
  ) {}

  @Get('tasks')
  @ApiOperation({
    summary: 'Lấy danh sách nhiệm vụ onboarding và tiến độ của chính chủ',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetOnboardingTasksResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getTasks(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<GetOnboardingTasksResponseDto>> {
    const result = await this.getOnboardingTasksUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<GetOnboardingTasksResponseDto>()
      .succeed()
      .attach(result as GetOnboardingTasksResponseDto)
      .build();
  }

  @Post('tasks/evaluate')
  @ApiOperation({
    summary: 'Đánh giá lại toàn bộ tiến độ nhiệm vụ onboarding của chính chủ',
    description:
      'Kiểm tra hồ sơ cá nhân và số điện thoại. Tự động hoàn thành nhiệm vụ nếu đạt và thăng hạng lên Member khi hoàn tất.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(EvaluateOnboardingTasksResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async evaluateTasks(
    @CurrentUser() principal: IAuthPrincipal,
  ): Promise<ResponseDto<EvaluateOnboardingTasksResponseDto>> {
    const result = await this.evaluateOnboardingTasksUseCase.handle({
      userId: principal.userId,
    });

    return ResponseDto.create<EvaluateOnboardingTasksResponseDto>()
      .succeed()
      .attach(result as EvaluateOnboardingTasksResponseDto)
      .build();
  }

  @Post('tasks/:key/trigger')
  @ApiOperation({
    summary: 'Trigger đánh giá một nhiệm vụ onboarding cụ thể',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(EvaluateOnboardingTasksResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async triggerTask(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('key') _key: string,
  ): Promise<ResponseDto<EvaluateOnboardingTasksResponseDto>> {
    return this.evaluateTasks(principal);
  }
}
