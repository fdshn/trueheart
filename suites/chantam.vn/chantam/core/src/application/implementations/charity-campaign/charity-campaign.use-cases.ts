import {
  IAmendExternalContributionCommand,
  IAmendExternalContributionUseCase,
  ICancelCharityDeliveryCommand,
  ICancelCharityDeliveryUseCase,
  ICancelCharityParticipationUseCase,
  ICharityCampaignPageResult,
  ICharityCampaignView,
  ICharityCampaignWriteInput,
  ICloseCharityCampaignCommand,
  ICloseCharityCampaignUseCase,
  ICompleteCharityDeliveryCommand,
  ICompleteCharityDeliveryUseCase,
  ICreateCharityCampaignCommand,
  ICreateCharityCampaignUseCase,
  IDecideCharityApprovalCommand,
  IDecideCharityApprovalUseCase,
  IDecideCharityContributionCommand,
  IDecideCharityContributionResult,
  IDecideCharityContributionUseCase,
  IDeleteCharityCampaignCommand,
  IDeleteCharityCampaignUseCase,
  IExtendCharityCampaignCommand,
  IExtendCharityCampaignUseCase,
  IGetAdminCampaignNeedsCommand,
  IGetAdminCampaignNeedsUseCase,
  IGetAdminCharityCampaignCommand,
  IGetAdminCharityCampaignResult,
  IGetAdminCharityCampaignUseCase,
  IGetCampaignNeedsCommand,
  IGetCampaignNeedsResult,
  IGetCampaignNeedsUseCase,
  IGetCharityContributionCommand,
  IGetCharityContributionUseCase,
  IGetCharityDeliveryCommand,
  IGetCharityDeliveryUseCase,
  IGetPublicCharityCampaignCommand,
  IGetPublicCharityCampaignResult,
  IGetPublicCharityCampaignUseCase,
  IJoinCharityCampaignCommand,
  IJoinCharityCampaignResult,
  IJoinCharityCampaignUseCase,
  IListAdminCharityCampaignsCommand,
  IListAdminCharityCampaignsUseCase,
  IListCampaignContributionsCommand,
  IListCampaignContributionsResult,
  IListCampaignContributionsUseCase,
  IListExternalContributionsCommand,
  IListExternalContributionsUseCase,
  IListJoinedCharityCampaignsUseCase,
  IListMyCharityCampaignsCommand,
  IListMyCharityCampaignsUseCase,
  IListMyContributionsCommand,
  IListMyContributionsResult,
  IListMyContributionsUseCase,
  IListPublicCharityCampaignsCommand,
  IListPublicCharityCampaignsUseCase,
  IManageCharityBeneficiaryCommand,
  IManageCharityBeneficiaryResult,
  IManageCharityBeneficiaryUseCase,
  IManageCharityCoordinatorsCommand,
  IManageCharityCoordinatorsResult,
  IManageCharityCoordinatorsUseCase,
  IRecordExternalContributionCommand,
  IRecordExternalContributionUseCase,
  IReplaceCharityMediaCommand,
  IReplaceCharityMediaUseCase,
  IRequestCharityMediaUploadCommand,
  IRequestCharityMediaUploadUseCase,
  IReviewCharityCampaignCommand,
  IReviewCharityCampaignResult,
  IReviewCharityCampaignUseCase,
  ISetCharityCampaignActiveCommand,
  ISetCharityCampaignActiveUseCase,
  ISubmitCharityContributionCommand,
  ISubmitCharityContributionResult,
  ISubmitCharityContributionUseCase,
  IUpdateAdminCharityCampaignCommand,
  IUpdateAdminCharityCampaignUseCase,
  IUpdateCharityContributionCommand,
  IUpdateCharityContributionResult,
  IUpdateCharityContributionUseCase,
  IUpdateCharityProgressCommand,
  IUpdateCharityProgressUseCase,
} from '@/application/contracts/charity-campaign';
import {
  CharityAlreadyRegisteredException,
  CharityApprovalAlreadyDecidedException,
  CharityBeneficiaryConsentRequiredException,
  CharityBeneficiaryNotApplicableException,
  CharityCampaignCreateNotAllowedException,
  CharityCampaignHasActivityException,
  CharityCampaignNotFoundException,
  CharityCancelTooLateException,
  CharityContributionNotEditableException,
  CharityContributionNotFoundException,
  CharityCoordinatorNotAllowedException,
  CharityDeliveryNotFoundException,
  CharityLinesInvalidException,
  CharityMediaInvalidException,
  CharityMediaNotEditableException,
  CharityNeedItemInvalidException,
  CharityNotAcceptingContributionsException,
  CharityNotOrganizerException,
  CharityNotRegisteredException,
  CharityParticipationClosedException,
  CharityReviewDuplicateException,
  CharityReviewNotPermittedException,
  CharityReviewTooEarlyException,
  CharitySelfContributionException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignMediaParams,
  ICharityCampaignRepository,
  ICharityContribution,
  ICharityDelivery,
  ICharityExternalContribution,
  ICloseCampaignResult,
  IEntitlementRepository,
} from '@/domain/ports/repository';
import {
  CharityApprovalStatus,
  CharityCapabilityByType,
  MaxCharityDescriptionLength,
  MaxCharityReviewCommentLength,
  MaxCharityTargetItems,
  MaxCharityTitleLength,
  PublishCharityWithoutReviewCapability,
  canCancelCharityParticipation,
  canEditContribution,
  canReviewCharityCampaign,
  charityCampaignGaps,
  charityMediaShapeGaps,
  charityMediaTypeGaps,
  charityReviewRoleOf,
  isCharityReviewRating,
  normalizeCharitySlug,
  overallNeedProgressPercent,
  slugifyCharityTitle,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  IObjectStorage,
  IStorageUploadResult,
} from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';
import { CharityNotifier } from './charity.notifier';

/**
 * Quyền Admin đọc và quyền Admin ghi.
 *
 * Dùng lại cặp `campaign.*` của F63 thay vì sinh `charity.*` — xem migration
 * `1798400000000` cho lý lẽ và cho cái giá phải trả.
 */
const ReadPermission = 'campaign.read';
const WritePermission = 'campaign.manage';

/** Gắn `isJoined` vào bản ghi repository trả về. */
function toView(
  campaign: ICharityCampaign,
  isJoined: boolean | null,
): ICharityCampaignView {
  return { ...campaign, isJoined };
}

function toPage(
  page: { items: ICharityCampaign[]; total: number },
  isJoined: boolean | null,
): ICharityCampaignPageResult {
  return {
    items: page.items.map((campaign) => toView(campaign, isJoined)),
    total: page.total,
  };
}

/**
 * Đọc và kiểm phần thân chung của một lượt tạo.
 *
 * Tách riêng vì hai đường tạo (thành viên và Admin) chia nhau đúng bộ phép kiểm này, và
 * một bản chép thứ hai là một chỗ để hai đường lệch nhau — đường Admin lỏng hơn đường
 * thành viên là cách tạo ra hoạt động công khai thiếu thông tin.
 */
