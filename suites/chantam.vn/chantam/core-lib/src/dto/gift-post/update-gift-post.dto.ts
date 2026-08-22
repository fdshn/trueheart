import { GiftPostConditions, GiftPostStatuses } from '../../consts';
import { IGiftPostEntity } from '../../entities';

export interface IUpdateGiftPostDto {
  title?: string;
  description?: string;
  condition?: GiftPostConditions;
  estimatedValue?: number;
  areaLabel?: string;
  status?: GiftPostStatuses;
}

export interface IUpdateGiftPostParamsDto {
  giftPostId: string;
}

export interface IUpdateGiftPostBodyDto {
  giftPost: IUpdateGiftPostDto;
}

export interface IUpdateGiftPostResponseDto {
  giftPost: IGiftPostEntity;
}
