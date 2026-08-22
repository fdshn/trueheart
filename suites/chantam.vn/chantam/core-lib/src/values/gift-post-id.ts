import { makeGlobalId } from '@chantam/service.common-lib/utils';

/**
 * Danh tính công khai của một bài đăng.
 *
 * `create()` sinh ID tất định từ (người đăng, slug tiêu đề, thời điểm) nên client
 * retry cùng một yêu cầu không tạo ra bài đăng trùng.
 */
export class GiftPostId {
  private constructor(private readonly value: string) {}

  public static create(
    giverId: string,
    slug: string,
    createdAtIso: string,
  ): GiftPostId {
    return new GiftPostId(
      makeGlobalId(`/gift-posts/${giverId}/${slug}/${createdAtIso}`),
    );
  }

  public static from(value: string): GiftPostId {
    return new GiftPostId(value);
  }

  public toString(): string {
    return this.value;
  }
}
