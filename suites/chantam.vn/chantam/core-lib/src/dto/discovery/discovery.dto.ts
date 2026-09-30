import { PublicDiscoveryPostType } from '../../consts';

export interface IDiscoveryConfigResponseDto {
  minRadiusMeters: number;
  /**
   * Bán kính dùng khi client gửi toạ độ mà bỏ trống bán kính.
   *
   * Có trường này vì trước 30/09 "bỏ trống" nghĩa là KHÔNG lọc bán kính — một
   * client gửi toạ độ suông quét cả nước.
   */
  defaultRadiusMeters: number;
  maxRadiusMeters: number;
  defaultPageSize: number;
  maxPageSize: number;
  supportedPostTypes: PublicDiscoveryPostType[];
}
