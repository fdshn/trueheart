/**
 * Hợp đồng chung của mọi use case trong hệ thống.
 *
 * Method là `handle` (không phải `execute`) — xem INVARIANTS.md mục 5.
 * Tham số `Async` cho phép khai báo use case đồng bộ khi cần.
 */
export interface IUseCase<Command, Result, Async extends boolean = true> {
  handle(command: Command): Async extends true ? Promise<Result> : Result;
}

/** Dùng cho use case có kiểu trả về linh hoạt theo lời gọi. */
export interface IGenericUseCase<Command, Async extends boolean = true> {
  handle<Result = any>(
    command: Command,
  ): Async extends true ? Promise<Result> : Result;
}
