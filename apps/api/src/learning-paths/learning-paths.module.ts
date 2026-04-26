import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminLearningPathsController,
  LearningPathsController,
} from './learning-paths.controller';
import { LearningPathsService } from './learning-paths.service';

@Module({
  imports: [AuthModule],
  controllers: [LearningPathsController, AdminLearningPathsController],
  providers: [LearningPathsService],
  exports: [LearningPathsService],
})
export class LearningPathsModule {}
