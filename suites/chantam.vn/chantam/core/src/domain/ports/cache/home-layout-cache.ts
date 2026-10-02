import { IHomeLayout } from '@chantam.vn/chantam.core-lib/models';

/**
 * Đệm bố cục Home (UC-ADM-03 bước 5 và 6).
 *
 * Ba phép, và cả ba **không được ném**: Redis chết không được làm sập `GET
 * /config/home-layout` — đó là màn hình đầu tiên của app, mất nó là mất cả ứng dụng, còn
 * mất đệm chỉ là chậm thêm một truy vấn.
 *
 * `invalidate` trả về `boolean` chứ không trả `void`, và đó là chỗ có chủ ý: xoá đệm thất
 * bại nghĩa là bố cục cũ còn phục vụ tới một giờ nữa. Nuốt im thì Admin bấm Lưu, thấy
 * thành công, mở app ra vẫn thấy giao diện cũ, và không có gì nói vì sao. Bên gọi phải
 * chuyển tín hiệu đó lên response.
 */
export interface IHomeLayoutCache {
  read(): Promise<IHomeLayout | null>;
  write(layout: IHomeLayout): Promise<void>;
  /** `true` khi đã xoá được khoá đệm; `false` khi Redis không trả lời. */
  invalidate(): Promise<boolean>;
}

export const IHomeLayoutCache = Symbol('IHomeLayoutCache');
