import {
  IContentShareRepository,
  IRecordShareParams,
  IRecordShareResult,
} from '@/domain/ports/repository';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Bảng và cột đếm tương ứng với từng loại chủ thể.
 *
 * Hiện chỉ bài đăng có `share_count`. Bình luận không chia sẻ được — đó là
 * quyết định sản phẩm, không phải thiếu sót kỹ thuật.
 */
const CounterTargets: Record<
  ContentSubjectTypes,
  { table: string; keyColumn: string; countColumn: string } | null
> = {
  [ContentSubjectTypes.POST]: {
    table: 'posts',
    keyColumn: 'global_id',
    countColumn: 'share_count',
  },
  [ContentSubjectTypes.COMMENT]: null,
  [ContentSubjectTypes.DHARMA_THREAD]: null,
};

@Injectable()
export class ContentShareRepository implements IContentShareRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async recordShare(
    params: IRecordShareParams,
  ): Promise<IRecordShareResult> {
    return this.manager.transaction(async (manager) => {
      await manager.query(
        `
          INSERT INTO content_shares
            (subject_type, subject_id, user_id, channel)
          VALUES ($1, $2, $3, $4)
        `,
        [params.subjectType, params.subjectId, params.userId, params.channel],
      );

      const target = CounterTargets[params.subjectType];
      if (!target) return { shareCount: 0 };

      const [row] = await manager.query<{ share_count: string }[]>(
        `
          UPDATE ${target.table}
          SET ${target.countColumn} = ${target.countColumn} + 1
          WHERE ${target.keyColumn} = $1
          RETURNING ${target.countColumn} AS share_count
        `,
        [params.subjectId],
      );

      return { shareCount: Number(row?.share_count ?? 0) };
    });
  }
}
