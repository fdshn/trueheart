import { ITogglePostLikeResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty } from '@nestjs/swagger';

export class TogglePostLikeResponseDto implements ITogglePostLikeResponseDto {
  @ApiProperty({ example: true, description: 'Trạng thái like sau khi toggle' })
  liked: boolean;

  @ApiProperty({ example: 6, description: 'Số lượt thích sau khi toggle' })
  likeCount: number;
}
