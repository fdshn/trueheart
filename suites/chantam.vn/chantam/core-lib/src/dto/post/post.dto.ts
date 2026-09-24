import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  CharityTransferStatuses,
  DeliveryMethods,
  GenericMvpPostType,
  GiftPostConditions,
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
  PostTypes,
  PublicDiscoveryPostType,
  ReactionKinds,
  ShipPayers,
} from '../../consts';
import { IPostEntity, IPostMediaEntity } from '../../entities';

/**
 * Trường tương tác nhúng vào các endpoint đọc bài.
 *
 * Số đếm lấy từ cột trên chính dòng bài — không COUNT(*) mỗi lần cuộn.
 * `myReaction` lấy bằng MỘT truy vấn cho cả trang; hỏi từng bài là N+1.
 *
 * `likeCount` đếm RIÊNG cảm xúc `LIKE`, còn `reactionCount` đếm mọi người đã
 * bày tỏ bất kể loại. Hai con số khác nhau và đều đúng: nút thích cần con số
 * thứ nhất, dải cảm xúc cần con số thứ hai. Cả hai nuôi từ `content_reactions`.
 */
export interface IPostFeedInteractionDto {
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** Cảm xúc của người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập. */
  myReaction: ReactionKinds | null;
  /** Số lượt thích, tức số cảm xúc `LIKE`. */
  likeCount: number;
  /** Người gọi đã thích chưa. `null` khi chưa đăng nhập. */
  isLiked: boolean | null;
}

export interface ICreatePostCommonDto {
  postType: GenericMvpPostType;
  title: string;
  description: string;
  categoryId: string;
  location: IGeoPoint;
  areaLabel: string;
  /**
   * Đánh dấu bài Cần gấp / SOS (F17).
   *
   * Mở theo capability `POST_SOS` của Rank, Admin bật/tắt lúc chạy. Không gửi
   * thì mặc định `false` — im lặng mà hiểu thành "cần gấp" là cho mọi bài
   * chen lên đầu.
   */
  isSos?: boolean;
  /** Hình thức nhận hàng (F78). */
  deliveryMethod?: DeliveryMethods;
  /**
   * Bên chịu phí ship (CH-2). Chỉ khai được khi `deliveryMethod` là
   * `GIVER_SHIPS` — tự đến lấy thì không có phí để mà trả.
   */
  shipPayer?: ShipPayers;
}

export interface ICreateOfferPostDto extends ICreatePostCommonDto {
  postType: PostTypes.OFFER;
  condition: GiftPostConditions;
  estimatedValue: number;
  totalQuantity?: number;
  /**
   * Chế độ tìm người nhận (mặc định OPTIMAL).
   * - INSTANT  — chọn ngay người đầu tiên.
   * - OPTIMAL  — chờ tối đa 7 ngày.
   * - EXTENDED — chờ tối đa 30 ngày.
   */
  selectionMode?: PostSelectionModes;
}

export interface ICreateGenericMvpPostDto extends ICreatePostCommonDto {
  postType:
    | PostTypes.WANTED
    | PostTypes.CHARITY
    | PostTypes.CLASSIFIED
    | PostTypes.MERIT;
}

export interface ICreatePostDto extends ICreatePostCommonDto {
  condition?: GiftPostConditions;
  estimatedValue?: number;
  totalQuantity?: number;
  /** Giá bán, chỉ dùng cho bài CLASSIFIED. Đơn vị VND, số nguyên. */
  price?: number;
  /** Có thương lượng giá hay không. Chỉ dùng cho bài CLASSIFIED. */
  negotiable?: boolean;
  /** Chế độ tìm người nhận — chỉ áp dụng cho bài OFFER, mặc định OPTIMAL. */
  selectionMode?: PostSelectionModes;
}

export interface ICreatePostBodyDto {
  post: ICreatePostDto;
}

export interface ICreatePostResponseDto {
  post: IPostEntity;
}

export interface IGetNearbyPostsQueryDto extends IPaginationQueryDto {
  /**
   * Toạ độ quét. Bỏ trống thì server lùi về Vị trí mặc định của người đang
   * đăng nhập (F26). Khách chưa đăng nhập bỏ trống thì không quét được.
   */
  lat?: number;
  lng?: number;
  radiusMeters: number;
  postType: PublicDiscoveryPostType;
  categoryId?: string;
}

