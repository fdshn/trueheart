import { Module } from '@nestjs/common';
import {
  AdminCharityAppealController,
  CharityAppealController,
  CharityProjectAppealController,
} from './charity-appeal.controller';
import { CharityCampaignPublicController } from './charity-campaign-public.controller';
import {
  AdminCharityCampaignController,
  CharityCampaignController,
} from './charity-campaign.controller';
import { CharityContributionController } from './charity-contribution.controller';
import { CharityDeliveryController } from './charity-delivery.controller';
import { CharityDisputeController } from './charity-dispute.controller';
import { CharityEngagementController } from './charity-engagement.controller';
import { CharityEventController } from './charity-event.controller';
import { CharityExternalContributionController } from './charity-external-contribution.controller';
import { CharityOperationsController } from './charity-operations.controller';
import { CharityParticipationController } from './charity-participation.controller';
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
    CharityProjectAppealController,
    CharityAppealController,
    AdminCharityAppealController,
    AdminCharityProjectController,
    CharityParticipationController,
    CharityOperationsController,
    CharityDisputeController,
  ],
})
export class CharityCampaignControllerModule {}
