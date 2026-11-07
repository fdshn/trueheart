import {
  ISweepOrphanMediaCommand,
  ISweepOrphanMediaResult,
  ISweepOrphanMediaUseCase,
} from '@/application/contracts/media';
import { IConfig } from '@/domain/ports/config';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Chỉ quét dưới tiền tố này. Mọi đường tải đều sinh key dạng
 * `users/<userId>/...`, nên thứ nằm ngoài đó là do người khác đặt vào bucket —
 * không phải rác của ứng dụng, và không phải việc của job này.
 */
const SweepPrefix = 'users/';

/**
 * Object phải già hơn ngần này mới bị coi là mồ côi.
 *
 * Giữa lúc client PUT xong và lúc gọi bước xác nhận có một khoảng trống. Quét
 * quá sát là xoá mất ảnh của một người đang upload dở — và họ sẽ thấy ảnh biến
 * mất ngay sau khi tải lên xong.
 */
const DefaultMinAgeHours = 24;

/**
 * Mọi nơi trong database đang giữ key hoặc URL của object.
 *
 * Danh sách này là thứ duy nhất đứng giữa job dọn rác và việc xoá ảnh thật.
 * Thiếu một nguồn ở đây nghĩa là toàn bộ ảnh của nguồn đó bị coi là mồ côi và
 * bị xoá sạch — nên thêm bảng mới có lưu key thì PHẢI thêm vào đây.
 */
const LiveKeySources: readonly { sql: string; label: string }[] = [
  { label: 'post_media', sql: 'SELECT r2_key AS value FROM post_media' },
  {
    label: 'campaign_media',
    sql: 'SELECT storage_key AS value FROM campaign_media',
  },
  {
    // Bài ảnh/clip trong dự án từ thiện (`users/<id>/campaign-media/`, cùng tiền tố ảnh hồ sơ
    // dự án). Lượt ký chưa đăng (`campaign_post_uploads`) CỐ Ý không nằm đây: tải mà không
    // đăng là tệp bỏ, dọn sau 24 giờ như mọi tệp mồ côi khác.
    label: 'campaign_post_media',
    sql: 'SELECT storage_key AS value FROM campaign_post_media',
  },
  {
    // Bằng chứng của đơn vị liên quan / bên thụ hưởng (đợt 1) là URL tải lên qua luồng media.
    label: 'campaign_parties.evidence_urls',
    sql: `SELECT jsonb_array_elements_text(evidence_urls) AS value
          FROM campaign_parties WHERE jsonb_typeof(evidence_urls) = 'array'`,
  },
  {
    // Tổng kết dự án (đợt 4): bằng chứng và sao kê tài chính.
    label: 'campaign_summaries.evidence_urls',
    sql: `SELECT jsonb_array_elements_text(evidence_urls) AS value FROM campaign_summaries`,
  },
  {
    label: 'campaign_financial_reports.statement_urls',
    sql: `SELECT jsonb_array_elements_text(statement_urls) AS value FROM campaign_financial_reports`,
  },
  {
    // Thư viện ảnh CMS (CMS A2). Ảnh ở đây được dán vào banner/blog/Home dưới dạng URL
    // tự do — bảng này là nơi DUY NHẤT nói chúng đang được giữ.
    label: 'media_assets',
    sql: 'SELECT storage_key AS value FROM media_assets',
  },
  {
    label: 'chat_message_media',
    sql: 'SELECT storage_key AS value FROM chat_message_media',
  },
  {
    label: 'content_comment_media',
    sql: 'SELECT storage_key AS value FROM content_comment_media',
  },
  {
    label: 'gift_transaction_evidence',
    sql: 'SELECT storage_key AS value FROM gift_transaction_evidence',
  },
  {
    label: 'users.avatar_url',
    sql: 'SELECT avatar_url AS value FROM users WHERE avatar_url IS NOT NULL',
  },
  {
    // Clip giới thiệu hồ sơ (PR #46 §3, `users/<id>/intro-videos|intro-thumbnails/`). Thiếu hai
    // nguồn này thì `--apply` coi mọi clip đang hiển thị là mồ côi và xoá — phát hiện 03/11.
    label: 'users.intro_video_url',
    sql: 'SELECT intro_video_url AS value FROM users WHERE intro_video_url IS NOT NULL',
  },
  {
    label: 'users.intro_video_thumbnail_url',
    sql: 'SELECT intro_video_thumbnail_url AS value FROM users WHERE intro_video_thumbnail_url IS NOT NULL',
  },
  {
    label: 'groups.avatar_url',
    sql: 'SELECT avatar_url AS value FROM groups WHERE avatar_url IS NOT NULL',
  },
  {
    label: 'groups.cover_url',
    sql: 'SELECT cover_url AS value FROM groups WHERE cover_url IS NOT NULL',
  },
  {
    label: 'reports.evidence_urls',
    sql: `SELECT jsonb_array_elements_text(evidence_urls) AS value
          FROM reports WHERE jsonb_typeof(evidence_urls) = 'array'`,
  },
  {
    // Bằng chứng khiếu nại (đợt 4b) và tranh chấp đóng góp (đợt 5c) — tải qua luồng bằng chứng.
    label: 'campaign_appeals.evidence_urls',
    sql: `SELECT jsonb_array_elements_text(evidence_urls) AS value
          FROM campaign_appeals WHERE jsonb_typeof(evidence_urls) = 'array'`,
  },
  {
    label: 'campaign_contribution_disputes.evidence_urls',
    sql: `SELECT jsonb_array_elements_text(evidence_urls) AS value
          FROM campaign_contribution_disputes WHERE jsonb_typeof(evidence_urls) = 'array'`,
  },
  {
    // Bằng chứng nguồn ngoài app của hạng mục hỗ trợ mở (đợt 5b).
    label: 'campaign_other_support_needs.external_evidence_urls',
    sql: `SELECT jsonb_array_elements_text(external_evidence_urls) AS value
          FROM campaign_other_support_needs
          WHERE jsonb_typeof(external_evidence_urls) = 'array'`,
  },
  {
    // Âm thanh Phật pháp tải qua `/admin/media/audio` (`users/<id>/cms-audio/`) không nằm trong
    // thư viện ảnh — nội dung đang trỏ tới là nguồn duy nhất giữ nó lại.
    label: 'dharma_contents.audio_url',
    sql: 'SELECT audio_url AS value FROM dharma_contents WHERE audio_url IS NOT NULL',
  },
  {
    label: 'dharma_contents.cover_url',
    sql: 'SELECT cover_url AS value FROM dharma_contents WHERE cover_url IS NOT NULL',
  },
];

