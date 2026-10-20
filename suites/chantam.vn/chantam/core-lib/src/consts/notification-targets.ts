import { NotificationTypes } from './notification-types';

/**
 * Màn hình mobile mở khi người dùng bấm vào một thông báo.
 *
 * ## `reference` và `target` là hai câu hỏi khác nhau
 *
 * - `referenceType`/`referenceId`: đối tượng SINH RA sự kiện (một yêu cầu xin đồ,
 *   một lượt đóng góp…).
 * - `targetType`/`targetId`: màn hình phải mở, kèm id để gọi endpoint chi tiết.
 *
 * Trước 20/10 chỉ có `reference`, và với những đối tượng không có màn riêng (yêu cầu
 * xin đồ, lượt đóng góp) mobile phải đoán loại id theo `type` rồi tự tìm màn cha —
 * đoán sai là mở nhầm hoặc 404.
 *
 * Mỗi giá trị ứng với đúng một endpoint chi tiết:
 */
export enum NotificationTargetTypes {
  /** `GET /posts/:targetId` */
  POST = 'POST',
  /** `GET /transactions/:targetId` */
  GIFT_TRANSACTION = 'GIFT_TRANSACTION',
  /** `GET /chat/rooms/:targetId/messages` */
  CHAT_ROOM = 'CHAT_ROOM',
  /** `GET /campaigns/:targetId` */
  CHARITY_CAMPAIGN = 'CHARITY_CAMPAIGN',
  /** `GET /dharma/threads/:targetId` */
  DHARMA_THREAD = 'DHARMA_THREAD',
  /** `GET /ranks/me` — màn của chính người dùng, `targetId` luôn `null`. */
  RANK = 'RANK',
  /** `GET /referrals/me` — màn của chính người dùng, `targetId` luôn `null`. */
  REFERRAL = 'REFERRAL',
}

/** Màn "của tôi": không cần id, `targetId` luôn `null`. */
export const SingletonNotificationTargets: ReadonlySet<NotificationTargetTypes> =
  new Set([NotificationTargetTypes.RANK, NotificationTargetTypes.REFERRAL]);

/**
 * Loại màn mà từng loại thông báo ĐƯỢC PHÉP mở.
 *
 * `Record` trên toàn bộ `NotificationTypes`: thêm một loại thông báo mà quên khai ở
 * đây là lỗi biên dịch, không phải một thông báo mobile không biết mở đi đâu.
 *
 * Mảng rỗng nghĩa là KHÔNG có màn đích — mobile chỉ mở hộp thư. Một số loại cho phép
 * hơn một đích vì cùng một sự kiện gửi cho hai người ở hai vai khác nhau.
 */
export const NotificationTargetsByType: Readonly<
  Record<NotificationTypes, readonly NotificationTargetTypes[]>
