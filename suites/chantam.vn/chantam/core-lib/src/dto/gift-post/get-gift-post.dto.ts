import { IGiftPostEntity } from '../../entities';

export interface IGetGiftPostParamsDto {
  giftPostId: string;
}

export interface IGetGiftPostResponseDto {
  giftPost: IGiftPostEntity;
  /**
   * `true` khi toạ độ trả về đã bị làm nhiễu.
   *
   * Trường này luôn có mặt và luôn tường minh — không bao giờ để client phải
   * đoán xem toạ độ nhận được là thật hay gần đúng (đặc tả mục 1.3).
   */
  isLocationApproximate: boolean;
}
