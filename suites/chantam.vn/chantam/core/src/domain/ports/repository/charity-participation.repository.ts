import { CharityParticipationStatus } from '@chantam.vn/chantam.core-lib/models';
import { ICharityUserBrief } from './charity-event.repository';

/** Vị trí tuyển người mà participant đã nhận (§3.11) — để ban tổ chức thấy họ làm gì. */
export interface ICharityParticipationPosition {
  volunteerNeedId: string;
  title: string;
  status: string;
}

/** Một lượt tham gia dự án — vòng đời chung (chốt 05/11, §3.11). */
export interface ICharityParticipation {
  participationId: string;
  campaignId: string;
  user: ICharityUserBrief;
  status: CharityParticipationStatus;
  registeredAt: Date;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
  statusReason: string | null;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  cancelledAt: Date | null;
  positions: ICharityParticipationPosition[];
}

export interface ICharityParticipationRepository {
  list(params: {
    campaignId: string;
    status: CharityParticipationStatus | null;
  }): Promise<ICharityParticipation[]>;
  find(
    campaignId: string,
    participationId: string,
  ): Promise<ICharityParticipation | null>;
  findByUser(
    campaignId: string,
    userId: string,
  ): Promise<ICharityParticipation | null>;
  /**
   * Đổi trạng thái CÓ ĐIỀU KIỆN: chỉ khi trạng thái hiện tại nằm trong `from` — hai người
   * bấm cùng lúc thì một người thắng, người kia nhận `null`. `checkIn` ghi mốc check-in.
   */
  transition(params: {
    campaignId: string;
    participationId: string;
    from: readonly CharityParticipationStatus[];
    to: CharityParticipationStatus;
    actorId: string;
    reason: string | null;
    checkIn: boolean;
  }): Promise<ICharityParticipation | null>;
}
export const ICharityParticipationRepository = Symbol(
  'ICharityParticipationRepository',
);
