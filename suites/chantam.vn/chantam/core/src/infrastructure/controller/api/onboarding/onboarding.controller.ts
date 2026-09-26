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
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
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

/**
 * Những `key` nhiệm vụ đang có trong seed.
 *
 * Danh sách cứng ở đây là chủ ý: nhiệm vụ thêm mới phải đi kèm người viết mã
 * cho phép chấm nó, chứ không phải chỉ thêm một hàng vào bảng rồi mong endpoint
 * này tự hiểu.
 */
const KnownTaskKeys = ['PROFILE_COMPLETE', 'PHONE_VERIFIED'];

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
    summary: 'Chấm lại tiến độ sau khi vừa làm xong một nhiệm vụ',
    description:
      'Cùng kết quả với `/tasks/evaluate`: phép chấm đọc thẳng trạng thái hồ sơ và mốc xác minh nên luôn chấm TOÀN BỘ, không chấm lẻ từng nhiệm vụ được. `key` chỉ để client nói rõ vừa làm xong việc gì, và được kiểm để một key sai không lặng lẽ trả về thành công.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(EvaluateOnboardingTasksResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, [
    ValidationFailedException,
    ['key: nhiệm vụ không tồn tại — chỉ nhận PROFILE_COMPLETE, PHONE_VERIFIED'],
  ])
  public async triggerTask(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('key') key: string,
  ): Promise<ResponseDto<EvaluateOnboardingTasksResponseDto>> {
    // Trước đây `key` bị bỏ qua hoàn toàn, nên gõ sai vẫn trả 200 và client
    // tưởng nhiệm vụ mình vừa gửi là có thật.
    if (!KnownTaskKeys.includes(key))
      throw new ValidationFailedException([
        `key: nhiệm vụ không tồn tại — chỉ nhận ${KnownTaskKeys.join(', ')}`,
      ]);

    return this.evaluateTasks(principal);
  }
}
