import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage.service';
import { ScannerService } from './scanner.service';
import { ImageProcessorService } from './image-processor.service';
import { UploadsConfig } from './uploads.config';

@Module({
  imports: [PrismaModule],
  controllers: [UploadsController],
  providers: [
    UploadsConfig,
    StorageService,
    ScannerService,
    ImageProcessorService,
    UploadsService,
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