async function prepareWrite(
  repository: ICharityCampaignRepository,
  input: ICharityCampaignWriteInput,
): Promise<{
  title: string;
  slug: string;
  description: string;
  badgeName: string;
  targetItemsCount: number;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  startTime: Date;
  endTime: Date;
}> {
  const title = (input.title ?? '').trim().slice(0, MaxCharityTitleLength);
  const requested = normalizeCharitySlug(input.slug);
  const slug = requested.length > 0 ? requested : slugifyCharityTitle(title);
  const description = (input.description ?? '')
    .trim()
    .slice(0, MaxCharityDescriptionLength);
  const badgeName = (input.badgeName ?? '').trim();
  const targetItemsCount = input.targetItemsCount ?? 0;
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);

  const gaps = charityCampaignGaps({
    title,
    slug,
    description,
    badgeName,
    startTime,
    endTime,
    targetItemsCount,
  });

  // Toạ độ phải đủ cặp. Một vĩ độ không kinh độ là một điểm không dựng được, và
  // `ST_MakePoint` với `NULL` cho ra `NULL` — tức hoạt động lặng lẽ mất vị trí thay vì
  // người tạo biết mình gửi thiếu.
  const hasLat = input.lat !== undefined && input.lat !== null;
  const hasLng = input.lng !== undefined && input.lng !== null;
  if (hasLat !== hasLng)
    gaps.push('lat và lng phải gửi cùng nhau, hoặc bỏ cả hai');

  if (gaps.length > 0) throw new ValidationFailedException(gaps);

  // Hỏi trước khi ghi để trả một thông báo đọc được, thay vì để `UQ_campaigns_slug` ném
  // 500. Vẫn còn khe hẹp giữa lượt hỏi và lượt ghi — ràng buộc database là lớp cuối, và
  // nó phải là lớp cuối chứ không phải lớp duy nhất.
  if (await repository.slugTaken(slug))
    throw new ValidationFailedException([
      `slug "${slug}" đã có hoạt động khác dùng — đổi tiêu đề hoặc gửi slug riêng`,
    ]);

  return {
    title,
    slug,
    description,
    badgeName,
    targetItemsCount,
    lat: hasLat ? Number(input.lat) : null,
    lng: hasLng ? Number(input.lng) : null,
    locationLabel: input.locationLabel?.trim() || null,
    startTime,
    endTime,
  };
}

/**
 * Xác nhận bộ media và dựng các dòng sẵn sàng ghi.
 *
 * Dùng chung cho đường tạo và đường thay, để hai đường không thể lệch luật. Hình dạng
 * kiểm TRƯỚC khi hỏi R2; loại (ảnh hay video) chỉ biết SAU HeadObject — lấy từ content
 * type thật của object chứ không tin lời khai lúc xin URL.
 */
async function confirmCharityMedia(
  storage: IObjectStorage,
  userId: string,
  keys: readonly string[],
  coverKey: string,
): Promise<{ media: ICharityCampaignMediaParams[]; bannerUrl: string }> {
  const shapeGaps = charityMediaShapeGaps({ keys, coverKey });
  if (shapeGaps.length > 0)
    throw new CharityMediaInvalidException(shapeGaps.join('; '));

  // Tuần tự như luồng bình luận: tối đa 5 lượt, và một key hỏng giữa chừng thì
  // dừng ngay thay vì bắn nốt các lượt còn lại.
  const confirmed: {
    key: string;
    mediaType: 'IMAGE' | 'VIDEO';
    publicUrl: string;
  }[] = [];
  for (const key of keys)
    confirmed.push({
      key,
      ...(await withStorageValidation('media', () =>
        storage.confirmCampaignMediaUpload(userId, key),
      )),
    });

  const typeGaps = charityMediaTypeGaps({ items: confirmed, coverKey });
  if (typeGaps.length > 0)
    throw new CharityMediaInvalidException(typeGaps.join('; '));

  const media = confirmed.map((item, index) => ({
    storageKey: item.key,
    publicUrl: item.publicUrl,
    mediaType: item.mediaType,
    // Thứ tự do SERVER đặt theo thứ tự client gửi, như bảng nhu cầu.
    sortOrder: index,
    isCover: item.key === coverKey,
  }));

  // `charityMediaShapeGaps` đã bảo đảm `coverKey` nằm trong `keys`.
  return { media, bannerUrl: media[keys.indexOf(coverKey)].publicUrl };
}

@Injectable()
export class CreateCharityCampaignUseCase implements ICreateCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: ICreateCharityCampaignCommand,
  ): Promise<ICharityCampaignView> {
    const forOther =
      command.campaignType === 'INDIVIDUAL_APPEAL' &&
      command.beneficiaryRelation === 'OTHER';
    // Thông tin người thụ hưởng chỉ có nghĩa ở kêu gọi cho NGƯỜI KHÁC. Nhận nó ở loại
    // khác là lưu dữ liệu riêng tư của một người không liên quan gì tới hoạt động.
    if (command.beneficiary && !forOther)
      throw new CharityBeneficiaryNotApplicableException();

    let approvalStatus = await this.resolveApprovalStatus(command);
    // §2: kêu gọi cho người khác chưa có đồng ý CONFIRMED thì KHÔNG ra ngoài, kể cả với
    // người có quyền public ngay — quyền đó nói "nội dung của tôi không cần ai đọc
    // trước", không nói "tôi được đăng hoàn cảnh của người khác khi họ chưa đồng ý".
    if (
      forOther &&
      approvalStatus === 'APPROVED' &&
      !command.asAdmin &&
      command.beneficiary?.consentStatus !== 'CONFIRMED'
    )
      approvalStatus = 'PENDING_APPROVAL';
    const prepared = await prepareWrite(this.repository, command);
    // SAU quyền và nội dung: người không được tạo, hoặc gửi hồ sơ thiếu, không tốn
    // lượt gọi R2 nào.
    const { media, bannerUrl } = await confirmCharityMedia(
      this.storage,
      command.actorUserId,
      command.media,
      command.coverKey,
    );

    const campaign = await this.repository.create({
      ...prepared,
      bannerUrl,
      media,
      campaignType: command.campaignType,
      allowOverTarget: command.allowOverTarget ?? false,
      beneficiary: command.beneficiary
        ? {
            fullName: command.beneficiary.fullName.trim(),
            relationNote: command.beneficiary.relationNote.trim(),
            phone: command.beneficiary.phone?.trim() || null,
            address: command.beneficiary.address?.trim() || null,
            consentStatus: command.beneficiary.consentStatus,
            verificationNote:
              command.beneficiary.verificationNote?.trim() || null,
          }
        : null,
      // `null` cho hoạt động có tổ chức, và database canh điều đó bằng một CHECK
      // nối hai cột: hoạt động có tổ chức không có người thụ hưởng đơn lẻ nào để
      // khai quan hệ với.
      beneficiaryRelation:
        command.campaignType === 'INDIVIDUAL_APPEAL'
          ? (command.beneficiaryRelation ?? null)
          : null,
      needs: (command.needs ?? []).map((need, index) => ({
        categoryId: need.categoryId ?? null,
        itemName: need.itemName.trim(),
        description: need.description?.trim() ?? null,
        unit: need.unit.trim(),
        targetQuantity: need.targetQuantity,
        allowAlternative: need.allowAlternative ?? false,
        // Thứ tự do SERVER đặt theo thứ tự client gửi, không nhận `sortOrder` từ
        // client: hai dòng cùng `sortOrder` sẽ hiện theo thứ tự ngẫu nhiên của
        // `id`, và người tạo không có cách nào sửa lại.
        sortOrder: index,
      })),
      createdBy: command.actorUserId,
      approvalStatus,
      // Admin tạo trực tiếp thì chính họ là người duyệt — `CHK_campaigns_approved_at` đòi
      // `approved_at` khác NULL khi trạng thái không còn chờ, nên để trống `approved_by`
      // sẽ cho một hàng đã duyệt mà không ai chịu trách nhiệm.
      approvedBy: approvalStatus === 'APPROVED' ? command.actorUserId : null,
    });

    return toView(campaign, false);
  }

  /**
   * Ai được tạo, và hồ sơ vào trạng thái nào (BR-CHARITY-01).
   *
   * Hai đường, hai phép kiểm khác hẳn nhau: đường Admin hỏi `admin_role_permissions`,
   * đường thành viên hỏi Rank Config. Không đường nào đọc `users.rank` trực tiếp.
   */
  private async resolveApprovalStatus(
    command: ICreateCharityCampaignCommand,
  ): Promise<CharityApprovalStatus> {
    if (command.asAdmin) {
      if (
        !(await this.admin.hasPermission(command.actorUserId, WritePermission))
      )
        throw new ForbiddenException();
      return 'APPROVED';
    }

    // Quyền TẠO khác nhau theo loại (F65b §2): kêu gọi cho cá nhân mở từ Thành
    // viên, còn hoạt động có tổ chức chỉ Kim Cương. Tra bảng chứ không `if` theo
    // rank — Rank là cấu hình động, một phép so rank trong mã là bản sao sẽ trôi.
    const capability = await this.entitlements.getCapability(
      command.actorUserId,
      CharityCapabilityByType[command.campaignType],
    );
    // `null` là KHÔNG cho phép: thiếu hàng trong Rank Config nghĩa là chưa ai quyết định,
    // và mặc định của một quyền chưa quyết định phải là đóng.
    if (!capability?.allowed)
      throw new CharityCampaignCreateNotAllowedException();

    // Quyền PUBLIC NGAY là một câu hỏi khác: "nội dung có cần ai đọc trước khi ra
    // ngoài không". Gộp nó vào quyền tạo là buộc mọi người được tạo cũng được
    // public — và một kêu gọi quyên góp ra ngoài không qua ai đọc là đúng chỗ
    // người ta lợi dụng.
    const publishNow = await this.entitlements.getCapability(
      command.actorUserId,
      PublishCharityWithoutReviewCapability,
    );

    return publishNow?.allowed ? 'APPROVED' : 'PENDING_APPROVAL';
  }
}

