import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type GenerateContractDocumentParsed,
  type SignContractDocumentInput,
  type DeclineContractDocumentInput,
  type SignatureRole,
  renderTemplate,
  TemplateRenderError,
} from '@trainova/shared';
import type { TemplateVariable } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/** SHA-256 hex of the exact UTF-8 body bytes. */
export function hashDocumentBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

@Injectable()
export class ContractDocumentsService {
  private readonly logger = new Logger(ContractDocumentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Caller must be the company owner on the contract or platform admin. */
  async generate(actorId: string, input: GenerateContractDocumentParsed) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: input.contractId },
      select: {
        id: true,
        trainerId: true,
        status: true,
        company: { select: { ownerId: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const companyOwnerId = contract.company.ownerId;
    await this.assertActorCanAuthorOnContract(actorId, companyOwnerId);

    let body = input.bodyMarkdown ?? '';
    let templateRecord: { id: string } | null = null;
    if (input.templateId) {
      const t = await this.prisma.contractTemplate.findUnique({
        where: { id: input.templateId },
        select: { id: true, bodyMarkdown: true, variables: true, status: true },
      });
      if (!t) throw new NotFoundException('Template not found');
      if (t.status !== 'PUBLISHED') {
        throw new BadRequestException('Template is not published');
      }
      templateRecord = t;
      try {
        body = renderTemplate(
          t.bodyMarkdown,
          (t.variables as unknown as TemplateVariable[]) ?? [],
          input.variables ?? {},
        );
      } catch (err) {
        if (err instanceof TemplateRenderError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }
    }
    if (!body || body.trim().length < 20) {
      throw new BadRequestException('Document body is too short');
    }

    const bodyHash = hashDocumentBody(body);
    const document = await this.prisma.contractDocument.create({
      data: {
        contractId: contract.id,
        templateId: templateRecord?.id ?? null,
        kind: input.kind,
        title: input.title,
        bodyMarkdown: body,
        bodyHash,
        status: 'AWAITING_SIGNATURES',
        createdById: actorId,
        expiresAt: input.expiresAt ?? null,
        signatures: {
          createMany: {
            data: [
              { signerId: companyOwnerId, role: 'COMPANY' },
              { signerId: contract.trainerId, role: 'TRAINER' },
            ],
          },
        },
      },
      include: { signatures: true },
    });
    this.logger.log(
      `Document generated id=${document.id} contract=${contract.id} kind=${input.kind} actor=${actorId}`,
    );
    return document;
  }

  async listForContract(actorId: string, contractId: string) {
    await this.assertActorCanReadContract(actorId, contractId);
    return this.prisma.contractDocument.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      include: { signatures: true },
    });
  }

  async get(actorId: string, id: string) {
    const doc = await this.prisma.contractDocument.findUnique({
      where: { id },
      include: {
        signatures: true,
        contract: { include: { company: { select: { ownerId: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertActorCanReadContract(actorId, doc.contractId);
    // Mutation guard: if the body was tampered with after generation we
    // refuse to surface signatures. The hash stored at generation time is
    // the source of truth.
    const computed = hashDocumentBody(doc.bodyMarkdown);
    let viewerRole: SignatureRole | null = null;
    if (doc.contract.company.ownerId === actorId) viewerRole = 'COMPANY';
    else if (doc.contract.trainerId === actorId) viewerRole = 'TRAINER';
    const { contract: _contract, ...rest } = doc;
    return { ...rest, hashValid: computed === doc.bodyHash, viewerRole };
  }

  async sign(
    actorId: string,
    documentId: string,
    input: SignContractDocumentInput,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const document = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
      include: {
        signatures: true,
        contract: { include: { company: { select: { ownerId: true } } } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.status === 'CANCELLED' || document.status === 'EXPIRED') {
      throw new BadRequestException('Document is no longer signable');
    }
    if (document.expiresAt && document.expiresAt.getTime() < Date.now()) {
      await this.prisma.contractDocument.update({
        where: { id: documentId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Document has expired');
    }
    // Mutation guard.
    if (hashDocumentBody(document.bodyMarkdown) !== document.bodyHash) {
      throw new BadRequestException('Document body hash mismatch — refusing to sign');
    }
    const role = this.resolveSignerRole(actorId, document);
    const row = document.signatures.find((s) => s.role === role);
    if (!row) throw new ForbiddenException('You are not a signer on this document');
    if (row.status === 'SIGNED') {
      throw new BadRequestException('You have already signed this document');
    }
    if (row.status === 'DECLINED') {
      throw new BadRequestException('You have already declined this document');
    }
    if (input.signedName.trim().length < 2) {
      throw new BadRequestException('Typed name is required');
    }

    const signatureHash = createHash('sha256')
      .update(
        `${document.bodyHash}:${role}:${actorId}:${input.signedName.trim()}:${input.intent.trim()}`,
        'utf8',
      )
      .digest('hex');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedRow = await tx.contractSignature.update({
        where: { documentId_role: { documentId, role } },
        data: {
          status: 'SIGNED',
          signedName: input.signedName.trim(),
          intent: input.intent.trim(),
          signatureHash,
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          signedAt: new Date(),
        },
      });
      const refreshed = await tx.contractSignature.findMany({
        where: { documentId },
        select: { role: true, status: true },
      });
      const allSigned =
        refreshed.length > 0 && refreshed.every((s) => s.status === 'SIGNED');
      const someSigned = refreshed.some((s) => s.status === 'SIGNED');
      const nextStatus = allSigned
        ? 'FULLY_SIGNED'
        : someSigned
          ? 'PARTIALLY_SIGNED'
          : 'AWAITING_SIGNATURES';
      const updatedDoc = await tx.contractDocument.update({
        where: { id: documentId },
        data: {
          status: nextStatus,
          signedAt: allSigned ? new Date() : null,
        },
      });
      return { row: updatedRow, document: updatedDoc };
    });
    this.logger.log(
      `Signature stored doc=${documentId} role=${role} signer=${actorId} status=${result.document.status}`,
    );
    return result;
  }

  async decline(
    actorId: string,
    documentId: string,
    input: DeclineContractDocumentInput,
  ) {
    const document = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
      include: {
        signatures: true,
        contract: { include: { company: { select: { ownerId: true } } } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.status === 'CANCELLED' || document.status === 'EXPIRED') {
      throw new BadRequestException('Document is no longer signable');
    }
    const role = this.resolveSignerRole(actorId, document);
    const row = document.signatures.find((s) => s.role === role);
    if (!row) throw new ForbiddenException('You are not a signer on this document');
    if (row.status === 'SIGNED') {
      throw new BadRequestException('Cannot decline after signing');
    }
    if (row.status === 'DECLINED') {
      throw new BadRequestException('Already declined');
    }
    const reason = (input.reason ?? '').trim();
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedRow = await tx.contractSignature.update({
        where: { documentId_role: { documentId, role } },
        data: {
          status: 'DECLINED',
          declineReason: reason.length > 0 ? reason : null,
          declinedAt: new Date(),
        },
      });
      const updatedDoc = await tx.contractDocument.update({
        where: { id: documentId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return { row: updatedRow, document: updatedDoc };
    });
    this.logger.log(
      `Document declined doc=${documentId} role=${role} signer=${actorId}`,
    );
    return result;
  }

  private resolveSignerRole(
    actorId: string,
    document: {
      contract: { trainerId: string; company: { ownerId: string } };
    },
  ): SignatureRole {
    if (document.contract.company.ownerId === actorId) return 'COMPANY';
    if (document.contract.trainerId === actorId) return 'TRAINER';
    throw new ForbiddenException('You are not a party to this contract');
  }

  private async assertActorCanReadContract(actorId: string, contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        trainerId: true,
        company: { select: { ownerId: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (
      contract.company.ownerId !== actorId &&
      contract.trainerId !== actorId
    ) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { role: true },
      });
      if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN')) {
        throw new ForbiddenException('Not a party to this contract');
      }
    }
  }

  /** `companyOwnerId` is the User.id of the Company's owner. */
  private async assertActorCanAuthorOnContract(
    actorId: string,
    companyOwnerId: string,
  ) {
    if (companyOwnerId === actorId) return;
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });
    if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN')) {
      throw new ForbiddenException('Only the company owner can author a document');
    }
  }
}
