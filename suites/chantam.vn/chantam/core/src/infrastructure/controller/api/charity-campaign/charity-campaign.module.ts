import { Module } from '@nestjs/common';
import { CharityCampaignPublicController } from './charity-campaign-public.controller';
import {
  AdminCharityCampaignController,
  CharityCampaignController,
} from './charity-campaign.controller';
import { CharityContributionController } from './charity-contribution.controller';
import { CharityDeliveryController } from './charity-delivery.controller';
import { CharityEngagementController } from './charity-engagement.controller';
import { CharityEventController } from './charity-event.controller';
import { CharityExternalContributionController } from './charity-external-contribution.controller';
import {
  AdminCharityProjectController,
  CharityProjectController,
} from './charity-project.controller';
import {
  AdminCharityPromotionController,
  CharityHomeController,
  CharitySummaryController,
} from './charity-summary.controller';

@Module({
  controllers: [
    AdminCharityCampaignController,
    CharityCampaignController,
    CharityCampaignPublicController,
    CharityContributionController,
    CharityDeliveryController,
    CharityExternalContributionController,
    CharityProjectController,
    CharityEngagementController,
    CharityEventController,
    CharitySummaryController,
    AdminCharityPromotionController,
    CharityHomeController,
    AdminCharityProjectController,
  ],
})
export class CharityCampaignControllerModule {}
