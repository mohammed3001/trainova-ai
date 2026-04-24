import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface SkillRow {
  level: string | null;
  yearsExperience: number | null;
  skill: { nameEn: string; nameAr: string; slug: string };
}

interface AssetRow {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  mimeType: string;
}

export interface TrainerCvPayload {
  slug: string;
  headline: string | null;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone: string | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  responseTimeHours: number | null;
  availability: string | null;
  verified: boolean;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  user: { id: string; name: string; createdAt: Date };
  skills: SkillRow[];
  assets: AssetRow[];
}

/**
 * Streams a clean, single-column PDF CV for a trainer profile. Kept intentionally
 * simple (Helvetica, no embedded images) so it renders consistently across print
 * engines and stays under ~40 KB.
 */
export function renderTrainerCvPdf(t: TrainerCvPayload): Readable {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `${t.user.name} — Trainova AI CV`,
      Author: t.user.name,
      Subject: t.headline ?? 'AI training specialist',
    },
  });

  const brand = '#4f46e5';
  const muted = '#64748b';
  const ink = '#0f172a';
  const line = '#e2e8f0';

  const drawRule = () => {
    doc
      .moveTo(doc.page.margins.left, doc.y + 4)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
      .lineWidth(0.5)
      .strokeColor(line)
      .stroke();
    doc.moveDown(0.8);
  };

  // Header
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(24).text(t.user.name);
  if (t.headline) {
    doc.moveDown(0.2);
    doc.fillColor(brand).font('Helvetica').fontSize(12).text(t.headline);
  }

  const metaBits: string[] = [];
  if (t.country) metaBits.push(t.country);
  if (t.languages.length) metaBits.push(t.languages.join(' · '));
  if (t.timezone) metaBits.push(t.timezone);
  if (metaBits.length) {
    doc.moveDown(0.2);
    doc.fillColor(muted).fontSize(10).text(metaBits.join('  ·  '));
  }

  const contact: string[] = [];
  if (t.linkedinUrl) contact.push(t.linkedinUrl);
  if (t.githubUrl) contact.push(t.githubUrl);
  if (t.websiteUrl) contact.push(t.websiteUrl);
  if (contact.length) {
    doc.moveDown(0.3);
    doc.fillColor(muted).fontSize(9).text(contact.join('  ·  '));
  }

  if (t.verified) {
    doc.moveDown(0.3);
    doc.fillColor(brand).fontSize(9).text('✓ Verified trainer on Trainova AI');
  }

  doc.moveDown(0.6);
  drawRule();

  // Summary
  if (t.bio) {
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Summary');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(ink).text(t.bio, { align: 'left' });
    doc.moveDown(0.6);
    drawRule();
  }

  // Skills
  if (t.skills.length) {
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Skills');
    doc.moveDown(0.3);
    for (const s of t.skills) {
      const line1 = s.skill.nameEn;
      const meta: string[] = [];
      if (s.level) meta.push(s.level);
      if (s.yearsExperience) meta.push(`${s.yearsExperience}y`);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(ink)
        .text(line1, { continued: meta.length > 0 });
      if (meta.length) {
        doc.font('Helvetica').fillColor(muted).text(`  —  ${meta.join(' · ')}`);
      } else {
        doc.text('');
      }
    }
    doc.moveDown(0.4);
    drawRule();
  }

  // Rate & availability
  const rateParts: string[] = [];
  if (t.hourlyRateMin != null || t.hourlyRateMax != null) {
    rateParts.push(`Rate: $${t.hourlyRateMin ?? 0}–$${t.hourlyRateMax ?? 0} / hr`);
  }
  if (t.responseTimeHours != null) rateParts.push(`Response: ≤ ${t.responseTimeHours}h`);
  if (t.availability) rateParts.push(`Availability: ${t.availability}`);
  if (rateParts.length) {
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Engagement');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(ink);
    for (const part of rateParts) doc.text(part);
    doc.moveDown(0.4);
    drawRule();
  }

  // Portfolio
  const portfolio = t.assets.filter((a) => a.kind === 'portfolio');
  if (portfolio.length) {
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Portfolio');
    doc.moveDown(0.3);
    for (const a of portfolio) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(ink)
        .text(a.title ?? 'Untitled', { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(`   ${a.url}`);
    }
    doc.moveDown(0.4);
    drawRule();
  }

  // Certifications
  const certs = t.assets.filter((a) => a.kind === 'certificate');
  if (certs.length) {
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Certifications');
    doc.moveDown(0.3);
    for (const a of certs) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(ink)
        .text(a.title ?? a.url);
    }
    doc.moveDown(0.4);
    drawRule();
  }

  // Footer
  doc
    .fillColor(muted)
    .fontSize(8)
    .text(`Generated from trainova.ai/trainers/${t.slug}`, {
      align: 'center',
    });

  doc.end();
  return doc as unknown as Readable;
}
