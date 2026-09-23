import { ICreateReportUseCase } from '@/application/contracts/report';
import {
  PostNotFoundException,
  ReportDuplicatedException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateReportBodyDto,
  CreateReportResponseDto,
} from '../../dto/report/report.dto';

@ApiTags('Báo cáo vi phạm')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  public constructor(
    @Inject(ICreateReportUseCase)
    private readonly createReportUseCase: ICreateReportUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Báo cáo bài đăng hoặc người dùng',
    description:
      'Report là tín hiệu ưu tiên kiểm duyệt, không tự động áp dụng chế tài.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreateReportResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      [
        'report.description: description must be longer than or equal to 10 characters',
      ],
    ],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
    [UserNotFoundException],
    [ReportDuplicatedException],
  )
  public async createReport(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateReportBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createReportUseCase.handle({
          ...body,
          reporterUserId: principal.userId,
        }),
      )
      .build();
  }
}