> = {
  [NotificationTypes.NEW_CHAT_MESSAGE]: [NotificationTargetTypes.CHAT_ROOM],
  [NotificationTypes.CHAT_ROOM_SCHEDULED_FOR_PURGE]: [
    NotificationTargetTypes.CHAT_ROOM,
  ],

  // Yêu cầu xin đồ không có màn riêng: chủ bài duyệt ngay trên bài, người xin xem
  // lại bài mình đã xin.
  [NotificationTypes.GIFT_REQUEST_CREATED]: [NotificationTargetTypes.POST],
  [NotificationTypes.GIFT_REQUEST_REJECTED]: [NotificationTargetTypes.POST],
  [NotificationTypes.GIFT_REQUEST_CLOSED]: [NotificationTargetTypes.POST],
  // Được chấp nhận là đã có lượt trao — mở thẳng lượt trao.
  [NotificationTypes.GIFT_REQUEST_ACCEPTED]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],
  [NotificationTypes.GIFT_POST_RECEIVER_SELECTED]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],

  [NotificationTypes.GIFT_TRANSACTION_HANDED_OVER]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],
  // Người tặng mở lượt trao đã huỷ; người KẾ TIẾP trong hàng đợi chưa có lượt trao
  // nào nên mở bài.
  [NotificationTypes.GIFT_TRANSACTION_CLOSED]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
    NotificationTargetTypes.POST,
  ],
  [NotificationTypes.GIFT_TRANSACTION_REOPENED]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],
  [NotificationTypes.GIFT_TRANSACTION_COMPLETED]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],
  [NotificationTypes.REVIEW_REMINDER]: [
    NotificationTargetTypes.GIFT_TRANSACTION,
  ],

  [NotificationTypes.CONTENT_COMMENT_CREATED]: [NotificationTargetTypes.POST],
  [NotificationTypes.CONTENT_COMMENT_REPLIED]: [NotificationTargetTypes.POST],
  [NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY]: [
    NotificationTargetTypes.POST,
  ],
  [NotificationTypes.POST_EXPIRING_SOON]: [NotificationTargetTypes.POST],
  [NotificationTypes.POST_EXPIRED]: [NotificationTargetTypes.POST],

  [NotificationTypes.RANK_DEMOTION_WARNING]: [NotificationTargetTypes.RANK],
  [NotificationTypes.RANK_DEMOTED]: [NotificationTargetTypes.RANK],
  [NotificationTypes.RANK_PROMOTED]: [NotificationTargetTypes.RANK],
  [NotificationTypes.RANK_MAINTENANCE_REMINDER]: [NotificationTargetTypes.RANK],
  [NotificationTypes.REFERRAL_QUALIFIED]: [NotificationTargetTypes.REFERRAL],

  // Lượt đóng góp và lượt giao nhận không có màn riêng phía mobile: mở hoạt động.
  // `referenceId` vẫn là id lượt đó để màn hoạt động cuộn tới / tô sáng.
  [NotificationTypes.CHARITY_CONTRIBUTION_SUBMITTED]: [
    NotificationTargetTypes.CHARITY_CAMPAIGN,
  ],
  [NotificationTypes.CHARITY_CONTRIBUTION_DECIDED]: [
    NotificationTargetTypes.CHARITY_CAMPAIGN,
  ],
  [NotificationTypes.CHARITY_DELIVERY_COMPLETED]: [
    NotificationTargetTypes.CHARITY_CAMPAIGN,
  ],
  [NotificationTypes.CHARITY_DELIVERY_CANCELLED]: [
    NotificationTargetTypes.CHARITY_CAMPAIGN,
  ],

  // Nội dung bị báo xấu: bài, phòng chat (tin nhắn), chủ đề Phật pháp. Bình luận mở
  // bài chứa nó. Báo xấu một NGƯỜI thì không có màn để mở.
  [NotificationTypes.REPORT_REVIEWED]: [
    NotificationTargetTypes.POST,
    NotificationTargetTypes.CHAT_ROOM,
    NotificationTargetTypes.DHARMA_THREAD,
  ],
  [NotificationTypes.CONTENT_MODERATED]: [
    NotificationTargetTypes.POST,
    NotificationTargetTypes.CHAT_ROOM,
    NotificationTargetTypes.DHARMA_THREAD,
  ],

  [NotificationTypes.LUNAR_OBSERVANCE]: [],
  [NotificationTypes.SYSTEM_BROADCAST]: [],
};

/** Đích mà một thông báo mang theo; `null` là không có màn để mở. */
export interface INotificationTarget {
  readonly type: NotificationTargetTypes;
  /** `null` chỉ với màn "của tôi" (`SingletonNotificationTargets`). */
  readonly id: string | null;
}

/** `true` khi đích này hợp lệ cho loại thông báo đó, kể cả cặp type/id. */
export function isValidNotificationTarget(
  type: NotificationTypes,
  target: INotificationTarget,
): boolean {
  if (!NotificationTargetsByType[type].includes(target.type)) return false;
  return SingletonNotificationTargets.has(target.type)
    ? target.id === null
    : target.id !== null && target.id.length > 0;
}
