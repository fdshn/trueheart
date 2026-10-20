import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  ICharityContribution,
  ICharityDelivery,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Thông báo của phân hệ đóng góp từ thiện (F65b).
 *
 * Gọi SAU khi việc chính đã commit, và NUỐT lỗi của chính nó — cùng lối
 * `AcceptedRequestNotifier`. Đẩy thông báo hỏng không được làm một lượt quyết định
 * trông như thất bại: lượt đó đã ghi xong, và báo lỗi lúc này là mời người tổ chức bấm
 * lại — với một khoá chống trùng mới, tức một lỗi `ALREADY_DECIDED` thứ hai.
 *
 * Mỗi lượt gửi có khoá chống trùng theo ĐÚNG đối tượng nó nói về, nên retry của nơi
 * gọi không sinh hai thông báo.
 */
@Injectable()
export class CharityNotifier {
  private readonly logger = new Logger(CharityNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  /** Báo người TỔ CHỨC rằng có đề nghị mới cần xét. */
  public async contributionSubmitted(params: {
    organizerId: string | null;
    campaignTitle: string;
    contribution: ICharityContribution;
  }): Promise<void> {
    // Hoạt động mất người tạo (tài khoản đã xoá, `created_by` về NULL) thì không có
    // ai để báo — không phải lỗi.
    if (!params.organizerId) return;
    await this.send({
      userId: params.organizerId,
      type: NotificationTypes.CHARITY_CONTRIBUTION_SUBMITTED,
      title: 'Có đề nghị đóng góp mới',
      body: `"${params.campaignTitle}" vừa nhận một đề nghị gồm ${params.contribution.items.length} vật phẩm, đang chờ bạn xét.`,
      referenceType: 'CHARITY_CONTRIBUTION',
      referenceId: params.contribution.globalId,
      target: {
        type: NotificationTargetTypes.CHARITY_CAMPAIGN,
        id: params.contribution.campaignId,
      },
      idempotencyKey: `${NotificationTypes.CHARITY_CONTRIBUTION_SUBMITTED}:${params.contribution.globalId}`,
    });
  }

  /**
   * Báo NGƯỜI TẶNG kết quả xét đề nghị.
   *
   * Câu thông báo nói đúng kết quả — nhận đủ, một phần, hay không nhận — chứ không
   * chung chung "đề nghị đã được xét": người nhận được một phần cần biết ngay rằng
   * một món của họ không được nhận, trước khi họ mang cả hai món tới.
   */
  public async contributionDecided(params: {
    campaignTitle: string;
    contribution: Pick<
      ICharityContribution,
      'globalId' | 'campaignId' | 'contributorId' | 'status'
    >;
    /** `true` khi đề nghị bị từ chối vì hoạt động ĐÓNG, không vì người tổ chức chọn. */
    byClosing?: boolean;
  }): Promise<void> {
    const { contribution } = params;
    const body = params.byClosing
      ? `"${params.campaignTitle}" đã đóng nên đề nghị của bạn không được xét nữa. Cảm ơn bạn đã muốn góp sức.`
      : contribution.status === 'ACCEPTED'
        ? `Người tổ chức "${params.campaignTitle}" nhận đủ đề nghị của bạn. Hãy liên hệ để giao vật phẩm.`
        : contribution.status === 'PARTIALLY_ACCEPTED'
          ? `Người tổ chức "${params.campaignTitle}" nhận MỘT PHẦN đề nghị của bạn. Xem chi tiết để biết món nào được nhận trước khi giao.`
          : `Người tổ chức "${params.campaignTitle}" chưa nhận được đề nghị lần này của bạn. Cảm ơn bạn đã muốn góp sức.`;

    await this.send({
      userId: contribution.contributorId,
      type: NotificationTypes.CHARITY_CONTRIBUTION_DECIDED,
      title: 'Đề nghị đóng góp đã được xét',
      body,
      referenceType: 'CHARITY_CONTRIBUTION',
      referenceId: contribution.globalId,
      target: {
        type: NotificationTargetTypes.CHARITY_CAMPAIGN,
        id: contribution.campaignId,
      },
      idempotencyKey: `${NotificationTypes.CHARITY_CONTRIBUTION_DECIDED}:${contribution.globalId}`,
    });
  }

  public async deliveryCompleted(params: {
    campaignTitle: string;
    delivery: ICharityDelivery;
  }): Promise<void> {
    await this.send({
      userId: params.delivery.contributorId,
      type: NotificationTypes.CHARITY_DELIVERY_COMPLETED,
      title: 'Vật phẩm của bạn đã tới nơi',
      body: `Người tổ chức "${params.campaignTitle}" đã xác nhận nhận được vật phẩm bạn góp. Cảm ơn tấm lòng của bạn.`,
      referenceType: 'CHARITY_DELIVERY',
      referenceId: params.delivery.globalId,
      target: {
        type: NotificationTargetTypes.CHARITY_CAMPAIGN,
        id: params.delivery.campaignId,
      },
      idempotencyKey: `${NotificationTypes.CHARITY_DELIVERY_COMPLETED}:${params.delivery.globalId}`,
    });
  }

  /** Báo BÊN KIA — người vừa bấm huỷ đã biết việc mình vừa làm. */
  public async deliveryCancelled(params: {
    campaignTitle: string;
    delivery: ICharityDelivery;
    cancelledBy: string;
  }): Promise<void> {
    const { delivery } = params;
    const counterpart =
      params.cancelledBy === delivery.contributorId
        ? delivery.organizerId
        : delivery.contributorId;
    await this.send({
      userId: counterpart,
      type: NotificationTypes.CHARITY_DELIVERY_CANCELLED,
      title: 'Lượt giao nhận đã bị huỷ',
      body: `Lượt giao nhận vật phẩm cho "${params.campaignTitle}" đã bị huỷ. Lý do: ${delivery.cancelReason ?? 'không ghi'}.`,
      referenceType: 'CHARITY_DELIVERY',
      referenceId: delivery.globalId,
      target: {
        type: NotificationTargetTypes.CHARITY_CAMPAIGN,
        id: delivery.campaignId,
      },
      idempotencyKey: `${NotificationTypes.CHARITY_DELIVERY_CANCELLED}:${delivery.globalId}`,
    });
  }

  private async send(
    command: Parameters<IDispatchNotificationUseCase['handle']>[0],
  ): Promise<void> {
    try {
      await this.dispatchNotification.handle(command);
    } catch (error) {
      this.logger.warn(
        `Không gửi được ${command.type} cho ${command.userId}: ${String(error)}`,
      );
    }
  }
}