/**
 * Xin URL tải lên cho media hoạt động.
 *
 * KHÔNG kiểm quyền tạo hoạt động ở đây: xin URL không tạo ra gì, và quyền vẫn bị kiểm
 * ở lượt tạo. Object không bao giờ được gắn thì job dọn rác xoá sau 24 giờ.
 */
@Injectable()
export class RequestCharityMediaUploadUseCase implements IRequestCharityMediaUploadUseCase {
  public constructor(
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestCharityMediaUploadCommand,
  ): Promise<IStorageUploadResult> {
    return withStorageValidation('upload', () =>
      this.storage.createCampaignMediaUpload({
        userId: command.userId,
        contentType: command.contentType,
        contentLength: command.contentLength,
      }),
    );
  }
}

/**
 * Thay cả bộ media của hồ sơ CHỜ DUYỆT (spec D4, D5).
 *
 * Kiểm người tạo và trạng thái TRƯỚC khi gọi R2 để trả lỗi rõ cho người gọi sai; rồi
 * repository kiểm LẠI dưới khoá dòng, vì Admin có thể duyệt chen giữa hai lượt.
 * Coordinator không sửa được: §2 cho họ điều phối, không cho đổi nội dung đã gửi duyệt.
 */
@Injectable()
export class ReplaceCharityMediaUseCase implements IReplaceCharityMediaUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IReplaceCharityMediaCommand,
  ): Promise<ICharityCampaignView> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    if (campaign.createdBy !== command.actorUserId)
      throw new CharityNotOrganizerException();
    if (campaign.approvalStatus !== 'PENDING_APPROVAL')
      throw new CharityMediaNotEditableException();

    const { media, bannerUrl } = await confirmCharityMedia(
      this.storage,
      command.actorUserId,
      command.media,
      command.coverKey,
    );

    return toView(
      await this.repository.replaceMedia({
        campaignId: command.campaignId,
        actorUserId: command.actorUserId,
        media,
        bannerUrl,
      }),
      // Cùng giá trị với lượt tạo: người gọi là chính người tạo, và hồ sơ chờ duyệt thì
      // chưa ai đăng ký tham gia được — `null` dành cho đường công khai không biết ai gọi.
      false,
    );
  }
}

@Injectable()
export class ListPublicCharityCampaignsUseCase implements IListPublicCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListPublicCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // `isJoined: null` chứ không `false` — đường này công khai, không có ai để hỏi.
    return toPage(await this.repository.listPublic(command), null);
  }
}

@Injectable()
export class GetPublicCharityCampaignUseCase implements IGetPublicCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IGetPublicCharityCampaignCommand,
  ): Promise<IGetPublicCharityCampaignResult> {
    const campaign = await this.repository.findPublicByIdOrSlug(
      command.idOrSlug,
    );
    if (!campaign) throw new CharityCampaignNotFoundException();

    const reviews = await this.repository.listReviews({
      campaignId: campaign.globalId,
      limit: 20,
      offset: 0,
    });

    return {
      campaign: toView(campaign, null),
      reviews: reviews.items,
      reviewTotal: reviews.total,
    };
  }
}

/**
 * Bảng nhu cầu vật phẩm và tiến độ từng dòng (F65b §3).
 *
 * **Công khai**, cùng đường đọc với `GET /campaigns/:idOrSlug` — nên nó chỉ thấy
 * chiến dịch đã duyệt và còn bật. Chủ sở hữu muốn xem bảng nhu cầu của hồ sơ đang
 * chờ duyệt thì đi đường `GET /charity-campaigns/mine`, nơi đã có phép kiểm chủ sở
 * hữu; nhân đôi phép kiểm đó ở đây là nhân đôi một chỗ dễ lệch.
 *
 * **`progressSource` trả về chứ không để client đoán** (§10). Chiến dịch chưa khai
 * dòng nhu cầu nào vẫn còn hai cột tổng hợp cũ, và chúng là LỜI KHAI của người tổ
 * chức (BR-CHARITY-02) — client phải biết con số nó đang vẽ đến từ đâu. Đoán theo
 * "mảng `needs` rỗng hay không" sẽ sai ngay khi có chiến dịch khai nhu cầu rồi tắt
 * hết các dòng.
 */
@Injectable()
export class GetCampaignNeedsUseCase implements IGetCampaignNeedsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IGetCampaignNeedsCommand,
  ): Promise<IGetCampaignNeedsResult> {
    const campaign = await this.repository.findPublicByIdOrSlug(
      command.idOrSlug,
    );
    if (!campaign) throw new CharityCampaignNotFoundException();

    return needsViewOf(this.repository, campaign.globalId);
  }
}

