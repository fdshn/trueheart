import { DharmaThreadNotFoundException } from '@/domain/exceptions';
import { IDharmaRepository } from '@/domain/ports/repository';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { isPubliclyVisibleThread } from '@chantam.vn/chantam.core-lib/models';

/**
 * Chủ đề Diễn đàn Phật Pháp phải đang hiện thì bình luận và cảm xúc của nó mới ĐỌC được.
 *
 * Ghi đã kiểm từ 04/10, đọc thì chưa: chủ đề chờ duyệt hoặc bị Admin ẩn trả 404 ở
 * `GET /dharma/threads/:id`, nhưng cuộc trò chuyện bên dưới vẫn đọc được qua đường danh
 * sách — ẩn chủ đề mà không ẩn gì cả.
 *
 * Chỉ áp cho `DHARMA_THREAD`. Luật xem bài đăng nằm ở `findPublicByGlobalId` và rộng hơn
 * nhiều (người trong lượt trao xem lại bài đã xong), nên bài đi đường cũ, không đổi.
 */
export async function assertThreadReadable(
  dharma: IDharmaRepository,
  subjectType: ContentSubjectTypes,
  subjectId: string,
): Promise<void> {
  if (subjectType !== ContentSubjectTypes.DHARMA_THREAD) return;
  const thread = await dharma.findThreadByGlobalId(subjectId);
  if (!thread || !isPubliclyVisibleThread(thread.status))
    throw new DharmaThreadNotFoundException();
}
