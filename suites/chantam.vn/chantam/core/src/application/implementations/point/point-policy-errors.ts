import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
  IAppendPointEntryUseCase,
} from '@/application/contracts/point';
import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';

/**
 * Hai ngoại lệ CHÍNH SÁCH của hệ điểm: rule bị Admin tắt, và chạm trần ngày.
 *
 * Cả hai đều do tầng JS ném ra sau một câu SELECT thành công, nên transaction
 * đang mở vẫn còn dùng được — chỗ gọi nuốt xong vẫn commit được phần việc
 * chính.
 *
 * **Vì sao phải nuốt.** Việc người dùng vừa làm là SỰ THẬT; thưởng bao nhiêu
 * điểm là CHÍNH SÁCH. Để chính sách đánh đổ sự thật nghĩa là một cái công tắc
 * trong trang Admin sẽ chặn được cả việc xác minh số điện thoại lẫn việc thăng
 * hạng — xem lịch sử ở `docs/diagram/11-point.md` §Chỗ cần soát.
 *
 * **Chỉ nuốt đúng hai loại này.** Mọi lỗi khác là lỗi database thật và phải nổi
 * lên. `catch {}` trống ở đây biến một sự cố thành "hôm nay không ai được điểm"
 * mà không ai biết.
 */
export function isPointPolicyError(error: unknown): boolean {
  return (
    error instanceof PointRuleUnavailableException ||
    error instanceof PointDailyCapReachedException
  );
}

/**
 * Cộng điểm, bỏ qua hai ngoại lệ chính sách.
 *
 * Trả `null` khi không cộng được vì chính sách, để chỗ gọi phân biệt được
 * "không cộng" với "đã cộng 0 điểm" — chấm 0% vẫn ghi một bút toán delta = 0,
 * và đó là hai chuyện khác nhau.
 */
export async function appendPointIgnoringPolicy(
  appendPointEntry: IAppendPointEntryUseCase,
  command: IAppendPointEntryCommand,
): Promise<IAppendPointEntryResult | null> {
  try {
    return await appendPointEntry.handle(command);
  } catch (error) {
    if (isPointPolicyError(error)) return null;
    throw error;
  }
}
