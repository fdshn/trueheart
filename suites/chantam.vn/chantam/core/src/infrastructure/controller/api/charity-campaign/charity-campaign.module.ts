import { Module } from '@nestjs/common';
import { CharityCampaignPublicController } from './charity-campaign-public.controller';
import {
  AdminCharityCampaignController,
  CharityCampaignController,
} from './charity-campaign.controller';
import { CharityContributionController } from './charity-contribution.controller';
import { CharityDeliveryController } from './charity-delivery.controller';
import { CharityExternalContributionController } from './charity-external-contribution.controller';

@Module({
  controllers: [
    AdminCharityCampaignController,
    CharityCampaignController,
    CharityCampaignPublicController,
    CharityContributionController,
    CharityDeliveryController,
    CharityExternalContributionController,
  ],
})
export class CharityCampaignControllerModule {}
