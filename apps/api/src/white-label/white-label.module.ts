import { Module } from '@nestjs/common';
import {
  AdminAgenciesController,
  WhiteLabelAgencyController,
  WhiteLabelOwnerController,
  WhiteLabelPublicController,
} from './white-label.controller';
import { WhiteLabelService } from './white-label.service';

@Module({
  controllers: [
    WhiteLabelOwnerController,
    WhiteLabelAgencyController,
    WhiteLabelPublicController,
    AdminAgenciesController,
  ],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
