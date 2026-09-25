import {
  IAutoSelectDueRecipientsCommand,
  IAutoSelectDueRecipientsResult,
  IAutoSelectDueRecipientsUseCase,
  IAutoSelectedRecipient,
} from '@/application/contracts/gift-request';
import {
  IAdminConfigRepository,
  IGiftRequestRepository,
} from '@/domain/ports/repository';
import { CandidateSelectionConfigKey } from '@chantam.vn/chantam.core-lib/consts';
import { pickNextCandidate } from '@chantam.vn/chantam.core-lib/models';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

const DefaultLimit = 200;

/**
 * Chốt người nhận cho bài đã hết đồng hồ chọn (F75).
 *
 * **Vì sao countdown mà không có job này thì vô nghĩa.** `selection_deadline`
 * được ghi từ lâu khi có yêu cầu đầu tiên, nhưng không ai đọc nó — nên bài ở chế
 * độ `OPTIMAL` treo mãi cho tới khi chủ bài tự vào duyệt. Người xin chờ một đồng
 * hồ không bao giờ reo.
 *
 * Thứ tự ưu tiên lấy từ cấu hình Admin (CH-1), dùng CHUNG với hàng đợi dự phòng
 * F33. Hai chỗ xếp hai kiểu thì cùng một bài sẽ đề xuất hai người khác nhau tuỳ
 * đường nào chạy trước.
 *
 * Chạy bằng `npm run selection:auto-select`, thêm `--dry-run` để chỉ xem.
 */
@Injectable()
export class AutoSelectDueRecipientsUseCase implements IAutoSelectDueRecipientsUseCase {
  private readonly logger = new Logger(AutoSelectDueRecipientsUseCase.name);

  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly requests: IGiftRequestRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    private readonly acceptedNotifier: AcceptedRequestNotifier,
  ) {}

  public async handle(
    command: IAutoSelectDueRecipientsCommand,
  ): Promise<IAutoSelectDueRecipientsResult> {
    const due = await this.requests.findPostsDueForSelection(
      command.limit ?? DefaultLimit,
    );

    if (due.length === 0) return { due: 0, selected: [], failed: [] };

    // Đọc cấu hình MỘT lần cho cả vòng: thứ tự ưu tiên là chính sách chung, và
    // đọc lại mỗi bài sẽ cho ra hai bài cùng lượt chạy xếp theo hai thứ tự khác
    // nhau nếu Admin đổi cấu hình giữa chừng.
    const configuredOrder = await this.adminConfig.getConfigValue(
      CandidateSelectionConfigKey,
    );

    const selected: IAutoSelectedRecipient[] = [];
    const failed: { postId: string; reason: string }[] = [];

    for (const post of due) {
      try {
        const candidates = await this.requests.listCandidateMetrics(
          post.postId,
        );
        // Câu quét đã đòi có ứng viên, nhưng giữa lúc quét và lúc đọc họ có thể
        // rút hết. Bỏ qua chứ không coi là lỗi.
        if (candidates.length === 0) continue;

        // `pickNextCandidate` nhận hình dạng thuần của `core-lib`; nó trả lại
        // đúng phần tử trong mảng truyền vào, nên `requestGlobalId` còn nguyên.
        const winner = pickNextCandidate(
          candidates,
          configuredOrder as readonly unknown[] | null,
        ) as (typeof candidates)[number] | null;
        if (!winner) continue;

        if (command.dryRun === true) {
          selected.push({
            postId: post.postId,
            requesterId: winner.requesterId,
            transactionId: null,
            candidates: candidates.length,
          });
          continue;
        }

        // Đi qua chính đường duyệt của chủ bài, không viết đường riêng: nó đã lo
        // khoá hàng, trừ tồn kho, chuyển ứng viên còn lại sang STANDBY, mở phòng
        // chat và xoá `selection_deadline`. Một đường thứ hai là một chỗ nữa để
        // quên một trong số đó.
        const accepted = await this.requests.acceptRequest({
          requestId: winner.requestGlobalId,
          postId: post.postId,
          giverId: post.giverId,
          transactionId: makeGlobalId(
            `/transactions/${post.postId}/${winner.requesterId}`,
          ),
        });

        // Với auto-select, thông báo còn quan trọng hơn đường duyệt tay: người
        // dùng không bấm gì cả, hệ thống quyết hộ họ. Không báo thì họ chỉ biết
        // khi tình cờ mở app, trong khi người tặng đang chờ trả lời.
        await this.acceptedNotifier.announce({
          receiverId: winner.requesterId,
          postId: post.postId,
          transactionId: accepted.transactionId,
          automatic: true,
        });

        selected.push({
          postId: post.postId,
          requesterId: winner.requesterId,
          transactionId: accepted.transactionId,
          candidates: candidates.length,
        });
      } catch (error) {
        // Một bài hỏng không được làm dừng cả vòng: những bài còn lại cũng đang
        // để người xin chờ một đồng hồ đã reo.
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Không chốt được người nhận cho ${post.postId}: ${reason}`,
        );
        failed.push({ postId: post.postId, reason });
      }
    }

    return { due: due.length, selected, failed };
  }
}
