/** Tình trạng sử dụng của vật phẩm (đặc tả mục 5.7). */
export enum GiftPostConditions {
  NEW = 'NEW',
  LIKE_NEW = 'LIKE_NEW',
  USED = 'USED',
  /** Không áp dụng — dùng cho hỗ trợ phi vật chất. */
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}
