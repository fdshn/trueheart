import {
  IGetSmartMatchesCommand,
  IGetSmartMatchesUseCase,
} from '@/application/contracts/post';
import {
  SmartMatchDefaultRadiusMeters,
  SmartMatchMaxResults,
} from '@/domain/consts';
import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGetSmartMatchesResponseDto,
  SmartMatchReason,
} from '@chantam.vn/chantam.core-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import {
  buildSmartMatchReasons,
  extractSmartMatchKeywords,
  scoreSmartMatch,
} from './smart-match.policy';

/** Bài Muốn Nhận ghép với Muốn Tặng, và ngược lại. */
const ComplementaryType: Partial<Record<PostTypes, PostTypes>> = {
  [PostTypes.OFFER]: PostTypes.WANTED,
  [PostTypes.WANTED]: PostTypes.OFFER,
};

@Injectable()
export class GetSmartMatchesUseCase implements IGetSmartMatchesUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetSmartMatchesCommand,
  ): Promise<IGetSmartMatchesResponseDto> {
    const source = await this.postRepository.findOneBy({
      globalId: command.postId,
    });

    if (!source || source.deletedAt)
      throw new PostNotFoundException(command.postId);

    // Chỉ tác giả xem được gợi ý cho bài của mình. Mở cho người ngoài nghĩa là
    // cho phép lấy vị trí THẬT của bài làm tâm truy vấn — bản đồ công khai chỉ
    // trả vị trí đã làm nhiễu, nên đây sẽ là đường vòng để dò toạ độ chính xác.
    if (source.authorId !== command.userId) throw new ForbiddenException();

    const targetType = ComplementaryType[source.postType];

    // Chỉ Muốn Tặng ↔ Muốn Nhận mới có khái niệm ghép đôi. Các loại còn lại
    // trả danh sách rỗng thay vì ghép bừa.
    if (!targetType)
      return {
        sourcePostId: source.globalId,
        radiusMeters: 0,
        matches: [],
      };

    const radiusMeters = command.radiusMeters ?? SmartMatchDefaultRadiusMeters;
    const take = Math.min(
      command.take ?? SmartMatchMaxResults,
      SmartMatchMaxResults,
    );

    const candidates = await this.postRepository.findSmartMatches({
      sourcePostId: source.globalId,
      excludeAuthorId: source.authorId,
      postType: targetType,
      categoryId: source.categoryId,
      origin: source.location,
      radiusMeters,
      keywords: extractSmartMatchKeywords(source.title),
      take,
    });

    const ranked = candidates
      .map((candidate) => {
        const signals = {
          sameCategory: candidate.sameCategory,
          keywordMatched: candidate.keywordMatched,
          distanceMeters: candidate.distanceMeters,
          radiusMeters,
        };

        return {
          post: {
            ...candidate.post,
            location: applyGeoJitter(
              candidate.post.location,
              candidate.post.globalId,
              this.config.geo.jitterRadiusMeters,
            ),
          },
          // Làm tròn khoảng cách theo bậc như mọi chỗ công khai khác: trả số
          // mét chính xác là đủ để tam giác đạc ra nhà người ta.
          distanceMeters: bucketDistance(candidate.distanceMeters),
          isLocationApproximate: true as const,
          score: scoreSmartMatch(signals),
          reasons: buildSmartMatchReasons(signals) as SmartMatchReason[],
        };
      })
      // Khớp cao lên trước; bằng điểm thì gần hơn lên trước.
      .sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters)
      .slice(0, take);

    // Nạp ảnh SAU khi cắt. `findSmartMatches` trả về cả rổ ứng viên rồi mới
    // xếp hạng, nên hỏi ảnh trước đó là kéo về đúng thứ vừa quyết không trả.
    const matchIds = ranked.map((match) => match.post.globalId);
    const allMedia =
      matchIds.length > 0
        ? await this.postMediaRepository.listByPostIds(matchIds)
        : [];

    const mediaMap = new Map<
      string,
      Array<{ id: number; url: string; sortOrder: number }>
    >();
    for (const item of allMedia) {
      const url = `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`;
      const entry = { id: item.id, url, sortOrder: item.sortOrder };
      const list = mediaMap.get(item.postId);
      if (list) {
        list.push(entry);
      } else {
        mediaMap.set(item.postId, [entry]);
      }
    }

    const matches = ranked.map((match) => ({
      ...match,
      media: (mediaMap.get(match.post.globalId) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    }));

    return { sourcePostId: source.globalId, radiusMeters, matches };
  }
}
