import { IPostShareLinkDto } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Link chia sẻ bài bằng mã (PR #46 §4). Cùng lối `inviteLinkOf` của nhóm: đường dẫn tương đối
 * luôn có, URL tuyệt đối chỉ khi web công khai đã cấu hình — ghép tên miền hộ client là sinh
 * link chết khi đổi môi trường. Bảng chữ của mã đã an toàn trong URL nên không cần mã hoá.
 */
export function postShareLinkOf(
  webPublicBaseUrl: string,
  shareCode: string,
): IPostShareLinkDto {
  const sharePath = `/p/${shareCode}`;
  const base = webPublicBaseUrl.replace(/\/$/, '');
  return {
    shareCode,
    sharePath,
    shareUrl: base ? `${base}${sharePath}` : null,
  };
}
