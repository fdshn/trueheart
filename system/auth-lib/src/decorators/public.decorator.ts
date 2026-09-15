import { SetMetadata } from '@nestjs/common';

export const PublicRouteKey = 'chantam:public-route';

/**
 * Đánh dấu endpoint không cần đăng nhập.
 *
 * Guard được gắn toàn cục nên mặc định MỌI endpoint đều yêu cầu token — quên
 * đánh dấu thì endpoint bị khoá, đó là hướng sai an toàn. Ngược lại (mặc định
 * mở, phải nhớ khoá) thì quên một chỗ là lộ dữ liệu.
 */
export const Public = () => SetMetadata(PublicRouteKey, true);