/** Bảng nhu cầu của một chiến dịch — chung cho đường công khai và đường Admin. */
async function needsViewOf(
  repository: ICharityCampaignRepository,
  campaignId: string,
): Promise<IGetCampaignNeedsResult> {
  const needs = await repository.listNeeds(campaignId);
  // Chỉ dòng ĐANG BẬT vào phép tính tiến độ: một dòng đã tắt là nhu cầu người tổ
  // chức rút lại, và để nó kéo tiến độ xuống là báo cáo một việc không còn ai cần.
  // Nhưng vẫn TRẢ cả dòng đã tắt, vì nó là lịch sử của những đề nghị đã gửi.
  const active = needs.filter((need) => need.isActive);

  return {
    campaignId,
    needs,
    overallProgressPercent: overallNeedProgressPercent(active),
    progressSource: needs.length > 0 ? 'NEED_ITEMS' : 'LEGACY_DECLARED',
  };
}

/**
 * Bảng nhu cầu cho CMS, MỌI trạng thái duyệt.
 *
 * Danh sách vật phẩm là phần chính của hồ sơ xin duyệt: Admin phải thấy nó TRƯỚC
 * khi bấm duyệt, mà đường công khai chỉ trả chiến dịch đã duyệt.
 */
@Injectable()
export class GetAdminCampaignNeedsUseCase implements IGetAdminCampaignNeedsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminCampaignNeedsCommand,
  ): Promise<IGetCampaignNeedsResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    return needsViewOf(this.repository, campaign.globalId);
  }
}

/**
 * Chiến dịch có đang nhận đề nghị không (F65b §8).
 *
 * Đọc CẢ BA thứ, không suy từ một cột: `approval_status = 'APPROVED'` nói đã duyệt,
 * `is_active` nói còn mở, và `end_time` phân biệt *đã đóng* với *đang đình chỉ*.
 * Bảng ánh xạ §8 nói thẳng là `ACTIVE`/`SUSPENDED`/`CLOSED` không bao giờ được ghi
 * vào `approval_status` — CHECK ở database từ chối chúng.
 */
function acceptsContributions(campaign: ICharityCampaign): boolean {
  return (
    campaign.approvalStatus === 'APPROVED' &&
    campaign.isActive &&
    campaign.endTime.getTime() > Date.now()
  );
}

@Injectable()
export class SubmitCharityContributionUseCase implements ISubmitCharityContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    private readonly notifier: CharityNotifier,
  ) {}

  public async handle(
    command: ISubmitCharityContributionCommand,
  ): Promise<ISubmitCharityContributionResult> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    // Chiến dịch chưa duyệt nhận cùng câu trả lời với chiến dịch không tồn tại:
    // phân biệt hai cái là cho người ngoài dò được hồ sơ đang chờ kiểm duyệt.
    if (!campaign || campaign.approvalStatus !== 'APPROVED')
      throw new CharityCampaignNotFoundException();
    if (!acceptsContributions(campaign))
      throw new CharityNotAcceptingContributionsException();
    // Người tổ chức không tặng vào chính hoạt động của mình. Chặn ở ĐÂY chứ không đợi
    // lượt quyết: tới đó `CHK_campaign_deliveries_not_self` mới bắt, và người dùng
    // nhận một lỗi 500 cho một đề nghị hệ thống đã nhận từ trước.
    // Người điều phối — người tổ chức hoặc coordinator — không tặng vào hoạt động
    // mình điều phối: họ sẽ tự xét đề nghị của chính mình.
    if (
      campaign.createdBy === command.contributorId ||
      (await this.repository.isCampaignManager(
        campaign.globalId,
        command.contributorId,
      ))
    )
      throw new CharitySelfContributionException();

    // Mọi dòng phải thuộc ĐÚNG chiến dịch này và còn bật. Thiếu phép kiểm này thì
    // một `needItemId` của chiến dịch khác vẫn ghi được, và tiến độ của chiến dịch
    // kia nhận một đề nghị không ai gửi cho nó.
    const needs = await this.repository.listNeeds(campaign.globalId);
    const open = new Set(
      needs.filter((need) => need.isActive).map((need) => need.globalId),
    );
    const requested = command.items.map((item) => item.needItemId);
    if (requested.some((id) => !open.has(id)))
      throw new CharityNeedItemInvalidException();
    // Hai dòng cùng trỏ một nhu cầu: database có UNIQUE chặn, nhưng chặn ở đây cho
    // ra thông báo đọc được thay vì một lỗi ràng buộc 500.
    if (new Set(requested).size !== requested.length)
      throw new CharityNeedItemInvalidException();

    const contribution = await this.repository.createContribution({
      campaignId: campaign.globalId,
      contributorId: command.contributorId,
      note: command.note?.trim() ?? null,
      contactNote: command.contactNote?.trim() ?? null,
      items: command.items.map((item) => ({
        needItemId: item.needItemId,
        offeredQuantity: item.offeredQuantity,
        conditionNote: item.conditionNote?.trim() ?? null,
      })),
    });

    await this.notifier.contributionSubmitted({
      organizerId: campaign.createdBy,
      campaignTitle: campaign.title,
      contribution,
    });
    return contribution;
  }
}

@Injectable()
export class ListCampaignContributionsUseCase implements IListCampaignContributionsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListCampaignContributionsCommand,
  ): Promise<IListCampaignContributionsResult> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    // Danh sách này chứa `contactNote` của người tặng — cách liên lạc họ khai cho
    // lượt giao nhận. Chỉ người tổ chức đọc được; §9 nói response công khai không
    // trả contact.
    if (
      !(await this.repository.isCampaignManager(
        campaign.globalId,
        command.actorUserId,
      ))
    )
      throw new CharityNotOrganizerException();

    return this.repository.listContributionsByCampaign({
      campaignId: campaign.globalId,
      status: command.status,
      limit: command.limit,
      offset: command.offset,
    });
  }
}

@Injectable()
export class ListMyContributionsUseCase implements IListMyContributionsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListMyContributionsCommand,
  ): Promise<IListMyContributionsResult> {
    return this.repository.listContributionsByContributor({
      contributorId: command.contributorId,
      limit: command.limit,
      offset: command.offset,
    });
  }
}

/**
 * Sửa hoặc rút đề nghị, chỉ khi CHƯA có phần nào được chấp nhận (F65b §4).
 *
 * Phép kiểm trạng thái có ở HAI chỗ và cả hai đều cần: ở đây để ra thông báo đọc
 * được, và trong câu `UPDATE` của repository để chặn hai lượt sửa song song — hai
 * request đều đọc thấy `PENDING_REVIEW` rồi cùng ghi thì chỉ database thấy cái thứ
 * hai.
 */
