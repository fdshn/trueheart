/**
 * Vòng đời một yêu cầu chuyển vật phẩm về điểm từ thiện (F23).
 *
 * ```
 * REQUESTED ──Admin duyệt──▶ APPROVED  (bài sang ARCHIVED — Kho Từ Thiện Chung)
 *     └──────Admin từ chối──▶ REJECTED (bài giữ nguyên trạng thái cũ)
 * ```
 *
 * Từ chối KHÔNG xoá dấu vết: `REJECTED` nằm lại để chủ bài biết đã bị từ chối
 * chứ không tưởng là yêu cầu chưa gửi, và để lần gửi sau còn đối chiếu được.
 */
export enum CharityTransferStatuses {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
