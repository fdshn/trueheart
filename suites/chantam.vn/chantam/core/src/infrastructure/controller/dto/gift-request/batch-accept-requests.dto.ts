import {
  IBatchAcceptRequestsBodyDto,
  IBatchAcceptRequestsResponseDto,
  IBatchAcceptedRequestDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { MaxBatchAcceptRequests } from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BatchAcceptRequestsParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;
}

export class BatchAcceptRequestsBodyDto implements IBatchAcceptRequestsBodyDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MaxBatchAcceptRequests,
    description:
      'Các yêu cầu cần duyệt, KHÔNG được trùng nhau. Cả lô ăn cùng một quyết ' +
      'định: thiếu suất cho đủ số này thì không ai được duyệt, để chủ bài chọn lại.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MaxBatchAcceptRequests)
  @IsUUID('4', { each: true })
  requestIds: string[];
}

export class BatchAcceptedRequestDto implements IBatchAcceptedRequestDto {
  @ApiProperty({ format: 'uuid' }) requestId: string;
  @ApiProperty({ format: 'uuid' }) requesterId: string;
  @ApiProperty({ format: 'uuid' }) transactionId: string;
}

export class BatchAcceptRequestsResponseDto implements IBatchAcceptRequestsResponseDto {
  @ApiProperty({ format: 'uuid' }) postId: string;

  @ApiProperty({ type: () => [BatchAcceptedRequestDto] })
  accepted: BatchAcceptedRequestDto[];

  @ApiProperty({
    example: 3,
    description: '`0` nghĩa là bài đã chuyển `RESERVED`.',
  })
  remainingQuantity: number;

  @ApiProperty({
    example: 0,
    description:
      'Số yêu cầu còn lại bị đẩy sang `STANDBY` vì bài hết suất (F33). Luôn ' +
      '`0` khi còn suất.',
  })
  standbyCount: number;
}
