import { IUseCase } from '@chantam/service.common-lib';

/** Số phòng xử lý mỗi lần chạy. Giữ nhỏ để một vòng quét không khoá bảng lâu. */
export const ChatPurgeBatchSize = 200;

export interface IPurgeExpiredChatsCommand {
  limit?: number;
}

export interface IPurgeExpiredChatsResult {
  purgedRooms: number;
  purgedMessages: number;
  /**
   * Số ảnh đã xoá được khỏi storage.
   *
   * Có thể NHỎ HƠN số ảnh của những tin vừa xoá: dọn object là bước cố-gắng
   * chạy sau khi commit, và một object sót lại được lifecycle rule của bucket
   * dọn nốt. Dòng database thì đã đi rồi.
   */
  purgedMedia: number;
}

export interface IPurgeExpiredChatsUseCase extends IUseCase<
  IPurgeExpiredChatsCommand,
  IPurgeExpiredChatsResult
> {}

export const IPurgeExpiredChatsUseCase = Symbol('IPurgeExpiredChatsUseCase');