@Injectable()
export class UpdateCharityContributionUseCase implements IUpdateCharityContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IUpdateCharityContributionCommand,
  ): Promise<IUpdateCharityContributionResult> {
    const existing = await this.repository.findContributionByGlobalId(
      command.contributionId,
    );
    // Đề nghị của người khác nhận cùng câu trả lời với đề nghị không tồn tại.
    if (!existing || existing.contributorId !== command.contributorId)
      throw new CharityContributionNotFoundException();
    if (!canEditContribution(existing.status))
      throw new CharityContributionNotEditableException();

    if (command.action === 'WITHDRAW') {
      const withdrawn = await this.repository.withdrawContribution({
        contributionId: command.contributionId,
        contributorId: command.contributorId,
      });
      if (!withdrawn) throw new CharityContributionNotEditableException();
      return withdrawn;
    }

    const items = command.items ?? [];
    if (items.length === 0) throw new CharityNeedItemInvalidException();

    // Dòng nhu cầu vẫn phải thuộc đúng chiến dịch và còn bật — người tổ chức có
    // thể đã rút một dòng sau khi đề nghị được gửi.
    const needs = await this.repository.listNeeds(existing.campaignId);
    const open = new Set(
      needs.filter((need) => need.isActive).map((need) => need.globalId),
    );
    const requested = items.map((item) => item.needItemId);
    if (
      requested.some((id) => !open.has(id)) ||
      new Set(requested).size !== requested.length
    )
      throw new CharityNeedItemInvalidException();

    const replaced = await this.repository.replaceContribution({
      contributionId: command.contributionId,
      contributorId: command.contributorId,
      note: command.note?.trim() ?? null,
      contactNote: command.contactNote?.trim() ?? null,
      items: items.map((item) => ({
        needItemId: item.needItemId,
        offeredQuantity: item.offeredQuantity,
        conditionNote: item.conditionNote?.trim() ?? null,
      })),
    });
    if (!replaced) throw new CharityContributionNotEditableException();
    return replaced;
  }
}

/**
 * Người tổ chức quyết mọi dòng của một đề nghị (F65b §5).
 *
 * Mỏng có chủ ý: mọi luật — quyền người tổ chức, khoá theo thứ tự cố định, chống vượt
 * nhu cầu, chống trùng — nằm TRONG transaction của repository. Đặt phép kiểm quyền ở
 * đây, ngoài transaction, là kiểm trên một bản đọc có thể đã cũ khi transaction mở.
 */
@Injectable()
export class DecideCharityContributionUseCase implements IDecideCharityContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    private readonly notifier: CharityNotifier,
  ) {}

  public async handle(
    command: IDecideCharityContributionCommand,
  ): Promise<IDecideCharityContributionResult> {
    const result = await this.repository.decideContribution({
      contributionId: command.contributionId,
      organizerId: command.organizerId,
      decisionKey: command.decisionKey,
      decisions: command.decisions,
    });

    // Retry cùng khoá KHÔNG báo lại: người tặng đã nhận thông báo ở lượt đầu, và
    // khoá chống trùng của thông báo cũng chặn — nhưng không gọi thì khỏi một lượt
    // đọc chiến dịch vô ích.
    if (!result.replayed) {
      const campaign = await this.repository.findByGlobalId(
        result.contribution.campaignId,
      );
      await this.notifier.contributionDecided({
        campaignTitle: campaign?.title ?? 'hoạt động từ thiện',
        contribution: result.contribution,
      });
    }
    return result;
  }
}

@Injectable()
export class CompleteCharityDeliveryUseCase implements ICompleteCharityDeliveryUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    private readonly notifier: CharityNotifier,
  ) {}

  public async handle(
    command: ICompleteCharityDeliveryCommand,
  ): Promise<ICharityDelivery> {
    const delivery = await this.repository.completeDelivery(command);
    const campaign = await this.repository.findByGlobalId(delivery.campaignId);
    await this.notifier.deliveryCompleted({
      campaignTitle: campaign?.title ?? 'hoạt động từ thiện',
      delivery,
    });
    return delivery;
  }
}

@Injectable()
export class CancelCharityDeliveryUseCase implements ICancelCharityDeliveryUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    private readonly notifier: CharityNotifier,
  ) {}

  public async handle(
    command: ICancelCharityDeliveryCommand,
  ): Promise<ICharityDelivery> {
    // Lý do bắt buộc và không được là khoảng trắng: `CHK_campaign_deliveries_cancelled`
    // đòi nó, và một lượt huỷ không lý do là một lượt không ai đối soát được.
    const reason = command.reason.trim();
    if (!reason)
      throw new CharityLinesInvalidException(
        'Huỷ lượt giao nhận phải có lý do',
      );

    const delivery = await this.repository.cancelDelivery({
      deliveryId: command.deliveryId,
      actorUserId: command.actorUserId,
      reason,
    });
    const campaign = await this.repository.findByGlobalId(delivery.campaignId);
    await this.notifier.deliveryCancelled({
      campaignTitle: campaign?.title ?? 'hoạt động từ thiện',
      delivery,
      cancelledBy: command.actorUserId,
    });
    return delivery;
  }
}

@Injectable()
export class GetCharityDeliveryUseCase implements IGetCharityDeliveryUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IGetCharityDeliveryCommand,
  ): Promise<ICharityDelivery> {
    const delivery = await this.repository.findDeliveryByGlobalId(
      command.deliveryId,
    );
    // Chỉ hai bên đọc được. Người ngoài nhận cùng lỗi với lượt không tồn tại —
    // phân biệt hai cái là để lộ ai đang giao nhận với ai.
    if (!delivery) throw new CharityDeliveryNotFoundException();
    const allowed =
      delivery.contributorId === command.viewerUserId ||
      (await this.repository.isCampaignManager(
        delivery.campaignId,
        command.viewerUserId,
      ));
    if (!allowed) throw new CharityDeliveryNotFoundException();
    return delivery;
  }
}

/**
 * Một lượt đóng góp — đích của thông báo `CHARITY_CONTRIBUTION_*`.
 *
 * Cùng luật đọc với lượt giao nhận: người đóng góp và người điều phối hoạt động.
 * Người ngoài nhận cùng lỗi với lượt không tồn tại — phân biệt hai cái là để lộ ai
 * đang đóng góp cho hoạt động nào.
 */
@Injectable()
export class GetCharityContributionUseCase implements IGetCharityContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IGetCharityContributionCommand,
  ): Promise<ICharityContribution> {
    const contribution = await this.repository.findContributionByGlobalId(
      command.contributionId,
    );
    if (!contribution) throw new CharityContributionNotFoundException();
    const allowed =
      contribution.contributorId === command.viewerUserId ||
      (await this.repository.isCampaignManager(
        contribution.campaignId,
        command.viewerUserId,
      ));
    if (!allowed) throw new CharityContributionNotFoundException();
    return contribution;
  }
}

@Injectable()
export class RecordExternalContributionUseCase implements IRecordExternalContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IRecordExternalContributionCommand,
  ): Promise<ICharityExternalContribution> {
    const receivedAt = new Date(command.receivedAt);
    // Ngày nhận ở TƯƠNG LAI là ghi nhận một thứ chưa về kho. Tiến độ công khai chỉ
    // được tăng theo vật phẩm đã nhận thật (§3).
    if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now())
      throw new CharityLinesInvalidException(
        'Ngày nhận phải là một mốc trong quá khứ',
      );

    return this.repository.recordExternalContribution({
      campaignId: command.campaignId,
      recordedBy: command.recordedBy,
      needItemId: command.needItemId,
      quantity: command.quantity,
      sourceLabel: command.sourceLabel.trim(),
      receivedAt,
      evidenceNote: command.evidenceNote?.trim() ?? null,
    });
  }
}

/**
 * Huỷ hoặc điều chỉnh một bản ghi ngoài app, luôn kèm lý do (§7).
 *
 * Điều chỉnh mà số lượng không đổi bị từ chối: đó là một lượt ghi lịch sử không nói
 * gì, và nó đẩy bản ghi thật ra sau một chuỗi `replacesId` dài hơn cho không lý do.
 */
