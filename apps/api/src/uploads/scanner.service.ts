import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ScanVerdict = 'pending' | 'clean' | 'infected';

/**
 * Abstraction for the managed malware scanner that will later wrap e.g.
 * Cloudmersive. PR B1 ships the stub impl: it runs the scan asynchronously
 * via `setImmediate` so the caller (commit) can return without waiting on the
 * network, and marks every file `clean` after a simulated delay.
 *
 * Keeping the entry point (`enqueueScan`) stable means the real managed
 * scanner can be wired in later without touching callers.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  enqueueScan(params: { attachmentId: string; objectKey: string; mimeType: string }): void {
    // setImmediate keeps this out of the current request path without needing
    // a full Redis/BullMQ setup in PR B1. Replace with a BullMQ producer once
    // the worker infra lands.
    setImmediate(() => {
      void this.runStubScan(params.attachmentId, params.objectKey);
    });
  }

  private async runStubScan(attachmentId: string, objectKey: string): Promise<void> {
    try {
      // Simulate network latency without blocking the request path.
      await new Promise((r) => setTimeout(r, 100));
      const verdict: ScanVerdict = 'clean';
      await this.prisma.applicationAttachment.update({
        where: { id: attachmentId },
        data: { scanStatus: verdict },
      });
      this.logger.debug(`scanned ${objectKey} -> ${verdict}`);
    } catch (err) {
      // Swallow: the scan can be retried via an admin tool later; we never
      // want a scanner crash to take down the API process.
      this.logger.error(`stub scan failed for ${objectKey}`, err as Error);
    }
  }
}
