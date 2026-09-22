import { IUseCase } from '@chantam/service.common-lib';

/** Số phòng xử lý mỗi lần chạy. Giữ nhỏ để một vòng quét không khoá bảng lâu. */
export const ChatPurgeBatchSize = 200;

export interface IPurgeExpiredChatsCommand {
  limit?: number;
}

export interface IPurgeExpiredChatsResult {
  purgedRooms: number;
  purgedMessages: number;
}

export interface IPurgeExpiredChatsUseCase extends IUseCase<
  IPurgeExpiredChatsCommand,
  IPurgeExpiredChatsResult
> {}

export const IPurgeExpiredChatsUseCase = Symbol('IPurgeExpiredChatsUseCase');