@Injectable()
export class AmendExternalContributionUseCase implements IAmendExternalContributionUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IAmendExternalContributionCommand,
  ): Promise<ICharityExternalContribution> {
    const reason = command.reason.trim();
    if (!reason)
      throw new CharityLinesInvalidException(
        'Huỷ hay điều chỉnh bản ghi ngoài app phải có lý do',
      );
    if (command.action === 'ADJUST') {
      if (command.quantity === undefined || command.quantity <= 0)
        throw new CharityLinesInvalidException(
          'Điều chỉnh phải có số lượng mới lớn hơn 0 — muốn về 0 thì huỷ bản ghi',
        );
    }

    return this.repository.amendExternalContribution({
      externalId: command.externalId,
      actorUserId: command.actorUserId,
      action: command.action,
      reason,
      quantity: command.quantity,
    });
  }
}

@Injectable()
export class ListExternalContributionsUseCase implements IListExternalContributionsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListExternalContributionsCommand,
  ): Promise<{ items: ICharityExternalContribution[] }> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    if (
      !(await this.repository.isCampaignManager(
        campaign.globalId,
        command.actorUserId,
      ))
    )
      throw new CharityNotOrganizerException();
    return {
      items: await this.repository.listExternalContributions(campaign.globalId),
    };
  }
}

/**
 * Đóng chiến dịch (§8) — người tổ chức, hoặc Admin có `campaign.manage`.
 *
 * Kiểm quyền ở đây, ngoài transaction, là an toàn vì `created_by` không bao giờ đổi
 * sau lúc tạo. Phần cần khoá — trạng thái chiến dịch và hàng đợi đề nghị — nằm trong
 * transaction của repository.
 */
@Injectable()
export class CloseCharityCampaignUseCase implements ICloseCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    private readonly notifier: CharityNotifier,
  ) {}

  public async handle(
    command: ICloseCharityCampaignCommand,
  ): Promise<ICloseCampaignResult> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    const isOrganizer = campaign.createdBy === command.actorUserId;
    if (
      !isOrganizer &&
      !(await this.admin.hasPermission(command.actorUserId, WritePermission))
    )
      throw new CharityNotOrganizerException();

    const result = await this.repository.closeCampaign({
      campaignId: campaign.globalId,
      actorUserId: command.actorUserId,
    });
    for (const rejected of result.rejected)
      await this.notifier.contributionDecided({
        campaignTitle: campaign.title,
        contribution: {
          globalId: rejected.contributionId,
          campaignId: campaign.globalId,
          contributorId: rejected.contributorId,
          status: 'REJECTED',
        },
        byClosing: true,
      });
    return result;
  }
}

/**
 * Gia hạn chiến dịch đang mở (§8) — người tổ chức hoặc Admin có `campaign.manage`,
 * cùng quyền với đường đóng.
 */
@Injectable()
export class ExtendCharityCampaignUseCase implements IExtendCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IExtendCharityCampaignCommand,
  ): Promise<{ campaignId: string; previousEndTime: Date; newEndTime: Date }> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    if (
      campaign.createdBy !== command.actorUserId &&
      !(await this.admin.hasPermission(command.actorUserId, WritePermission))
    )
      throw new CharityNotOrganizerException();

    const reason = command.reason.trim();
    const newEndTime = new Date(command.endTime);
    if (!reason || Number.isNaN(newEndTime.getTime()))
      throw new CharityLinesInvalidException(
        'Gia hạn phải có mốc kết thúc hợp lệ và lý do',
      );

    return this.repository.extendCampaign({
      campaignId: campaign.globalId,
      actorUserId: command.actorUserId,
      newEndTime,
      reason,
    });
  }
}

/**
 * Giao, thu và đọc coordinator (F65b §2). Giao/thu: CHỈ người tổ chức — để coordinator
 * tự giao quyền cho người khác là chuyển quyền chủ sở hữu từng bước.
 */
@Injectable()
export class ManageCharityCoordinatorsUseCase implements IManageCharityCoordinatorsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IManageCharityCoordinatorsCommand,
  ): Promise<IManageCharityCoordinatorsResult> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    if (command.action === 'LIST') {
      if (
        !(await this.repository.isCampaignManager(
          campaign.globalId,
          command.actorUserId,
        ))
      )
        throw new CharityNotOrganizerException();
    } else {
      if (campaign.createdBy !== command.actorUserId)
        throw new CharityNotOrganizerException();
      if (campaign.campaignType !== 'ORGANIZED_CAMPAIGN')
        throw new CharityCoordinatorNotAllowedException();
      const target = command.userId as string;
      if (target === command.actorUserId)
        throw new CharityCoordinatorNotAllowedException();

      if (command.action === 'GRANT')
        await this.repository.grantCoordinator({
          campaignId: campaign.globalId,
          userId: target,
          grantedBy: command.actorUserId,
        });
      else
        await this.repository.revokeCoordinator({
          campaignId: campaign.globalId,
          userId: target,
          revokedBy: command.actorUserId,
        });
    }

    return {
      coordinators: await this.repository.listCoordinators(campaign.globalId),
    };
  }
}

/**
 * Đọc và ghi thông tin người thụ hưởng (F65b §2).
 *
 * ĐỌC: người tổ chức, hoặc Admin có `campaign.manage` (để xác minh trước khi duyệt).
 * Coordinator KHÔNG — kêu gọi cá nhân không có coordinator, và kể cả có thì địa chỉ của
 * người được giúp không phải thứ cần để điều phối vật phẩm.
 * GHI: chỉ người tổ chức.
 */
@Injectable()
export class ManageCharityBeneficiaryUseCase implements IManageCharityBeneficiaryUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IManageCharityBeneficiaryCommand,
  ): Promise<IManageCharityBeneficiaryResult> {
    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    if (
      campaign.campaignType !== 'INDIVIDUAL_APPEAL' ||
      campaign.beneficiaryRelation !== 'OTHER'
    )
      throw new CharityBeneficiaryNotApplicableException();

    const isOrganizer = campaign.createdBy === command.actorUserId;

    if (!command.beneficiary) {
      if (
        !isOrganizer &&
        !(await this.admin.hasPermission(command.actorUserId, WritePermission))
      )
        throw new CharityNotOrganizerException();
      return {
        beneficiary: await this.repository.findBeneficiary(campaign.globalId),
        hidden: false,
      };
    }

    if (!isOrganizer) throw new CharityNotOrganizerException();
    return this.repository.upsertBeneficiary({
      campaignId: campaign.globalId,
      actorUserId: command.actorUserId,
      beneficiary: {
        fullName: command.beneficiary.fullName.trim(),
        relationNote: command.beneficiary.relationNote.trim(),
        phone: command.beneficiary.phone?.trim() || null,
        address: command.beneficiary.address?.trim() || null,
        consentStatus: command.beneficiary.consentStatus,
        verificationNote: command.beneficiary.verificationNote?.trim() || null,
      },
    });
  }
}

@Injectable()
export class ListMyCharityCampaignsUseCase implements IListMyCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListMyCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // Đường DUY NHẤT để người tạo thấy hồ sơ còn chờ duyệt hoặc bị từ chối của mình —
    // `findPublicByIdOrSlug` cố tình không trả chúng, kể cả cho chủ hồ sơ.
    return toPage(
      await this.repository.listByCreator({
        userId: command.actorUserId,
        limit: command.limit,
        offset: command.offset,
      }),
      null,
    );
  }
}

