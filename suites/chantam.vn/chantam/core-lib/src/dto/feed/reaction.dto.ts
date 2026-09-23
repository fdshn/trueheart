import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';
import { ReactionKinds } from '../../consts';

export interface IReactionSummaryDto {
  /** Tổng số người đã bày tỏ. Đọc từ cột đếm, không COUNT(*) mỗi lần. */
  total: number;
  /**
   * Số lượt theo từng loại, chỉ gồm loại thực sự có người chọn.
   *
   * Trả về loại có số 0 là bắt giao diện tự lọc, và làm payload bảng tin phình
   * lên vì mỗi bài mang năm khoá trong đó bốn khoá vô nghĩa.
   */
  breakdown: Partial<Record<ReactionKinds, number>>;
  /** Cảm xúc của CHÍNH người gọi. `null` khi chưa bày tỏ hoặc chưa đăng nhập. */
  myReaction: ReactionKinds | null;
}

export interface IReactionActorDto {
  userId: string;
  username: string;
  fullName: string | null;
  kind: ReactionKinds;
  reactedAt: Date;
}

export interface IListReactionsResponseDto {
  summary: IReactionSummaryDto;
  actors: IReactionActorDto[];
  meta: IPaginationMetaDto;
}

export interface ISetReactionBodyDto {
  reaction: { kind: ReactionKinds };
}

export interface ISetReactionResponseDto {
  reaction: IReactionSummaryDto;
}
