import {
  IAdminGiftTransactionView,
  IGetAdminGiftTransactionCommand,
  IGetAdminGiftTransactionResult,
  IGetAdminGiftTransactionUseCase,
  IListAdminGiftTransactionsCommand,
  IListAdminGiftTransactionsResult,
  IListAdminGiftTransactionsUseCase,
} from '@/application/contracts/transaction';
import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IAdminGiftTransactionItem,
  IGiftTransactionRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Lượt trao gắn với một bài đăng, nên đọc nó cùng quyền với đọc bài quản trị.
 * MỞ LẠI vẫn đòi `admin.manage` — đọc và sửa là hai việc khác nhau.
 */
const ReadPermission = 'post.read';

async function assertCanRead(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await permissions.hasPermission(actorUserId, ReadPermission)))
    throw new ForbiddenException();
}

function toView({
  globalId,
  ...rest
}: IAdminGiftTransactionItem): IAdminGiftTransactionView {
  return { transactionId: globalId, ...rest };
}

/** Danh sách lượt trao cho CMS, có bộ lọc (CMS A6). */
@Injectable()
export class ListAdminGiftTransactionsUseCase implements IListAdminGiftTransactionsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IListAdminGiftTransactionsCommand,
  ): Promise<IListAdminGiftTransactionsResult> {
    await assertCanRead(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.transactions.listForAdmin({
      status: command.status ?? null,
      userId: command.userId ?? null,
      postId: command.postId ?? null,
      skip,
      take,
    });

    return {
      transactions: items.map(toView),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/**
 * Một lượt trao kèm ảnh bằng chứng, để Admin xem trước khi mở lại hay xử tranh
 * chấp (CMS A6).
 */
@Injectable()
export class GetAdminGiftTransactionUseCase implements IGetAdminGiftTransactionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetAdminGiftTransactionCommand,
  ): Promise<IGetAdminGiftTransactionResult> {
    await assertCanRead(this.permissions, command.actorUserId);

    const transaction = await this.transactions.findAdminItem(
      command.transactionId,
    );
    if (!transaction) throw new GiftTransactionNotFoundException();

    const base = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    const evidence = await this.transactions.listEvidence(
      command.transactionId,
    );

    return {
      transaction: toView(transaction),
      evidence: evidence.map((item) => ({
        kind: item.kind,
        slot: item.slot,
        url: `${base}/${item.storageKey}`,
        uploadedBy: item.uploadedBy,
        createdAt: item.createdAt,
      })),
    };
  }
}