export interface IGetMyPostsQueryDto extends IPaginationQueryDto {
  postType?: PostTypes;
  status?: GiftPostStatuses;
  categoryId?: string;
}

export interface IMyPostItemDto extends IPostFeedInteractionDto {
  post: IPostEntity;
  requestCount: number;
  media: IPublicPostMediaDto[];
}

export interface IGetMyPostsResponseDto {
  posts: IMyPostItemDto[];
  meta: IPaginationMetaDto;
}

export interface INearbyPostDto extends IPostFeedInteractionDto {
  post: IPostEntity;
  distanceMeters: number;
  isLocationApproximate: true;
  requestCount?: number;
  myRequestStatus?: GiftRequestStatuses | null;
  hasRequested?: boolean;
}

export interface IGetNearbyPostsResponseDto {
  posts: INearbyPostDto[];
  meta: IPaginationMetaDto;
  /**
   * Gốc toạ độ đã dùng để quét (F26).
   *
   * `REQUEST` là toạ độ client gửi lên, `DEFAULT_LOCATION` là Vị trí mặc định
   * trong hồ sơ. Giao diện cần phân biệt để nói cho người dùng biết kết quả
   * đang tính từ đâu — im lặng lùi về vị trí khác là đổi kết quả sau lưng họ.
   */
  originSource: 'REQUEST' | 'DEFAULT_LOCATION';
}

/** Vì sao một bài được gợi ý. Giao diện dịch các mã này ra tiếng Việt. */
export type SmartMatchReason = 'SAME_CATEGORY' | 'KEYWORD_MATCH' | 'NEARBY';

export interface ISmartMatchDto {
  post: IPostEntity;
  distanceMeters: number;
  isLocationApproximate: true;
  /** Độ khớp trong [0, 1], đọc được như phần trăm. */
  score: number;
  reasons: SmartMatchReason[];
}

export interface IGetSmartMatchesResponseDto {
  /** Bài được đem đi ghép. */
  sourcePostId: string;
  radiusMeters: number;
  matches: ISmartMatchDto[];
}

export interface IGetPostParamsDto {
  postId: string;
}

export interface IPublicPostMediaDto {
  id: number;
  url: string;
  sortOrder: number;
}

/**
 * Thông tin tác giả hiển thị công khai.
 *
 * **Privacy**: Không được trả `fullName`, `phone`, `address` ở đây.
 * Thông tin liên lạc chỉ tiết lộ qua `IPostContactInfoDto` và duy nhất
 * cho receiver đã được chọn (transaction DELIVERING/COMPLETED).
 */
export interface IPostAuthorDto {
  id: string;
  username: string;
  avatarUrl?: string | null;
  rank?: string;
  /** Thời điểm tạo tài khoản — hiển thị "Tham gia tháng X năm Y". */
  joinedAt?: Date | string | null;
}

/**
 * Thông tin liên lạc — CHỈ trả khi caller là receiver đã được chọn.
 *
 * Transaction phải ở trạng thái DELIVERING hoặc COMPLETED và
 * `receiver_id = callerId`. Mọi trường hợp khác trả `null`.
 */
export interface IPostContactInfoDto {
  phone?: string | null;
  address?: string | null;
}

export interface IGetPostResponseDto extends IPostFeedInteractionDto {
  post: IPostEntity;
  author?: IPostAuthorDto | null;
  media: IPublicPostMediaDto[];
  isLocationApproximate: boolean;
  requestCount?: number;
  myRequestStatus?: GiftRequestStatuses | null;
  hasRequested?: boolean;
  /**
   * Thông tin liên lạc của người cho.
   * Chỉ có khi caller là receiver đã được chọn ở giao dịch DELIVERING/COMPLETED.
   */
  contactInfo?: IPostContactInfoDto | null;
  /**
   * Phân bổ theo loại cảm xúc. Chỉ có trên màn chi tiết — bảng tin chỉ cần
   * tổng số, hỏi breakdown cho 20 bài mỗi lần cuộn là tự làm nặng.
   */
  reactionBreakdown: Partial<Record<ReactionKinds, number>>;
}

