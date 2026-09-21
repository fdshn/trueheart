import { IOwnProfileDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';

/** Explicit mapping: profile entity contains password/internal state that must not leak. */
export function toOwnProfileDto(user: IUserEntity): IOwnProfileDto {
  return {
    userId: user.globalId,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    email: user.email,
    phone: user.phone,
    defaultLocation: user.defaultLocation,
    rank: user.rank,
    status: user.status,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    profileComplete: isProfileComplete(user),
  };
}
