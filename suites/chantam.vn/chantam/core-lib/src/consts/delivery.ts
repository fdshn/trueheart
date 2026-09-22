/**
 * Hình thức nhận hàng (F78).
 *
 * `SELF_PICKUP` thì không có phí ship, nên `ShipPayers` không áp dụng — ràng
 * buộc ở database chặn khai bên trả khi tự đến lấy.
 */
export enum DeliveryMethods {
  SELF_PICKUP = 'SELF_PICKUP',
  GIVER_SHIPS = 'GIVER_SHIPS',
}

/**
 * Bên chịu phí vận chuyển (CH-2).
 *
 * **Chỉ là một dấu hiệu, không phải thanh toán.** Tiền ship trả ngoài hệ thống
 * (COD với đơn vị vận chuyển). Hệ thống chỉ ghi ai lẽ ra phải trả, để khi người
 * gửi báo hàng bị hoàn mà không được thanh toán thì có căn cứ trừ điểm.
 *
 * Vì vậy KHÔNG cần tích hợp đơn vị vận chuyển, không mã vận đơn, không webhook.
 */
export enum ShipPayers {
  GIVER = 'GIVER',
  RECEIVER = 'RECEIVER',
}

/** Mã rule điểm cho khoản phạt không thanh toán phí ship. */
export const ShipUnpaidPenaltyRuleCode = 'SHIP_UNPAID_PENALTY';

/**
 * Mã rule điểm khi một lượt trao hoàn tất.
 *
 * Hai mã tách biệt để Admin chỉnh độc lập: cho và nhận không đáng giá như nhau,
 * và chỉ một trong hai được tính vào `lifetime` (tức vào Rank).
 */
export const GiftCompletedGiverRuleCode = 'GIFT_COMPLETED_GIVER';
export const GiftCompletedReceiverRuleCode = 'GIFT_COMPLETED_RECEIVER';

/**
 * Ba mốc có ảnh làm bằng chứng cho một lượt trao (CH-2).
 *
 * `HANDOVER` không phải riêng cho ship: tự đến lấy cũng có lúc trao đồ, và
 * tranh chấp "tôi chưa hề nhận được" vẫn xảy ra khi không có ship.
 *
 * `RETURNED` là thứ thật sự chứng minh lượt trao đổ. Ảnh lúc trao chỉ chứng
 * minh người tặng có trao; ảnh hàng quay về mới chứng minh nó không tới đích.
 */
export enum GiftEvidenceKinds {
  HANDOVER = 'HANDOVER',
  RECEIPT = 'RECEIPT',
  RETURNED = 'RETURNED',
}

/** Số ảnh tối đa cho mỗi mốc. Database chặn bằng slot 1–3, đây chỉ là bản sao để hiển thị. */
export const MaxEvidencePerKind = 3;