export interface IGetPostMapQueryDto {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  originLat?: number;
  originLng?: number;
  postType?: PostTypes;
  categoryId?: string;
}

/**
 * Marker trên bản đồ, mang đủ dữ liệu để dựng **thẻ xem nhanh** (F29) mà không
 * cần gọi thêm một vòng cho mỗi marker người dùng chạm vào.
 *
 * Cố ý KHÔNG mang `description`: thẻ xem nhanh chỉ cần đủ để quyết định có mở
 * chi tiết hay không, và nhồi cả mô tả vào 200 marker là tự làm nặng bản đồ.
 * Xem đầy đủ thì điều hướng sang màn Detail của module nguồn — dùng
 * `deepLinkPath`.
 */
export interface IPostMapMarkerDto {
  postId: string;
  postType: PostTypes;
  categoryId: string;
  areaLabel: string;
  location: IGeoPoint;
  distanceMeters?: number;
  isLocationApproximate: true;
  /** Tiêu đề bài, để thẻ xem nhanh có gì đọc. */
  title: string;
  /** Ảnh đầu tiên của bài, `null` khi bài không có ảnh. */
  thumbnailUrl: string | null;
  /** Bài Cần gấp — thẻ xem nhanh cần làm nổi bật (F17). */
  isSos: boolean;
  /**
   * Đường dẫn tương đối tới màn chi tiết của module nguồn.
   *
   * Server chỉ trả đường dẫn, KHÔNG ghép tên miền: tên miền là việc của client
   * và của cấu hình triển khai, đoán hộ là sinh ra link chết.
   */
  deepLinkPath: string;
}

export interface IGetPostMapResponseDto {
  markers: IPostMapMarkerDto[];
}

export interface IUpdatePostDto {
  title?: string;
  description?: string;
  areaLabel?: string;
  condition?: GiftPostConditions;
  estimatedValue?: number;
  location?: IGeoPoint;
}

export interface IUpdatePostParamsDto {
  postId: string;
}

export interface IUpdatePostBodyDto {
  post: IUpdatePostDto;
}

export interface IUpdatePostResponseDto {
  post: IPostEntity;
}

export interface IAttachPostMediaDto {
  key: string;
}

export interface IAttachPostMediaBodyDto {
  media: IAttachPostMediaDto;
}

export interface IAttachPostMediaResponseDto {
  media: IPostMediaEntity;
}

export interface IReorderPostMediaDto {
  mediaIds: number[];
}

export interface IReorderPostMediaBodyDto {
  media: IReorderPostMediaDto;
}

export interface IReorderPostMediaResponseDto {
  media: IPostMediaEntity[];
}

export interface IModeratePostParamsDto {
  postId: string;
}

export interface IModeratePostDto {
  status: GiftPostStatuses.PUBLISHED | GiftPostStatuses.REJECTED;
}

export interface IModeratePostBodyDto {
  post: IModeratePostDto;
}

export interface IModeratePostResponseDto {
  post: IPostEntity;
}

export interface IRenewPostParamsDto {
  postId: string;
}

export interface IRenewPostResponseDto {
  post: IPostEntity;
}

export interface IRequestCharityTransferParamsDto {
  postId: string;
}

export interface IRequestCharityTransferDto {
  /** Lời nhắn cho Admin, tối đa 500 ký tự. */
  note?: string;
}

export interface IRequestCharityTransferBodyDto {
  transfer: IRequestCharityTransferDto;
}

export interface IRequestCharityTransferResponseDto {
  post: IPostEntity;
}

export interface IReviewCharityTransferParamsDto {
  postId: string;
}

export interface IReviewCharityTransferDto {
  status: CharityTransferStatuses.APPROVED | CharityTransferStatuses.REJECTED;
}

export interface IReviewCharityTransferBodyDto {
  transfer: IReviewCharityTransferDto;
}

export interface IReviewCharityTransferResponseDto {
  post: IPostEntity;
}

export interface ITogglePostLikeResponseDto {
  liked: boolean;
  likeCount: number;
}
