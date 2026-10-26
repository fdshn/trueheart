import {
  OnboardingActionTargets,
  OnboardingActionTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IEvaluateOnboardingTasksResponseDto,
  IGetOnboardingTasksResponseDto,
  IOnboardingTaskActionDto,
  IOnboardingTaskProgressDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardingTaskActionDto implements IOnboardingTaskActionDto {
  @ApiProperty({
    enum: OnboardingActionTypes,
    description: 'Hiện chỉ dùng `APP_ROUTE`.',
  })
  type: OnboardingActionTypes;

  @ApiProperty({
    enum: OnboardingActionTargets,
    description:
      'Màn app cần mở, luôn thuộc allow-list: `PROFILE_EDIT` (sửa hồ sơ), `PHONE_VERIFICATION` (xác thực số điện thoại).',
  })
  target: OnboardingActionTargets;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { missingFields: 'avatarUrl,phone' },
    description:
      '`PROFILE_EDIT` có `missingFields`: mã trường còn thiếu, ngăn bằng dấu phẩy, cùng mã với `body.missingFields` của `PROFILE_INCOMPLETE`.',
  })
  params: Record<string, string>;
}

export class OnboardingTaskProgressDto implements IOnboardingTaskProgressDto {
  @ApiProperty({ example: '40000000-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'PROFILE_COMPLETE' })
  key: string;

  @ApiProperty({ example: 'PROFILE_COMPLETE' })
  evidenceType: string;

  @ApiProperty({ example: 'Hoàn thiện hồ sơ' })
  title: string;

  @ApiProperty({
    example: 'Cập nhật họ tên, ảnh đại diện, email và số điện thoại.',
  })
  description: string;

  @ApiProperty({ example: true })
  required: boolean;

  @ApiProperty({ example: 1 })
  sortOrder: number;

  @ApiProperty({ example: false })
  completed: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | string | null;

  @ApiProperty({
    type: () => OnboardingTaskActionDto,
    nullable: true,
    description:
      'Hành động app mở khi người dùng chạm vào task (PR #46 §6). `null` khi task đã xong.',
  })
  action: IOnboardingTaskActionDto | null;
}

export class GetOnboardingTasksResponseDto implements IGetOnboardingTasksResponseDto {
  @ApiProperty({ type: [OnboardingTaskProgressDto] })
  tasks: OnboardingTaskProgressDto[];

  @ApiProperty({ example: 1 })
  totalRequired: number;

  @ApiProperty({ example: 0 })
  completedRequired: number;

  @ApiProperty({ example: false })
  isAllCompleted: boolean;

  @ApiProperty({ enum: UserRanks })
  currentRank: UserRanks;
}

export class EvaluateOnboardingTasksResponseDto implements IEvaluateOnboardingTasksResponseDto {
  @ApiProperty({ type: [OnboardingTaskProgressDto] })
  tasks: OnboardingTaskProgressDto[];

  @ApiProperty({ type: [String], example: ['PROFILE_COMPLETE'] })
  newlyCompletedKeys: string[];

  @ApiProperty({ example: true })
  isAllCompleted: boolean;

  @ApiProperty({ example: true })
  promotedToMember: boolean;

  @ApiProperty({ enum: UserRanks })
  currentRank: UserRanks;
}
