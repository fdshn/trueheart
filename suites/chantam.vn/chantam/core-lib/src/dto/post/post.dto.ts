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
  UserRanks,
} from '../../consts';
import { IPostEntity, IPostMediaEntity } from '../../entities';

/**
 * Trường tương tác nhúng vào các endpoint đọc bài.
 *
 * Số đếm lấy từ cột trên chính dòng bài — không COUNT(*) mỗi lần cuộn.
 * `myReaction` lấy bằng MỘT truy vấn cho cả trang; hỏi từng bài là N+1.
 *
 * `reactionCount` đếm mọi người đã bày tỏ, BẤT KỂ loại — `LIKE` chỉ là một
 * trong năm loại chứ không phải một hệ thống riêng. Nút thích và dải cảm xúc là
 * cùng một nút: chạm là `LIKE`, giữ thì chọn loại khác. Nên chỉ có MỘT con số,
 * và `myReaction` nói người gọi đã bày tỏ gì.
 */
export interface IPostFeedInteractionDto {
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** Cảm xúc của người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập. */
  myReaction: ReactionKinds | null;
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
  /**
   * Bắt buộc KHI có `lat`/`lng`. Bỏ trống cùng với toạ độ thì không lọc theo
   * bán kính nữa — xem `originSource: 'ALL'`.
   */
  radiusMeters?: number;
  /** Bỏ trống thì trả MỌI loại bài. */
  postType?: PublicDiscoveryPostType;
  categoryId?: string;
  /**
   * Từ khoá tìm trong tiêu đề và mô tả.
   *
   * KHÔNG phân biệt dấu, và luôn bị giới hạn trong bán kính đang xem — tìm
   * kiếm toàn quốc trên một sàn cho–nhận là trả về những món người ta không
   * tới lấy được.
   */
  keyword?: string;
  /**
   * Chỉ bài Cần gấp / SOS.
   *
   * Bỏ trống thì KHÔNG lọc — feed trộn cả bài thường và bài SOS, y như
   * `postType`. Chỉ `true` mới lọc; gửi `false` cũng là không lọc, vì "cho tôi
   * xem những bài KHÔNG gấp" không phải một nhu cầu có thật, còn ép nó thành
   * một bộ lọc thì một client gửi `isSos=false` theo mặc định sẽ âm thầm làm
   * biến mất mọi bài SOS khỏi feed chính.
   */
  isSos?: boolean;
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
  /**
   * Khoảng cách đã làm tròn theo bậc, hoặc `null` khi không có gốc toạ độ nào
   * (`originSource: 'ALL'`). Trả `0` ở đó sẽ đọc ra "cách bạn 0 mét".
   */
  distanceMeters: number | null;
  isLocationApproximate: true;
  requestCount?: number;
  myRequestStatus?: GiftRequestStatuses | null;
  hasRequested?: boolean;
  /**
   * Ảnh của bài, sắp sẵn theo `sortOrder`. Luôn là mảng — bài chưa có ảnh trả
   * `[]` chứ không bỏ trống trường, để client dựng carousel không phải kiểm
   * `undefined` trước mỗi lần đọc `length`.
   */
  media: IPublicPostMediaDto[];
  /**
   * Người đăng bài, đúng bộ trường công khai của `IPostAuthorDto` — KHÔNG có
   * `fullName`, `phone`, `address`. `null` chỉ khi hàng user không còn tồn
   * tại; tài khoản đã xoá vẫn giữ username nên vẫn trả về được.
   */
  author: IPostAuthorDto | null;
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
   *
   * `ALL` nghĩa là KHÔNG có gốc nào, nên không lọc bán kính và trả toàn bộ,
   * mới nhất trước. Ở nhánh này `distanceMeters` là `null`.
   */
  originSource: 'REQUEST' | 'DEFAULT_LOCATION' | 'ALL';
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
  /** Cùng hình dạng với `INearbyPostDto.media`; rỗng khi bài chưa có ảnh. */
  media: IPublicPostMediaDto[];
  /** Cùng hình dạng với `INearbyPostDto.author`. */
  author: IPostAuthorDto | null;
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

/**
 * Xem trước một lượt đổi vật phẩm bằng điểm, TRƯỚC khi bấm.
 *
 * Sinh ra vì hai lỗ (29/09):
 *
 * 1. Tỷ lệ quy đổi `vndPerPoint` chỉ được đọc ở đúng một chỗ trong máy chủ, nên
 *    client muốn hiện "cần 500 điểm" thì phải tự hardcode tỷ lệ và tự làm tròn.
 *    Admin đổi tỷ lệ là mọi client hiện sai; làm tròn xuống là hiện thiếu điểm so
 *    với số sẽ bị trừ. Với người ĐỦ điểm, đường duy nhất để biết giá là trả nó.
 * 2. Tiêu điểm làm tụt hạng (chốt 2026-09-24), mà `RANK_DEMOTED` chỉ tới SAU khi
 *    đã trừ. Người Bạc đang có 1.000 điểm đổi món 500 sẽ mất quota bài và quyền
 *    SOS, và chỉ biết khi mọi thứ đã xong.
 */
export interface IRedemptionQuoteDto {
  /** Giá bằng điểm, đã làm tròn LÊN. `0` khi chưa quy ra điểm được. */
  points: number;
  /** Giá trị tham khảo người tặng khai. `null` khi bỏ trống. */
  estimatedValueVnd: number | null;
  /** Tỷ lệ đang áp — trả kèm để client giải thích được con số, không phải đoán. */
  vndPerPoint: number;
  /** `false` khi bài chưa quy ra điểm được. */
  redeemable: boolean;
  /**
   * Vì sao chưa đổi được, `null` khi đổi được.
   *
   * `NOT_AVAILABLE` gộp "đồng hồ không chạy" với "bạn chưa gửi yêu cầu xin" —
   * cùng một lỗi như khi bấm đổi thật, vì phân biệt hai cái là để lộ bài nào tồn
   * tại cho người chưa từng thấy nó.
   */
  unavailableReason:
    'NOT_AVAILABLE' | 'NO_ESTIMATED_VALUE' | 'INSUFFICIENT_POINTS' | null;
  /** Điểm đang có của người gọi. */
  balancePoints: number;
  /** Còn thiếu bao nhiêu điểm; `0` khi đã đủ. */
  missingPoints: number;
  /**
   * `true` khi trả số điểm này sẽ làm người gọi TỤT HẠNG.
   *
   * Luôn `false` khi `rank.points_source` là LIFETIME — lúc đó tiêu điểm không
   * đụng tới con số quyết hạng.
   */
  wouldDemote: boolean;
  /** Hạng sau khi đổi. Bằng hạng hiện tại khi không tụt. */
  rankAfter: UserRanks;
}

export interface IRedemptionQuoteResponseDto {
  quote: IRedemptionQuoteDto;
}

export interface IGetPostResponseDto extends IPostFeedInteractionDto {
  /** Owner-only edit capability. Saving must still recheck under a row lock. */
  canEdit?: boolean;
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

/**
 * Một ô lưới trên bản đồ.
 *
 * Bản đồ trả CỤM chứ không trả từng bài: một thành phố có hàng nghìn bài, và
 * trước 26/09 truy vấn cắt cứng ở 200 marker mà không báo gì — người dùng zoom
 * ra thấy bản đồ thưa hơn lúc zoom vào từng quận, không hiểu vì sao.
 */
export interface IPostMapClusterDto {
  /**
   * Khoá của ô, ổn định giữa các lần gọi cùng mức phóng to.
   *
   * Client dùng nó làm key khi vẽ lại để cụm không nhấp nháy mỗi lần kéo bản
   * đồ. Dạng `<lng>:<lat>` của góc dưới-trái ô.
   */
  cellKey: string;
  count: number;
  /**
   * Điểm để vẽ cụm.
   *
   * Nhiều bài thì là TÂM Ô — không phải trọng tâm các bài, vì trọng tâm của hai
   * bài cùng một địa chỉ chính là địa chỉ đó. Đúng một bài thì là toạ độ bài đã
   * làm nhiễu, y như mọi chỗ khác.
   */
  location: IGeoPoint;
  isLocationApproximate: true;
  /** Chỉ có khi `count === 1` — đủ dữ liệu cho thẻ xem nhanh (F29). */
  marker: IPostMapMarkerDto | null;
}

export interface IGetPostMapResponseDto {
  clusters: IPostMapClusterDto[];
  /** Tổng số bài trong khung nhìn — con số THẬT, không bị cắt. */
  total: number;
  /** Cỡ ô lưới đang dùng, theo độ. Client cần nó để vẽ vùng cụm. */
  cellSizeDegrees: number;
  /** `true` khi số ô vượt trần và danh sách đã bị cắt bớt. */
  truncated: boolean;
}

export interface IUpdatePostDto {
  categoryId?: string;
  totalQuantity?: number;
  isSos?: boolean;
  deliveryMethod?: DeliveryMethods | null;
  shipPayer?: ShipPayers | null;
  price?: number;
  negotiable?: boolean;
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
