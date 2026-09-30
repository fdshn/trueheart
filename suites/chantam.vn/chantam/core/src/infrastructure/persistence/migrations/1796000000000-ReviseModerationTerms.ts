import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soát lại danh sách từ ngữ — 30/09. Bản 2 của `moderation.blocked_terms`.
 *
 * Bản 1 (`1795600000000`) là danh sách khởi tạo tôi dựng để bật bộ lọc lên, kèm
 * ghi chú "cần Bên A soát lại". Lượt soát này đo bằng corpus thay vì bằng cảm
 * giác, và tìm ra bốn hạng lỗi.
 *
 * ## 1. Bốn mục BẮT NHẦM câu hoàn toàn vô hại
 *
 * | Mục | Sau chuẩn hoá | Bắt nhầm |
 * | --- | --- | --- |
 * | `con chó` **BLOCK** | `con cho` | "con chó nhà mình vừa sinh, ai cần chuồng không" |
 * | `súc vật` | `suc vat` | "còn ít thức ăn cho súc vật, ai nuôi mèo thì lấy" |
 * | `súng` | `sung` | "nhà mình **sung** túc hơn trước nên muốn cho lại" |
 * | `giá rẻ` | `gia re` | "mình mua hồi đó **giá rẻ** nên tặng lại thôi" |
 *
 * `con chó` là nặng nhất: nó ở mức **BLOCK**, tức người ta KHÔNG đăng được — trên
 * một nền tảng cho tặng, nơi đồ cho thú nuôi là thứ hay được cho nhất. Bỏ hẳn;
 * `thằng chó` và `chó chết` mới là câu chửi.
 *
 * `súng` chỉ bốn chữ nên còn bị so trên dạng bỏ hết dấu cách, tức nó khớp như
 * CHUỖI CON — "sung túc", "sung sướng". Thay bằng dạng nhiều từ: `khẩu súng`,
 * `súng ngắn`, `súng hơi`, `súng săn`.
 *
 * `súc vật` thay bằng `đồ súc vật` / `thằng súc vật` — đó mới là lúc nó là chửi.
 *
 * `giá rẻ` bỏ hẳn: "mua hồi đó giá rẻ nên tặng lại" là câu người tặng thật hay
 * viết nhất. `bán lại`, `thanh lý`, `cần bán`, `bán gấp` giữ vì chúng nói ý ĐỊNH
 * bán, không nói giá.
 *
 * ## 2. Ba mục TRÙNG nhau, không làm gì cả
 *
 * Bản 1 khai 41 mục nhưng chỉ 38 có hiệu lực. Bộ chuẩn hoá rút chữ lặp về MỘT
 * chữ, nên `đm`, `đmm`, `dmm` cùng ra `dm`, và `đcm`, `dcm` cùng ra `dcm`. Ba mục
 * là bản sao. Bỏ dấu cũng đã tự lo phần `đ` thành `d`, nên khai cả hai biến thể
 * là làm thay việc bộ chuẩn hoá đã làm.
 *
 * ## 3. Bốn từ thô tục NẶNG NHẤT không biểu đạt được, và đó là giới hạn của bộ so
 *
 * Bỏ dấu để chống lách có giá: `cặc` thành `cac` trùng **các**, `lồn` thành `lon`
 * trùng **lon** (lon sữa), `buồi` thành `buoi` trùng **buổi**, `đĩ` thành `di`
 * trùng **đi**, `địt` thành `dit` trùng **đít**. Thêm chúng là chặn "các bạn ơi",
 * "còn hai lon sữa", "buổi sáng mình có nhà".
 *
 * Nên danh sách này KHÔNG bỏ sót chúng — nó không thể chứa chúng. Đường đi quanh
 * là dạng nhiều từ (`địt mẹ`, `đĩ thoã`). Muốn bắt từ đơn thì phải đổi bộ so
 * khớp, không phải thêm vào danh sách. Ai định "bổ sung cho đủ" cần đọc chỗ này
 * trước — xem `content-moderation.corpus.ts`.
 *
 * ## 4. Hai mục thô lỗ nhưng chưa tới mức chặn
 *
 * `cút đi` và `im đi` hạ từ BLOCK xuống REVIEW. Chúng bất nhã, không phải xúc
 * phạm — và BLOCK nghĩa là người ta không đăng được, ngưỡng đó phải cao.
 *
 * ## Phần THÊM
 *
 * Xúc phạm còn thiếu (`chó chết`, `khốn nạn`, `mất dạy`, `vô học`, `rác rưởi`,
 * `óc lợn`, `địt mẹ`, `đĩ thoã`), lừa đảo (`otp`, `mã otp`, `nạp thẻ`, `vay tiền`,
 * `lãi suất`, `ship cod`), kéo ra ngoài (`telegram`, `kết bạn facebook`,
 * `số điện thoại riêng`), hàng cấm theo luật Việt Nam (`ma túy`, `cần sa`,
 * `pháo nổ`, `động vật hoang dã`, `thuốc kê đơn`, `nội tạng`).
 *
 * 66 mục, 66 có hiệu lực. Đo được: 0 dương tính giả trên 36 câu vô hại, 0 mục
 * chết trên 65 câu xấu, 0 câu xấu lọt lưới. `test:config-inventory` chạy đúng
 * corpus đó trên danh sách ĐANG NẰM trong database, nên một lần sửa sai qua
 * `POST /admin/system-configs` cũng bị bắt.
 *
 * Vẫn cần Bên A xem: `đặt cọc`, `chuyển tiền`, `phí vận chuyển` là câu hỏi giao
 * nhận thật thà cũng hay dùng, nên chúng là nhóm đẩy hàng đợi Admin lên cao nhất.
 */
