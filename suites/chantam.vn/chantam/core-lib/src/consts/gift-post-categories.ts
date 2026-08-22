/**
 * Danh mục vật phẩm và hình thức hỗ trợ.
 *
 * Đặc tả mục 3.2 chia làm hai loại: cho vật chất và cho phi vật chất (tư vấn,
 * đưa đón, dạy học, sửa chữa). Cả hai dùng chung một enum vì luồng đăng bài,
 * duyệt đơn và tính điểm là như nhau.
 */
export enum GiftPostCategories {
  HOUSEHOLD = 'HOUSEHOLD',
  CLOTHING = 'CLOTHING',
  BOOKS = 'BOOKS',
  ELECTRONICS = 'ELECTRONICS',
  FURNITURE = 'FURNITURE',
  VEHICLE = 'VEHICLE',
  MEDICAL = 'MEDICAL',
  FOOD = 'FOOD',
  /** Tư vấn tâm lý, hướng nghiệp, dạy học, sửa chữa, đưa đón... */
  NON_MATERIAL = 'NON_MATERIAL',
  OTHER = 'OTHER',
}
