import { Provider } from '@nestjs/common';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

export interface IRepositoryBinding {
  /** Token của entity, khai báo trong `-lib` (ví dụ `IGiftPostEntity`). */
  entity: symbol;
  /** Token của repository, khai báo trong `domain/ports/repository`. */
  repository: symbol;
}

/**
 * Sinh provider cho các repository không có truy vấn tuỳ biến.
 *
 * Repository có method riêng (ví dụ `findNearby`) thì viết class riêng
 * `extends Repository<IXEntity>` rồi đăng ký bằng `useClass` bên cạnh.
 *
 * @example
 * ```typescript
 * providers: [
 *   ...Repositories.create([
 *     { entity: IUserEntity, repository: IUserRepository },
 *   ]),
 *   { provide: IGiftPostRepository, useClass: GiftPostRepository },
 * ]
 * ```
 */
export class Repositories {
  public static create(bindings: IRepositoryBinding[]): Provider[] {
    return bindings.map((binding) => ({
      provide: binding.repository,
      inject: [binding.entity, EntityManager],
      useFactory: (target: EntitySchema, manager: EntityManager) =>
        new Repository(target, manager),
    }));
  }
}
