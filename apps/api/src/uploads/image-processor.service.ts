import { Injectable, Logger } from '@nestjs/common';

/**
 * Stub for the async image-processing worker. The real implementation will
 * re-encode images with sharp, strip EXIF, and produce the 64/128/512 px
 * variants described in the uploads spec. PR B1 intentionally only wires the
 * seam: `enqueueProcess` returns immediately and logs. Wiring a BullMQ
 * producer here keeps commit-path latency tiny regardless of how heavy the
 * eventual processor becomes.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  enqueueProcess(params: {
    kind: 'company-logo' | 'trainer-avatar' | 'trainer-asset';
    objectKey: string;
    mimeType: string;
    entityId: string;
  }): void {
    // The full worker pulls the object, re-encodes with sharp, writes
    // /variants/64, /variants/128, /variants/512 next to the original, and
    // updates the owning entity's url field to the 512px variant. That is
    // intentionally deferred until a dedicated BullMQ worker PR — for now we
    // just record intent.
    this.logger.debug(
      `image-process enqueued: kind=${params.kind} key=${params.objectKey} mime=${params.mimeType}`,
    );
  }
}
