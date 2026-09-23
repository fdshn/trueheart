import { IPostLikeEntity } from '@chantam.vn/chantam.core-lib/entities';
import { PostgresBaseEntity } from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index, Unique } from 'typeorm';

/**
 * Bảng lượt thích bài đăng.
 *
 * - `(user_id, post_id)` là natural key — UNIQUE constraint ngăn like 2 lần.
 * - `like_count` trong bảng `posts` được UPDATE nguyên tử cùng với INSERT/DELETE
 *   ở đây (qua repository), tránh COUNT(*) mỗi lần GET bài.
 * - Không soft-delete: unlike = xoá cứng bản ghi, likeCount-- trong cùng tx.
 */
@Entity('post_likes')
@Unique('UQ_post_likes_user_post', ['userId', 'postId'])
@Index('IDX_post_likes_post_id', ['postId'])
export class PostLikeEntity
  extends Mixin(PostgresBaseEntity)
  implements IPostLikeEntity
{
  @ApiProperty({ format: 'uuid', description: 'ID người like' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid', description: 'ID bài đăng được like' })
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ApiProperty({ description: 'Thời điểm like' })
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}
