import {
  ICharityEngagementCounters,
  ICharityInternalStats,
  ICharityRevision,
  ICharityTask,
  ICharityTaskPatch,
} from '@/domain/ports/repository';
import { CharityOperationStage } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 2 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4, §3.7,
 * §3.10, §3.13).
 */

export interface ICharityTaskView extends ICharityTask {
  label: string;
}

export interface IListCharityTasksUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityTaskView[]
> {}
export const IListCharityTasksUseCase = Symbol('IListCharityTasksUseCase');

export interface IUpdateCharityTaskCommand extends ICharityProjectCommand {
  readonly taskId: string;
  readonly patch: ICharityTaskPatch;
}
export interface IUpdateCharityTaskUseCase extends IUseCase<
  IUpdateCharityTaskCommand,
  ICharityTaskView
> {}
export const IUpdateCharityTaskUseCase = Symbol('IUpdateCharityTaskUseCase');

export type CharityViewScope = 'PUBLIC' | 'WORKSPACE';

export interface IListCharityRevisionsCommand {
  readonly idOrSlug: string;
  readonly userId: string | null;
  readonly scope: CharityViewScope;
  readonly beforeRevisionId: string | null;
  readonly limit: number;
}
export interface ICharityRevisionPage {
  revisions: ICharityRevision[];
  /** Truyền lại làm `before` để lấy trang sau; `null` là hết. */
  nextBefore: string | null;
}
export interface IListCharityRevisionsUseCase extends IUseCase<
  IListCharityRevisionsCommand,
  ICharityRevisionPage
> {}
export const IListCharityRevisionsUseCase = Symbol(
  'IListCharityRevisionsUseCase',
);

export interface IFollowCharityProjectCommand {
  readonly idOrSlug: string;
  readonly userId: string;
  readonly follow: boolean;
}
export interface IFollowCharityProjectUseCase extends IUseCase<
  IFollowCharityProjectCommand,
  { following: boolean; followerCount: number }
> {}
export const IFollowCharityProjectUseCase = Symbol(
  'IFollowCharityProjectUseCase',
);

export interface ICharityNeedTotals {
  items: {
    target: number;
    registered: number;
    approved: number;
    receivedInApp: number;
    receivedExternal: number;
    remaining: number;
  };
  funding: {
    target: number;
    confirmed: number;
    external: number;
    remaining: number;
  };
  volunteers: { needed: number; confirmed: number; remaining: number };
}

export interface ICharityPublicStats extends ICharityEngagementCounters {
  /** Người có đóng góp được chấp nhận. */
  supporterCount: number;
  /** Đăng ký tham gia còn hiệu lực + người tuyển đã xác nhận. */
  participantCount: number;
  needs: ICharityNeedTotals;
}

export interface ICharityInternalStatsView extends ICharityInternalStats {
  needs: ICharityNeedTotals;
}

export interface IGetCharityStatsCommand {
  readonly idOrSlug: string;
  readonly userId: string | null;
}
export interface IGetCharityPublicStatsUseCase extends IUseCase<
  IGetCharityStatsCommand,
  ICharityPublicStats
> {}
export const IGetCharityPublicStatsUseCase = Symbol(
  'IGetCharityPublicStatsUseCase',
);
export interface IGetCharityInternalStatsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityInternalStatsView
> {}
export const IGetCharityInternalStatsUseCase = Symbol(
  'IGetCharityInternalStatsUseCase',
);

export interface ICharityExportView {
  exportId: string;
  sectionKey: CharityOperationStage | null;
  lastRevisionId: string | null;
  generatedBy: string | null;
  generatedAt: Date;
  /** Đường tải PDF (cần token như mọi đường workspace). */
  downloadPath: string;
}

export interface ICreateCharityExportCommand extends ICharityProjectCommand {
  readonly sectionKey: CharityOperationStage | null;
}
export interface ICreateCharityExportUseCase extends IUseCase<
  ICreateCharityExportCommand,
  ICharityExportView
> {}
export const ICreateCharityExportUseCase = Symbol(
  'ICreateCharityExportUseCase',
);

export interface IListCharityExportsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityExportView[]
> {}
export const IListCharityExportsUseCase = Symbol('IListCharityExportsUseCase');

export interface IGetCharityExportPdfCommand extends ICharityProjectCommand {
  readonly exportId: string;
}
export interface IGetCharityExportPdfUseCase extends IUseCase<
  IGetCharityExportPdfCommand,
  { fileName: string; pdf: Buffer }
> {}
export const IGetCharityExportPdfUseCase = Symbol(
  'IGetCharityExportPdfUseCase',
);

export interface ICreateCharityShareLinkCommand {
  readonly idOrSlug: string;
  readonly userId: string;
  readonly sectionKey: CharityOperationStage | null;
  readonly channel: string | null;
}
export interface ICharityShareLink {
  sectionKey: CharityOperationStage | null;
  sharePath: string;
  /** `null` khi máy chủ chưa cấu hình `WEB_PUBLIC_BASE_URL`. */
  shareUrl: string | null;
}
export interface ICreateCharityShareLinkUseCase extends IUseCase<
  ICreateCharityShareLinkCommand,
  ICharityShareLink
> {}
export const ICreateCharityShareLinkUseCase = Symbol(
  'ICreateCharityShareLinkUseCase',
);

export interface IProcessCharityAnnouncementsResult {
  /** Dự án vừa được xếp nhắc 48 giờ. */
  preEventQueued: number;
  /** Thông báo theo dự án đã xử lý xong (mỗi cái gửi tới cả nhóm người nhận). */
  processed: number;
  /** Tổng lượt gửi thành công. */
  notified: number;
}
export interface IProcessCharityAnnouncementsUseCase extends IUseCase<
  { dryRun: boolean; limit: number },
  IProcessCharityAnnouncementsResult
> {}
export const IProcessCharityAnnouncementsUseCase = Symbol(
  'IProcessCharityAnnouncementsUseCase',
);
