import { Module } from '@nestjs/common';
import {
  AdminCampaignController,
  HomeLayoutController,
} from './home-campaign.controller';

@Module({ controllers: [AdminCampaignController, HomeLayoutController] })
export class HomeCampaignControllerModule {}