@Injectable()
export class SweepOrphanMediaUseCase implements ISweepOrphanMediaUseCase {
  private readonly logger = new Logger(SweepOrphanMediaUseCase.name);

  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: ISweepOrphanMediaCommand,
  ): Promise<ISweepOrphanMediaResult> {
    const minAgeHours = command.minAgeHours ?? DefaultMinAgeHours;
    const cutoff = new Date(Date.now() - minAgeHours * 3_600_000);
    const live = await this.collectLiveKeys();

    let scanned = 0;
    let orphans = 0;
    let deleted = 0;
    let reclaimedBytes = 0;
    let cursor: string | undefined;

    do {
      const page = await this.storage.listObjects({
        prefix: command.prefix ?? SweepPrefix,
        cursor,
      });

      const doomed: string[] = [];
      for (const object of page.objects) {
        scanned += 1;

        if (live.has(object.key)) continue;
        // Không có mốc thời gian thì coi như còn mới: thà để lại rác còn hơn
        // xoá nhầm ảnh vừa tải lên.
        if (!object.lastModified || object.lastModified > cutoff) continue;

        orphans += 1;
        reclaimedBytes += object.size;
        doomed.push(object.key);
      }

      if (doomed.length > 0 && !command.dryRun)
        deleted += await this.storage.deleteObjects(doomed);

      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    this.logger.log(
      `Quét ${scanned} object, ${orphans} mồ côi (cũ hơn ${minAgeHours} giờ), ` +
        `${command.dryRun ? 'KHÔNG xoá (dry-run)' : `đã xoá ${deleted}`}.`,
    );

    return {
      scanned,
      orphans,
      deleted,
      reclaimedBytes,
      liveKeys: live.size,
      dryRun: command.dryRun === true,
    };
  }

  /**
   * Gom mọi key đang được database trỏ tới.
   *
   * Một số cột lưu URL công khai chứ không lưu key, nên phải cắt tiền tố miền
   * để so được với thứ `listObjects` trả về. URL trỏ ra ngoài (ảnh bằng chứng
   * người dùng dán link) không khớp tiền tố nên rơi ra ngoài tập này — vô hại,
   * vì nó cũng không nằm trong bucket.
   */
  private async collectLiveKeys(): Promise<Set<string>> {
    const base = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    const live = new Set<string>();

    for (const source of LiveKeySources) {
      const rows = await this.manager.query<{ value: string | null }[]>(
        source.sql,
      );

      for (const row of rows) {
        const value = row.value?.trim();
        if (!value) continue;

        if (value.startsWith(`${base}/`))
          live.add(value.slice(base.length + 1));
        else if (!value.includes('://')) live.add(value);
      }
    }

    return live;
  }
}
