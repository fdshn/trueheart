/**
 * Trần gọi theo NGUỒN GỌI, thường là địa chỉ IP.
 *
 * Bổ sung cho `ILoginThrottle` chứ không thay thế: cái kia đếm theo tài khoản
 * nên chặn được người dò mật khẩu của MỘT người, còn cái này chặn người rải một
 * mật khẩu phổ biến qua hàng nghìn tài khoản — mỗi tài khoản chỉ sai một lần,
 * không tài khoản nào chạm trần của riêng nó.
 *
 * Tách `assert` khỏi `register` là có chủ ý: có chỗ chỉ nên đếm khi THẤT BẠI
 * (đăng nhập), có chỗ chỉ nên đếm khi THÀNH CÔNG (đăng ký — thứ cần giới hạn là
 * số tài khoản tạo ra, không phải số lần gõ sai form).
 */
export interface IRequestThrottle {
  /** Ném `TooManyRequestsException` khi đã chạm trần. Không tăng bộ đếm. */
  assertWithinLimit(params: {
    bucket: string;
    key: string;
    limit: number;
  }): Promise<void>;

  /** Tăng bộ đếm. Cửa sổ tính từ lần đếm ĐẦU TIÊN, không gia hạn theo mỗi lần. */
  registerHit(params: {
    bucket: string;
    key: string;
    windowSeconds: number;
  }): Promise<void>;
}

export const IRequestThrottle = Symbol('IRequestThrottle');
