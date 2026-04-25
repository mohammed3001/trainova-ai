import { Injectable, Logger } from '@nestjs/common';
import type {
  AdvertiseEnquiryParsed,
  ContactSubmissionParsed,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submit(
    input: ContactSubmissionParsed,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const row = await this.prisma.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        topic: input.topic,
        company: input.company ?? null,
        message: input.message,
        locale: input.locale ?? null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
      select: { id: true },
    });
    this.logger.log(
      `Contact submission stored id=${row.id} topic=${input.topic} email=${input.email}`,
    );
    return row;
  }

  async submitAdvertiseEnquiry(
    input: AdvertiseEnquiryParsed,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const messageWithMeta = [
      `Package: ${input.packageId}`,
      input.budgetUsd != null ? `Budget (USD): ${input.budgetUsd}` : null,
      '',
      input.message,
    ]
      .filter((s) => s !== null)
      .join('\n');
    const row = await this.prisma.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        topic: 'ADVERTISING',
        company: input.company,
        message: messageWithMeta,
        locale: input.locale ?? null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
      select: { id: true },
    });
    this.logger.log(
      `Advertise enquiry stored id=${row.id} package=${input.packageId} email=${input.email}`,
    );
    return row;
  }
}
