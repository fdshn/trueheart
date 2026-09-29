import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nạp danh sách từ ngữ cho bộ lọc bình luận — 29/09.
 *
 * **Trước migration này bộ lọc CHƯA BAO GIỜ chạy.** `moderation.blocked_terms`
 * không có dòng nào trong `system_configs`, `normalizeBlockedTerms(null)` trả `[]`,
 * và `screenText(body, [])` không khớp gì cả. Kết quả: mọi bình luận đi thẳng sang
 * `VISIBLE`, `ContentBlockedTermsException` không bao giờ được ném,
 * `PENDING_REVIEW` không bao giờ sinh ra, và hàng đợi bình luận của Admin cùng cái
 * badge đếm số chờ duyệt không bao giờ có gì để hiện.
 *
 * Code thì hoàn chỉnh — `screenText` xử lý dấu, biến âm, ba dạng chuẩn hoá, có spec
 * đầy đủ. Mọi phép kiểm đều xanh vì chúng TRUYỀN danh sách từ vào trực tiếp. Không
 * phép kiểm nào hỏi "ngoài production thì danh sách đó có tồn tại không".
 *
 * ## Đây là danh sách KHỞI TẠO, cần Bên A soát lại
 *
 * Một danh sách từ cấm luôn vừa bỏ sót vừa bắt nhầm — chính docstring của
 * `content-moderation.ts` nói thế. Mấy lựa chọn cụ thể ở đây:
 *
 * - **`BLOCK` chỉ dành cho từ xúc phạm trực diện**, loại gõ ra là chửi, không có
 *   ngữ cảnh hiền lành. Chặn hẳn nghĩa là người dùng không đăng được, nên ngưỡng
 *   phải cao.
 * - **Dấu hiệu lừa đảo để `REVIEW`, không `BLOCK`.** "Đặt cọc" có thể là một câu
 *   hỏi thật thà về giao nhận. Chặn thẳng là chặn cả người hỏi thật.
 * - **Từ kéo ra ngoài nền tảng để `REVIEW`**: ra ngoài là mất hết dấu vết cho
 *   tranh chấp, và đó đúng là lý do kẻ lừa muốn ra ngoài.
 * - **"giá rẻ", "bán lại", "thanh lý" để `REVIEW`**: nền tảng là CHO TẶNG, không
 *   phải chợ. Nhưng ba từ này bắt nhầm nhiều nhất trong cả danh sách — ai cũng có
 *   thể viết "mua hồi đó giá rẻ" — nên chúng là ứng viên đầu tiên nên bỏ nếu hàng
 *   đợi Admin quá tải.
 *
 * Sửa bằng `POST /admin/system-configs`, không cần deploy. Bảng là copy-on-write
 * nên mọi lần sửa đều tra lại được.
 */
export class SeedModerationTerms1795600000000 implements MigrationInterface {
  name = 'SeedModerationTerms1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO "system_configs"
          ("config_key", "value_json", "value_type", "version", "status", "change_reason")
        VALUES (
          'moderation.blocked_terms',
          $1::jsonb,
          'JSON', 1, 'PUBLISHED',
          'Danh sách khởi tạo cho bộ lọc từ ngữ. Trước đó khoá này không có dòng nào nên bộ lọc trả ALLOW cho mọi nội dung — cả nhánh kiểm duyệt bình luận nằm im. BLOCK chỉ dành cho từ xúc phạm trực diện; dấu hiệu lừa đảo và hàng cấm để REVIEW vì máy không kết luận được thay người'
        )
        ON CONFLICT DO NOTHING
      `,
      [JSON.stringify(TERMS)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'moderation.blocked_terms'`,
    );
  }
}

/**
 * Danh sách nằm ngoài class để đọc được mà không phải lội qua SQL.
 *
 * `severity` là chuỗi chứ không phải enum import vào: migration phải chạy được với
 * mã nguồn của TƯƠNG LAI, và một enum đổi tên thành viên sẽ làm migration cũ ném
 * lỗi biên dịch cho một dữ liệu đã nằm trong database từ lâu.
 */
const TERMS: readonly { term: string; severity: 'BLOCK' | 'REVIEW' }[] = [
  {
    term: 'đm',
    severity: 'BLOCK',
  },
  {
    term: 'đmm',
    severity: 'BLOCK',
  },
  {
    term: 'dmm',
    severity: 'BLOCK',
  },
  {
    term: 'đcm',
    severity: 'BLOCK',
  },
  {
    term: 'dcm',
    severity: 'BLOCK',
  },
  {
    term: 'vcl',
    severity: 'BLOCK',
  },
  {
    term: 'vkl',
    severity: 'BLOCK',
  },
  {
    term: 'clm',
    severity: 'BLOCK',
  },
  {
    term: 'cmn',
    severity: 'BLOCK',
  },
  {
    term: 'thằng chó',
    severity: 'BLOCK',
  },
  {
    term: 'con chó',
    severity: 'BLOCK',
  },
  {
    term: 'súc vật',
    severity: 'BLOCK',
  },
  {
    term: 'đồ khốn',
    severity: 'BLOCK',
  },
  {
    term: 'mẹ mày',
    severity: 'BLOCK',
  },
  {
    term: 'bố mày',
    severity: 'BLOCK',
  },
  {
    term: 'cút đi',
    severity: 'BLOCK',
  },
  {
    term: 'im đi',
    severity: 'BLOCK',
  },
  {
    term: 'chuyển khoản trước',
    severity: 'REVIEW',
  },
  {
    term: 'đặt cọc',
    severity: 'REVIEW',
  },
  {
    term: 'cọc trước',
    severity: 'REVIEW',
  },
  {
    term: 'phí vận chuyển',
    severity: 'REVIEW',
  },
  {
    term: 'phí giữ hàng',
    severity: 'REVIEW',
  },
  {
    term: 'chuyển tiền',
    severity: 'REVIEW',
  },
  {
    term: 'số tài khoản',
    severity: 'REVIEW',
  },
  {
    term: 'momo',
    severity: 'REVIEW',
  },
  {
    term: 'thẻ cào',
    severity: 'REVIEW',
  },
  {
    term: 'zalo riêng',
    severity: 'REVIEW',
  },
  {
    term: 'nhắn zalo',
    severity: 'REVIEW',
  },
  {
    term: 'kết bạn zalo',
    severity: 'REVIEW',
  },
  {
    term: 'inbox riêng',
    severity: 'REVIEW',
  },
  {
    term: 'liên hệ ngoài',
    severity: 'REVIEW',
  },
  {
    term: 'thuốc lá',
    severity: 'REVIEW',
  },
  {
    term: 'rượu',
    severity: 'REVIEW',
  },
  {
    term: 'vũ khí',
    severity: 'REVIEW',
  },
  {
    term: 'dao găm',
    severity: 'REVIEW',
  },
  {
    term: 'súng',
    severity: 'REVIEW',
  },
  {
    term: 'chất kích thích',
    severity: 'REVIEW',
  },
  {
    term: 'thực phẩm hết hạn',
    severity: 'REVIEW',
  },
  {
    term: 'giá rẻ',
    severity: 'REVIEW',
  },
  {
    term: 'bán lại',
    severity: 'REVIEW',
  },
  {
    term: 'thanh lý',
    severity: 'REVIEW',
  },
];