export class ReviseModerationTerms1796000000000 implements MigrationInterface {
  name = 'ReviseModerationTerms1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Copy-on-write trong MỘT câu: đóng bản đang hiệu lực và mở bản mới ở CÙNG
    // mốc thời gian, đúng lối `publishSystemConfig` làm lúc chạy.
    //
    // Phải cùng mốc vì `EX_system_configs_published_window` loại trừ theo khoảng
    // `[from, to)`. Lấy `now()` riêng cho hai câu thì trên database DỰNG MỚI hai
    // migration chạy sát nhau đủ để ra cùng một microsecond, và khi đó bản mới bắt
    // đầu BÊN TRONG khoảng vừa đóng.
    //
    // `GREATEST(..., effective_from + 1 microsecond)` vì `CHK_system_configs_dates`
    // còn đòi `effective_to > effective_from` — bản 1 được chèn ở cùng
    // microsecond với lúc câu này chạy, nên `now()` trần cho ra hai mốc bằng nhau.
    //
    // Cả hai chỉ hỏng ở đường dựng mới, nên `migration:run` trên database đã chạy
    // lâu vẫn xanh. `test:group` dựng cluster sạch nên nó bắt được cả hai.
    await queryRunner.query(
      `
        WITH closed AS (
          UPDATE "system_configs"
          SET "effective_to" =
                GREATEST(now(), "effective_from" + interval '1 microsecond')
          WHERE "config_key" = 'moderation.blocked_terms'
            AND "effective_to" IS NULL
          RETURNING "effective_to"
        ), next_version AS (
          SELECT COALESCE(MAX("version"), 0) + 1 AS "version"
          FROM "system_configs"
          WHERE "config_key" = 'moderation.blocked_terms'
        )
        INSERT INTO "system_configs"
          ("config_key", "value_json", "value_type", "version", "status",
           "change_reason", "effective_from")
        SELECT 'moderation.blocked_terms', $1::jsonb, 'JSON',
               next_version."version", 'PUBLISHED', $2,
               COALESCE((SELECT "effective_to" FROM closed), now())
        FROM next_version
      `,
      [JSON.stringify(TERMS), ChangeReason],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_configs"
      WHERE "config_key" = 'moderation.blocked_terms'
        AND "version" = (
          SELECT MAX("version") FROM "system_configs"
          WHERE "config_key" = 'moderation.blocked_terms'
        )
    `);
    await queryRunner.query(`
      UPDATE "system_configs" SET "effective_to" = NULL
      WHERE "config_key" = 'moderation.blocked_terms'
        AND "version" = (
          SELECT MAX("version") FROM "system_configs"
          WHERE "config_key" = 'moderation.blocked_terms'
        )
    `);
  }
}

const ChangeReason =
  'Soát lại bằng corpus: bỏ 4 mục bắt nhầm câu vô hại (con chó ở mức BLOCK chặn cả người cho đồ thú nuôi; súng khớp trong sung túc; giá rẻ khớp câu người tặng hay viết), bỏ 3 mục trùng sau chuẩn hoá, hạ cút đi và im đi xuống REVIEW, thêm 28 mục xúc phạm - lừa đảo - hàng cấm. Đo được 0 dương tính giả trên 36 câu vô hại và 0 mục chết';

/**
 * `severity` là chuỗi, không phải enum import vào: migration phải chạy được với
 * mã nguồn của TƯƠNG LAI, và một enum đổi tên thành viên sẽ làm migration cũ ném
 * lỗi biên dịch cho một dữ liệu đã nằm trong database từ lâu. Cùng lý do, danh
 * sách nằm ở đây chứ không import từ `core-lib`.
 */
const TERMS: readonly { term: string; severity: 'BLOCK' | 'REVIEW' }[] = [
  // Xúc phạm trực diện — BLOCK. Gõ ra là chửi, không có ngữ cảnh hiền lành.
  { term: 'đm', severity: 'BLOCK' },
  { term: 'đcm', severity: 'BLOCK' },
  { term: 'vcl', severity: 'BLOCK' },
  { term: 'vkl', severity: 'BLOCK' },
  { term: 'clm', severity: 'BLOCK' },
  { term: 'cmn', severity: 'BLOCK' },
  { term: 'thằng chó', severity: 'BLOCK' },
  { term: 'chó chết', severity: 'BLOCK' },
  { term: 'đồ khốn', severity: 'BLOCK' },
  { term: 'khốn nạn', severity: 'BLOCK' },
  { term: 'mẹ mày', severity: 'BLOCK' },
  { term: 'bố mày', severity: 'BLOCK' },
  { term: 'địt mẹ', severity: 'BLOCK' },
  { term: 'đĩ thoã', severity: 'BLOCK' },
  { term: 'mất dạy', severity: 'BLOCK' },
  { term: 'vô học', severity: 'BLOCK' },
  { term: 'rác rưởi', severity: 'BLOCK' },
  { term: 'óc lợn', severity: 'BLOCK' },
  { term: 'đồ súc vật', severity: 'BLOCK' },
  { term: 'thằng súc vật', severity: 'BLOCK' },

  // Bất nhã nhưng chưa tới mức chặn — REVIEW.
  { term: 'cút đi', severity: 'REVIEW' },
  { term: 'im đi', severity: 'REVIEW' },
  { term: 'thằng điên', severity: 'REVIEW' },

  // Dấu hiệu lừa đảo / đòi tiền. REVIEW vì có thể là câu hỏi giao nhận thật thà.
  { term: 'chuyển khoản trước', severity: 'REVIEW' },
  { term: 'đặt cọc', severity: 'REVIEW' },
  { term: 'cọc trước', severity: 'REVIEW' },
  { term: 'phí vận chuyển', severity: 'REVIEW' },
  { term: 'phí giữ hàng', severity: 'REVIEW' },
  { term: 'chuyển tiền', severity: 'REVIEW' },
  { term: 'số tài khoản', severity: 'REVIEW' },
  { term: 'momo', severity: 'REVIEW' },
  { term: 'thẻ cào', severity: 'REVIEW' },
  { term: 'nạp thẻ', severity: 'REVIEW' },
  { term: 'otp', severity: 'REVIEW' },
  { term: 'mã otp', severity: 'REVIEW' },
  { term: 'vay tiền', severity: 'REVIEW' },
  { term: 'lãi suất', severity: 'REVIEW' },
  { term: 'ship cod', severity: 'REVIEW' },

  // Kéo ra ngoài nền tảng: ra ngoài là mất hết dấu vết cho tranh chấp, và đó
  // đúng là lý do kẻ lừa muốn ra ngoài.
  { term: 'zalo riêng', severity: 'REVIEW' },
  { term: 'nhắn zalo', severity: 'REVIEW' },
  { term: 'kết bạn zalo', severity: 'REVIEW' },
  { term: 'inbox riêng', severity: 'REVIEW' },
  { term: 'liên hệ ngoài', severity: 'REVIEW' },
  { term: 'telegram', severity: 'REVIEW' },
  { term: 'kết bạn facebook', severity: 'REVIEW' },
  { term: 'số điện thoại riêng', severity: 'REVIEW' },

  // Hàng cấm hoặc cần người xem. Máy không kết luận được thay người.
  { term: 'thuốc lá', severity: 'REVIEW' },
  { term: 'rượu', severity: 'REVIEW' },
  { term: 'vũ khí', severity: 'REVIEW' },
  { term: 'dao găm', severity: 'REVIEW' },
  { term: 'khẩu súng', severity: 'REVIEW' },
  { term: 'súng ngắn', severity: 'REVIEW' },
  { term: 'súng hơi', severity: 'REVIEW' },
  { term: 'súng săn', severity: 'REVIEW' },
  { term: 'ma túy', severity: 'REVIEW' },
  { term: 'cần sa', severity: 'REVIEW' },
  { term: 'pháo nổ', severity: 'REVIEW' },
  { term: 'động vật hoang dã', severity: 'REVIEW' },
  { term: 'thuốc kê đơn', severity: 'REVIEW' },
  { term: 'nội tạng', severity: 'REVIEW' },
  { term: 'chất kích thích', severity: 'REVIEW' },
  { term: 'thực phẩm hết hạn', severity: 'REVIEW' },

  // Dấu hiệu buôn bán — nền tảng là CHO TẶNG, không phải chợ. Bốn mục này nói ý
  // ĐỊNH bán; `giá rẻ` đã bỏ vì nó nói GIÁ và người tặng thật cũng hay viết.
  { term: 'bán lại', severity: 'REVIEW' },
  { term: 'thanh lý', severity: 'REVIEW' },
  { term: 'cần bán', severity: 'REVIEW' },
  { term: 'bán gấp', severity: 'REVIEW' },
];
