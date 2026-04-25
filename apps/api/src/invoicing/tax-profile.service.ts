import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTaxProfile, TaxProfileInput } from '@trainova/shared';
import { taxProfileInputSchema } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<PublicTaxProfile | null> {
    const row = await this.prisma.taxProfile.findUnique({ where: { userId } });
    return row ? toPublic(row) : null;
  }

  async upsert(
    userId: string,
    input: TaxProfileInput,
  ): Promise<PublicTaxProfile> {
    const data = taxProfileInputSchema.parse(input);
    const row = await this.prisma.taxProfile.upsert({
      where: { userId },
      create: {
        userId,
        countryCode: data.countryCode.toUpperCase(),
        kind: data.kind,
        legalName: data.legalName ?? null,
        taxId: data.taxId ?? null,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        postalCode: data.postalCode ?? null,
      },
      update: {
        countryCode: data.countryCode.toUpperCase(),
        kind: data.kind,
        legalName: data.legalName ?? null,
        // Resetting the taxId invalidates prior verification.
        taxId: data.taxId ?? null,
        taxIdVerified: false,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        postalCode: data.postalCode ?? null,
      },
    });
    return toPublic(row);
  }

  async adminVerify(userId: string, verified: boolean): Promise<PublicTaxProfile> {
    const row = await this.prisma.taxProfile.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('Tax profile not found');
    const updated = await this.prisma.taxProfile.update({
      where: { userId },
      data: { taxIdVerified: verified },
    });
    return toPublic(updated);
  }
}

function toPublic(r: {
  countryCode: string;
  kind: string;
  legalName: string | null;
  taxId: string | null;
  taxIdVerified: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
}): PublicTaxProfile {
  return {
    countryCode: r.countryCode,
    kind: r.kind as PublicTaxProfile['kind'],
    legalName: r.legalName,
    taxId: r.taxId,
    taxIdVerified: r.taxIdVerified,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    region: r.region,
    postalCode: r.postalCode,
  };
}