@Injectable()
export class ListJoinedCharityCampaignsUseCase implements IListJoinedCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListMyCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    // `isJoined: true` cho cả trang — mọi hàng ở đây đều là hoạt động người gọi đang
    // đăng ký, do chính điều kiện JOIN quyết định.
    return toPage(
      await this.repository.listJoinedByUser({
        userId: command.actorUserId,
        limit: command.limit,
        offset: command.offset,
      }),
      true,
    );
  }
}

/** Phép kiểm chung: hoạt động phải đang hiện ra ngoài mới nhận được tương tác. */
async function loadPublicCampaign(
  repository: ICharityCampaignRepository,
  campaignId: string,
): Promise<ICharityCampaign> {
  const campaign = await repository.findByGlobalId(campaignId);
  // Hồ sơ chưa duyệt trả 404 chứ không 403: nó chưa công khai, nên sự TỒN TẠI của nó cũng
  // chưa công khai.
  if (!campaign || campaign.approvalStatus !== 'APPROVED')
    throw new CharityCampaignNotFoundException();
  return campaign;
}

@Injectable()
export class JoinCharityCampaignUseCase implements IJoinCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IJoinCharityCampaignCommand,
  ): Promise<IJoinCharityCampaignResult> {
    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    // Đóng theo `end_time`, KHÔNG theo `start_time`: một hoạt động trao quà kéo dài cả
    // ngày vẫn nhận người đến giữa buổi, và BR-CHARITY-03 chỉ gắn `start_time` vào lượt
    // HUỶ. Chặn ở `start_time` là tự thêm một luật đặc tả không nêu.
    if (!campaign.isActive || campaign.endTime.getTime() <= Date.now())
      throw new CharityParticipationClosedException();

    const { created } = await this.repository.register({
      campaignId: campaign.globalId,
      userId: command.actorUserId,
    });
    if (!created) throw new CharityAlreadyRegisteredException();

    // Đọc lại để `participantCount` trả về đã tính cả lượt vừa rồi. Cộng tay vào bản ghi
    // cũ sẽ ra số sai ngay khi có người khác đăng ký song song.
    const refreshed = await this.repository.findByGlobalId(campaign.globalId);
    return { campaign: toView(refreshed ?? campaign, true) };
  }
}

@Injectable()
export class CancelCharityParticipationUseCase implements ICancelCharityParticipationUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IJoinCharityCampaignCommand,
  ): Promise<IJoinCharityCampaignResult> {
    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    const status = await this.repository.findParticipationStatus({
      campaignId: campaign.globalId,
      userId: command.actorUserId,
    });
    if (status !== 'REGISTERED') throw new CharityNotRegisteredException();

    // BR-CHARITY-03: chỉ huỷ được khi CHƯA bắt đầu. Người tổ chức chốt số suất theo danh
    // sách đăng ký trước giờ khai mạc, nên một lượt huỷ giữa buổi không trả lại được gì.
    if (
      !canCancelCharityParticipation({
        startTime: campaign.startTime,
        now: new Date(),
      })
    )
      throw new CharityCancelTooLateException();

    if (
      !(await this.repository.cancelParticipation({
        campaignId: campaign.globalId,
        userId: command.actorUserId,
      }))
    )
      // Tới đây mà không huỷ được nghĩa là có lượt huỷ khác chen vào giữa lượt đọc và lượt
      // ghi. Vẫn báo "chưa đăng ký" — đó đúng là trạng thái hiện tại của họ.
      throw new CharityNotRegisteredException();

    const refreshed = await this.repository.findByGlobalId(campaign.globalId);
    return { campaign: toView(refreshed ?? campaign, false) };
  }
}

@Injectable()
export class ReviewCharityCampaignUseCase implements IReviewCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IReviewCharityCampaignCommand,
  ): Promise<IReviewCharityCampaignResult> {
    if (!isCharityReviewRating(command.rating))
      throw new ValidationFailedException([
        'rating phải là số nguyên từ 1 tới 5',
      ]);

    const campaign = await loadPublicCampaign(
      this.repository,
      command.campaignId,
    );

    // BR-CHARITY-03: đánh giá SAU khi kết thúc. Trước đó thì không ai có gì để đánh giá.
    if (
      !canReviewCharityCampaign({ endTime: campaign.endTime, now: new Date() })
    )
      throw new CharityReviewTooEarlyException();

    const participantIds = await this.repository.listRegisteredUserIds(
      campaign.globalId,
    );
    const role = charityReviewRoleOf({
      organizerId: campaign.createdBy,
      participantIds,
      actorId: command.actorUserId,
    });
    if (!role) throw new CharityReviewNotPermittedException();

    // Hai chiều, và CHỈ hai chiều đó: người tổ chức chấm người tham gia, người tham gia
    // chấm người tổ chức. Thiếu phép kiểm này thì hai người tham gia chấm nhau được —
    // biến một hoạt động thiện nguyện thành chỗ để hai người lạ hạ điểm nhau.
    const allowed =
      role === 'ORGANIZER'
        ? participantIds.includes(command.revieweeId)
        : campaign.createdBy === command.revieweeId;
    if (!allowed) throw new CharityReviewNotPermittedException();

    if (
      await this.repository.reviewExists({
        campaignId: campaign.globalId,
        reviewerId: command.actorUserId,
        revieweeId: command.revieweeId,
      })
    )
      throw new CharityReviewDuplicateException();

    const review = await this.repository.createReview({
      campaignId: campaign.globalId,
      reviewerId: command.actorUserId,
      revieweeId: command.revieweeId,
      reviewerRole: role,
      rating: command.rating,
      comment:
        command.comment?.trim().slice(0, MaxCharityReviewCommentLength) || null,
    });

    return { review };
  }
}

@Injectable()
export class UpdateCharityProgressUseCase implements IUpdateCharityProgressUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateCharityProgressCommand,
  ): Promise<ICharityCampaignView> {
    if (
      !Number.isInteger(command.currentItemsCount) ||
      command.currentItemsCount < 0 ||
      command.currentItemsCount > MaxCharityTargetItems
    )
      throw new ValidationFailedException([
        `currentItemsCount phải là số nguyên từ 0 tới ${MaxCharityTargetItems}`,
      ]);

    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    if (command.asAdmin) {
      if (
        !(await this.admin.hasPermission(command.actorUserId, WritePermission))
      )
        throw new ForbiddenException();
    } else if (campaign.createdBy !== command.actorUserId) {
      throw new CharityNotOrganizerException();
    }

    // BR-CHARITY-02: con số này là LỜI KHAI. Không câu nào ở đây đối chiếu nó với
    // `gift_transactions`, và cố ý như vậy — xem docblock đầu `models/charity-campaign.ts`.
    const updated = await this.repository.updateProgress({
      campaignId: campaign.globalId,
      currentItemsCount: command.currentItemsCount,
    });
    if (!updated) throw new CharityCampaignNotFoundException();

    return toView(updated, null);
  }
}

@Injectable()
export class ListAdminCharityCampaignsUseCase implements IListAdminCharityCampaignsUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminCharityCampaignsCommand,
  ): Promise<ICharityCampaignPageResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    return toPage(
      await this.repository.listForAdmin({
        limit: command.limit,
        offset: command.offset,
        approvalStatus: command.approvalStatus,
      }),
      null,
    );
  }
}

