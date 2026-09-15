import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Trường này phải bằng đúng một trường khác trong cùng object.
 *
 * Dùng cho "xác nhận mật khẩu", "xác nhận email" — những chỗ mà kiểm ở tầng use
 * case sẽ trả về lỗi nghiệp vụ chung chung, còn kiểm ở đây thì client nhận được
 * đúng tên trường sai và hiển thị được ngay dưới ô nhập.
 *
 * @example
 * ```typescript
 * @MatchesProperty('password', { message: 'Mật khẩu xác nhận không khớp' })
 * confirmPassword: string;
 * ```
 */
export function MatchesProperty(
  property: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'matchesProperty',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [related] = args.constraints as [string];

          return value === (args.object as Record<string, unknown>)[related];
        },
        defaultMessage(args: ValidationArguments): string {
          const [related] = args.constraints as [string];

          return `${args.property} phải trùng với ${related}`;
        },
      },
    });
  };
}
