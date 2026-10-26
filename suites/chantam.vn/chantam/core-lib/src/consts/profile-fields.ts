/** Mã trường hồ sơ — đúng tên trường trong `PATCH /profile/me`, cho client đánh dấu ô thiếu. */
export type ProfileFieldKey = 'fullName' | 'avatarUrl' | 'phone' | 'email';

export const ProfileFieldLabels: Readonly<Record<ProfileFieldKey, string>> = {
  fullName: 'Họ tên',
  avatarUrl: 'Avatar',
  phone: 'SĐT',
  email: 'Email',
};
