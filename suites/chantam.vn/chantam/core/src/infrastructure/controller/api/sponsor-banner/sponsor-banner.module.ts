import { Module } from '@nestjs/common';
import { SponsorBannerPublicController } from './sponsor-banner-public.controller';
import { AdminSponsorBannerController } from './sponsor-banner.controller';

@Module({
  controllers: [AdminSponsorBannerController, SponsorBannerPublicController],
})
export class SponsorBannerControllerModule {}
