import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import type {
  InvoiceKind,
  InvoiceLineItem,
  InvoiceListQuery,
  PublicInvoice,
} from '@trainova/shared';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { renderInvoicePdf } from './invoice.renderer';

type ContractFull = Prisma.ContractGetPayload<{
  include: {
    company: { include: { owner: { include: { taxProfile: true } } } };
    trainer: { include: { taxProfile: true } };
  };
}>;

type MilestoneFull = Prisma.MilestoneGetPayload<{
  include: { contract: true };
}>;

type PayoutFull = Prisma.PayoutGetPayload<{
  include: {
    milestone: { include: { contract: { include: { company: true } } } };
    user: { include: { taxProfile: true } };
  };
}>;

type InvoiceRow = Prisma.InvoiceGetPayload<Record<string, never>>;

/**
 * Issues invoices for milestone funding (PURCHASE) and milestone
 * release (PAYOUT_STATEMENT).
 *
 * Numbering is sequential YYYY-NNNNNN, minted inside a `$transaction`
 * using `InvoiceCounter` row locks so two concurrent issuances can
 * never collide. A unique constraint on `Invoice.number` is the last
 * line of defence.
 *
 * Invoice issuance is idempotent per (kind, milestoneId/payoutId): if
 * an ISSUED row already exists for the key, it is returned unchanged
 * rather than producing a duplicate document.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===================================================================
  // Issuance
  // ===================================================================

  async issueForMilestoneFunding(milestoneId: string): Promise<PublicInvoice> {
    const milestone = await this.loadMilestone(milestoneId);
    const existing = await this.prisma.invoice.findFirst({
      where: {
        milestoneId,
        kind: 'PURCHASE',
        status: { not: 'VOID' },
      },
    });
    if (existing) return toPublic(existing);

    const contract = await this.loadContract(milestone.contractId);
    const companyOwner = contract.company.owner;
    const trainer = contract.trainer;

    const subtotal = milestone.subtotalCents || milestone.amountCents;
    const tax = milestone.taxAmountCents;
    const total = milestone.amountCents;

    const lineItems: InvoiceLineItem[] = [
      {
        description: `${contract.title} — ${milestone.title}`,
        quantity: 1,
        unitCents: subtotal,
        totalCents: subtotal,
      },
    ];

    return this.create({
      kind: 'PURCHASE',
      contractId: contract.id,
      milestoneId: milestone.id,
      payoutId: null,
      // Seller of record for a buyer-paid milestone is the platform
      // (Trainova AI) on behalf of the trainer. We use the trainer as
      // the issuer for legal clarity so the invoice doubles as a
      // self-billing-agreement artifact if needed.
      issuerName: trainer.name,
      issuerCountry: trainer.taxProfile?.countryCode ?? null,
      issuerTaxId: trainer.taxProfile?.taxId ?? null,
      issuerAddress: formatAddress(trainer.taxProfile),
      recipientName: contract.company.name,
      recipientCountry: companyOwner.taxProfile?.countryCode ?? contract.company.country ?? null,
      recipientTaxId: companyOwner.taxProfile?.taxId ?? null,
      recipientAddress: formatAddress(companyOwner.taxProfile),
      currency: contract.currency,
      subtotalCents: subtotal,
      taxRateBps: contract.taxRateBps,
      taxAmountCents: tax,
      totalCents: total,
      taxLabel: contract.taxLabel,
      taxNote: contract.taxNote,
      reverseCharge: contract.reverseCharge,
      lineItems,
      notes: null,
    });
  }

  async issueForPayout(payoutId: string): Promise<PublicInvoice> {
    const payout = await this.loadPayout(payoutId);
    const existing = await this.prisma.invoice.findFirst({
      where: {
        payoutId,
        kind: 'PAYOUT_STATEMENT',
        status: { not: 'VOID' },
      },
    });
    if (existing) return toPublic(existing);

    const contract = payout.milestone?.contract;
    const recipient = payout.user;
    const currency = payout.currency;

    const lineItems: InvoiceLineItem[] = [
      {
        description: contract
          ? `${contract.title} — milestone payout`
          : 'Milestone payout',
        quantity: 1,
        unitCents: payout.grossAmountCents || payout.amountCents,
        totalCents: payout.grossAmountCents || payout.amountCents,
      },
    ];
    if (payout.feeAmountCents > 0) {
      lineItems.push({
        description: 'Platform service fee',
        quantity: 1,
        unitCents: -payout.feeAmountCents,
        totalCents: -payout.feeAmountCents,
      });
    }

    // Payout statements are always tax-exempt from the platform side —
    // the trainer is responsible for declaring income tax under their
    // local regime. We keep `taxRateBps=0` and emit a note for clarity.
    return this.create({
      kind: 'PAYOUT_STATEMENT',
      contractId: contract?.id ?? null,
      milestoneId: payout.milestoneId,
      payoutId: payout.id,
      issuerName: 'Trainova AI',
      issuerCountry: null,
      issuerTaxId: null,
      issuerAddress: null,
      recipientName: recipient.name,
      recipientCountry: recipient.taxProfile?.countryCode ?? null,
      recipientTaxId: recipient.taxProfile?.taxId ?? null,
      recipientAddress: formatAddress(recipient.taxProfile),
      currency,
      subtotalCents:
        (payout.grossAmountCents || payout.amountCents) - payout.feeAmountCents,
      taxRateBps: 0,
      taxAmountCents: 0,
      totalCents: payout.amountCents,
      taxLabel: null,
      taxNote:
        'Recipient is responsible for declaring this payout under their local income tax regime.',
      reverseCharge: false,
      lineItems,
      notes: null,
    });
  }

  // ===================================================================
  // Reads — scoped to the caller's role
  // ===================================================================

  async listForCompanyOwner(
    userId: string,
    query: InvoiceListQuery,
  ): Promise<{ items: PublicInvoice[]; nextCursor: string | null }> {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!company) return { items: [], nextCursor: null };

    const limit = Math.min(query.limit ?? 20, 100);
    const rows = await this.prisma.invoice.findMany({
      where: {
        kind: query.kind ?? 'PURCHASE',
        status: query.status ?? undefined,
        contract: { companyId: company.id },
      },
      orderBy: { issuedAt: 'desc' },
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });
    return paginate(rows, limit);
  }

  async listForTrainer(
    userId: string,
    query: InvoiceListQuery,
  ): Promise<{ items: PublicInvoice[]; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? 20, 100);
    const rows = await this.prisma.invoice.findMany({
      where: {
        kind: query.kind ?? 'PAYOUT_STATEMENT',
        status: query.status ?? undefined,
        payout: { userId },
      },
      orderBy: { issuedAt: 'desc' },
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });
    return paginate(rows, limit);
  }

  async getForActor(
    actorId: string,
    invoiceId: string,
    role: 'company' | 'trainer' | 'admin',
  ): Promise<PublicInvoice> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: { select: { companyId: true, trainerId: true } },
        payout: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException('Invoice not found');

    if (role === 'admin') return toPublic(row);

    if (role === 'company') {
      const company = await this.prisma.company.findUnique({
        where: { ownerId: actorId },
        select: { id: true },
      });
      if (!company || row.contract?.companyId !== company.id) {
        throw new ForbiddenException('Not authorized for this invoice');
      }
      return toPublic(row);
    }

    // trainer
    if (row.kind === 'PAYOUT_STATEMENT' && row.payout?.userId === actorId) {
      return toPublic(row);
    }
    if (row.kind === 'PURCHASE' && row.contract?.trainerId === actorId) {
      return toPublic(row);
    }
    throw new ForbiddenException('Not authorized for this invoice');
  }

  async renderPdf(invoice: PublicInvoice): Promise<Readable> {
    return renderInvoicePdf(invoice);
  }

  // ===================================================================
  // Internals
  // ===================================================================

  private async create(input: {
    kind: InvoiceKind;
    contractId: string | null;
    milestoneId: string | null;
    payoutId: string | null;
    issuerName: string;
    issuerCountry: string | null;
    issuerTaxId: string | null;
    issuerAddress: string | null;
    recipientName: string;
    recipientCountry: string | null;
    recipientTaxId: string | null;
    recipientAddress: string | null;
    currency: string;
    subtotalCents: number;
    taxRateBps: number;
    taxAmountCents: number;
    totalCents: number;
    taxLabel: string | null;
    taxNote: string | null;
    reverseCharge: boolean;
    lineItems: InvoiceLineItem[];
    notes: string | null;
  }): Promise<PublicInvoice> {
    const year = new Date().getUTCFullYear();

    const row = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { year },
        create: { year, lastSeq: 1 },
        update: { lastSeq: { increment: 1 } },
      });
      const number = `${year}-${counter.lastSeq.toString().padStart(6, '0')}`;
      return tx.invoice.create({
        data: {
          number,
          kind: input.kind,
          contractId: input.contractId,
          milestoneId: input.milestoneId,
          payoutId: input.payoutId,
          issuerName: input.issuerName,
          issuerCountry: input.issuerCountry,
          issuerTaxId: input.issuerTaxId,
          issuerAddress: input.issuerAddress,
          recipientName: input.recipientName,
          recipientCountry: input.recipientCountry,
          recipientTaxId: input.recipientTaxId,
          recipientAddress: input.recipientAddress,
          currency: input.currency,
          subtotalCents: input.subtotalCents,
          taxRateBps: input.taxRateBps,
          taxAmountCents: input.taxAmountCents,
          totalCents: input.totalCents,
          taxLabel: input.taxLabel,
          taxNote: input.taxNote,
          reverseCharge: input.reverseCharge,
          lineItemsJson: input.lineItems as unknown as Prisma.InputJsonValue,
          notes: input.notes,
        },
      });
    });

    this.logger.log(
      `Invoice ${row.number} issued (${row.kind}) total=${row.totalCents}${row.currency}`,
    );
    return toPublic(row);
  }

  private async loadMilestone(id: string): Promise<MilestoneFull> {
    const m = await this.prisma.milestone.findUnique({
      where: { id },
      include: { contract: true },
    });
    if (!m) throw new NotFoundException('Milestone not found');
    return m;
  }

  private async loadContract(id: string): Promise<ContractFull> {
    const c = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        company: { include: { owner: { include: { taxProfile: true } } } },
        trainer: { include: { taxProfile: true } },
      },
    });
    if (!c) throw new NotFoundException('Contract not found');
    return c;
  }

  private async loadPayout(id: string): Promise<PayoutFull> {
    const p = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        milestone: { include: { contract: { include: { company: true } } } },
        user: { include: { taxProfile: true } },
      },
    });
    if (!p) throw new NotFoundException('Payout not found');
    return p;
  }
}

// ===========================================================================
// Helpers
// ===========================================================================

function paginate(
  rows: InvoiceRow[],
  limit: number,
): { items: PublicInvoice[]; nextCursor: string | null } {
  const extra = rows.length > limit ? rows[limit] : null;
  const nextCursor = extra?.id ?? null;
  return {
    items: rows.slice(0, limit).map(toPublic),
    nextCursor,
  };
}

function toPublic(row: InvoiceRow): PublicInvoice {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    contractId: row.contractId,
    milestoneId: row.milestoneId,
    payoutId: row.payoutId,
    issuerName: row.issuerName,
    issuerCountry: row.issuerCountry,
    issuerTaxId: row.issuerTaxId,
    issuerAddress: row.issuerAddress,
    recipientName: row.recipientName,
    recipientCountry: row.recipientCountry,
    recipientTaxId: row.recipientTaxId,
    recipientAddress: row.recipientAddress,
    currency: row.currency,
    subtotalCents: row.subtotalCents,
    taxRateBps: row.taxRateBps,
    taxAmountCents: row.taxAmountCents,
    totalCents: row.totalCents,
    taxLabel: row.taxLabel,
    taxNote: row.taxNote,
    reverseCharge: row.reverseCharge,
    lineItems: Array.isArray(row.lineItemsJson)
      ? (row.lineItemsJson as unknown as InvoiceLineItem[])
      : [],
    issuedAt: row.issuedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    replacesInvoiceId: row.replacesInvoiceId,
    notes: row.notes,
  };
}

function formatAddress(
  profile:
    | {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        region: string | null;
        postalCode: string | null;
        countryCode: string;
      }
    | null
    | undefined,
): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.addressLine1) parts.push(profile.addressLine1);
  if (profile.addressLine2) parts.push(profile.addressLine2);
  const cityLine = [profile.city, profile.region, profile.postalCode]
    .filter(Boolean)
    .join(' ');
  if (cityLine) parts.push(cityLine);
  if (profile.countryCode) parts.push(profile.countryCode);
  return parts.length ? parts.join('\n') : null;
}