/**
 * Một hoạt động cho CMS, MỌI trạng thái duyệt (CMS A4).
 *
 * Đường công khai `GET /campaigns/:idOrSlug` chỉ thấy hồ sơ đã duyệt, nên Admin mở
 * một hồ sơ chờ duyệt từ hàng đợi không có chỗ nào đọc nó. Người thụ hưởng KHÔNG
 * trả ở đây — dữ liệu riêng tư đó có đường riêng `GET /charity-campaigns/:id/beneficiary`.
 */
@Injectable()
export class GetAdminCharityCampaignUseCase implements IGetAdminCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminCharityCampaignCommand,
  ): Promise<IGetAdminCharityCampaignResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    return { campaign: toView(campaign, null) };
  }
}

@Injectable()
export class DecideCharityApprovalUseCase implements IDecideCharityApprovalUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDecideCharityApprovalCommand,
  ): Promise<ICharityCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const campaign = await this.repository.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();

    // §2: duyệt một kêu gọi cho NGƯỜI KHÁC đòi đồng ý `CONFIRMED`. Admin đọc được
    // thông tin người thụ hưởng ở `GET .../beneficiary` để tự xác minh trước khi bấm.
    if (
      command.approve &&
      campaign.campaignType === 'INDIVIDUAL_APPEAL' &&
      campaign.beneficiaryRelation === 'OTHER' &&
      (await this.repository.findBeneficiary(campaign.globalId))
        ?.consentStatus !== 'CONFIRMED'
    )
      throw new CharityBeneficiaryConsentRequiredException();

    const decided = await this.repository.decideApproval({
      campaignId: command.campaignId,
      approverId: command.actorUserId,
      approve: command.approve,
      note: command.note?.trim() || null,
    });
    // Hồ sơ tồn tại nhưng `UPDATE` không khớp hàng nào nghĩa là nó không còn
    // `PENDING_APPROVAL` — tức một Admin khác đã xử lý. Người sau phải thấy xung đột, chứ
    // không phải ghi đè quyết định người trước.
    if (!decided) throw new CharityApprovalAlreadyDecidedException();

    return toView(decided, null);
  }
}

@Injectable()
export class SetCharityCampaignActiveUseCase implements ISetCharityCampaignActiveUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetCharityCampaignActiveCommand,
  ): Promise<ICharityCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.setActive({
      campaignId: command.campaignId,
      isActive: command.isActive,
    });
    if (!updated) throw new CharityCampaignNotFoundException();

    return toView(updated, null);
  }
}

/**
 * Xoá MỀM một hoạt động từ thiện (CMS).
 *
 * Chỉ khi CHƯA có ai đăng ký, đóng góp, giao nhận hay đánh giá — đúng ca "tạo nhầm",
 * "trùng hồ sơ", "spam". Hoạt động đã có người tham gia thì đóng (`/close`) hoặc tắt
 * (`/active`), vì xoá là làm mất lịch sử của họ ở mọi màn. Quyền `campaign.manage`,
 * lý do bắt buộc, audit giữ bản ghi trước khi xoá.
 */
@Injectable()
export class DeleteCharityCampaignUseCase implements IDeleteCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDeleteCharityCampaignCommand,
  ): Promise<{ campaignId: string }> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const before = await this.repository.findByGlobalId(command.campaignId);
    if (!before) throw new CharityCampaignNotFoundException();

    const outcome = await this.repository.softDeleteIfUnused(
      command.campaignId,
    );
    if (outcome === 'NOT_FOUND') throw new CharityCampaignNotFoundException();
    if (outcome === 'HAS_ACTIVITY')
      throw new CharityCampaignHasActivityException();

    await this.admin.appendAudit({
      actorUserId: command.actorUserId,
      action: 'DELETE_CHARITY_CAMPAIGN',
      resourceType: 'CHARITY_CAMPAIGN',
      resourceId: command.campaignId,
      before: {
        title: before.title,
        slug: before.slug,
        approvalStatus: before.approvalStatus,
        isActive: before.isActive,
        createdBy: before.createdBy,
      },
      after: { deleted: true },
      reason: command.reason.trim(),
    });

    return { campaignId: command.campaignId };
  }
}

/**
 * Admin sửa NỘI DUNG một hoạt động (CMS) — sửa lỗi chính tả, cập nhật mô tả, chỉnh
 * vị trí. Không đụng slug (link chia sẻ đã phát), thời gian (`/extend`, `/close` có
 * luật riêng), loại hoạt động hay quan hệ người thụ hưởng (quyết định có phải duyệt
 * đồng ý hay không), cũng không đụng trạng thái duyệt.
 *
 * Kiểm bằng ĐÚNG `charityCampaignGaps` của đường tạo, trên giá trị đã gộp — sửa không
 * được là cửa sau để có một hoạt động mà đường tạo sẽ từ chối.
 */
@Injectable()
export class UpdateAdminCharityCampaignUseCase implements IUpdateAdminCharityCampaignUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly repository: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateAdminCharityCampaignCommand,
  ): Promise<ICharityCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const existing = await this.repository.findByGlobalId(command.campaignId);
    if (!existing) throw new CharityCampaignNotFoundException();

    const latGiven = command.lat !== undefined;
    const lngGiven = command.lng !== undefined;
    const gaps: string[] = [];
    // Toạ độ đi theo CẶP, cả khi sửa: đổi mỗi vĩ độ là dời điểm sang chỗ không ai định.
    if (
      latGiven !== lngGiven ||
      (latGiven && (command.lat === null) !== (command.lng === null))
    )
      gaps.push(
        'lat và lng phải gửi cùng nhau (cùng số, hoặc cùng null để xoá vị trí)',
      );

    const next = {
      title:
        command.title === undefined
          ? existing.title
          : command.title.trim().slice(0, MaxCharityTitleLength),
      description:
        command.description === undefined
          ? existing.description
          : command.description.trim().slice(0, MaxCharityDescriptionLength),
      badgeName:
        command.badgeName === undefined
          ? existing.badgeName
          : command.badgeName.trim(),
      targetItemsCount: command.targetItemsCount ?? existing.targetItemsCount,
      lat: latGiven ? (command.lat ?? null) : existing.lat,
      lng: lngGiven ? (command.lng ?? null) : existing.lng,
      locationLabel:
        command.locationLabel === undefined
          ? existing.locationLabel
          : command.locationLabel?.trim() || null,
    };

    gaps.push(
      ...charityCampaignGaps({
        ...next,
        slug: existing.slug,
        startTime: existing.startTime,
        endTime: existing.endTime,
      }),
    );
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    const updated = await this.repository.updateContent({
      campaignId: command.campaignId,
      ...next,
    });
    if (!updated) throw new CharityCampaignNotFoundException();

    // Audit chỉ ghi trường THẬT SỰ đổi, cả trước lẫn sau.
    const keys = Object.keys(next) as (keyof typeof next)[];
    const changed = keys.filter((key) => existing[key] !== next[key]);
    await this.admin.appendAudit({
      actorUserId: command.actorUserId,
      action: 'UPDATE_CHARITY_CAMPAIGN_CONTENT',
      resourceType: 'CHARITY_CAMPAIGN',
      resourceId: command.campaignId,
      before: Object.fromEntries(changed.map((key) => [key, existing[key]])),
      after: Object.fromEntries(changed.map((key) => [key, next[key]])),
      reason: command.reason.trim(),
    });

    return toView(updated, null);
  }
}
