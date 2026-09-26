import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CandidateFixture } from '@hireflow/database/seed';

/**
 * Renders a demo resume fixture into a text-based PDF with a conventional single-column layout.
 * Used by the seed and by tests to exercise the real upload → parse pipeline.
 */

const PAGE = { width: 612, height: 792, margin: 54 };
const COLORS = {
  text: rgb(0.1, 0.1, 0.12),
  muted: rgb(0.35, 0.35, 0.4),
  accent: rgb(0.31, 0.27, 0.9),
};

class Writer {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  private ensure(height: number): void {
    if (this.y - height < PAGE.margin) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - PAGE.margin;
    }
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  line(
    text: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {},
  ): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const indent = options.indent ?? 0;
    const width = PAGE.width - PAGE.margin * 2 - indent;
    for (const part of this.wrap(text, font, size, width)) {
      this.ensure(size + 4);
      this.page.drawText(part, {
        x: PAGE.margin + indent,
        y: this.y - size,
        size,
        font,
        color: options.color ?? COLORS.text,
      });
      this.y -= size + 4;
    }
    this.y -= options.gap ?? 0;
  }

  space(points: number): void {
    this.y -= points;
  }

  heading(text: string): void {
    this.y -= 8;
    this.line(text.toUpperCase(), { size: 11, bold: true, color: COLORS.accent, gap: 2 });
  }

  bullet(text: string): void {
    this.line(`• ${text}`, { indent: 10 });
  }
}

export async function renderResumePdf(candidate: CandidateFixture): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${candidate.firstName} ${candidate.lastName} — Resume`);
  doc.setAuthor('HireFlow AI demo data');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold);

  w.line(`${candidate.firstName} ${candidate.lastName}`, { size: 20, bold: true, gap: 2 });
  w.line(candidate.headline, { size: 12, color: COLORS.muted });
  w.line([candidate.email, candidate.phone, candidate.location].join(' | '), {
    size: 9,
    color: COLORS.muted,
  });
  if (candidate.links.length) w.line(candidate.links.join(' | '), { size: 9, color: COLORS.muted });

  w.heading('Summary');
  w.line(candidate.summary);

  w.heading('Experience');
  for (const exp of candidate.experience) {
    w.line(`${exp.title} — ${exp.company} | ${exp.start} – ${exp.end}`, { bold: true });
    for (const bullet of exp.bullets) w.bullet(bullet);
    w.line('', { size: 2 });
  }

  w.heading('Education');
  for (const edu of candidate.education) {
    w.line(`${edu.degree} — ${edu.institution} | ${edu.start} – ${edu.end}`, { bold: true });
    if (edu.grade) w.line(edu.grade);
  }

  w.heading('Skills');
  for (const group of candidate.skills) w.line(`${group.label}: ${group.items.join(', ')}`);

  if (candidate.projects.length) {
    w.heading('Projects');
    for (const project of candidate.projects) w.line(`${project.name} — ${project.description}`);
  }

  if (candidate.certifications.length) {
    w.heading('Certifications');
    for (const cert of candidate.certifications) w.bullet(cert);
  }

  return Buffer.from(await doc.save());
}
