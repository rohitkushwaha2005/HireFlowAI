import { extractText, getDocumentProxy } from 'unpdf';

export const PDF_MAGIC = Buffer.from('%PDF-');

/** Validates the file signature rather than trusting the client-provided MIME type. */
export function isPdf(buffer: Buffer): boolean {
  return buffer.length > PDF_MAGIC.length && buffer.subarray(0, 1024).includes(PDF_MAGIC);
}

export interface ExtractedPdf {
  text: string;
  pages: number;
}

/** Hard cap on characters kept from a resume; real resumes are far below this. */
export const MAX_RESUME_CHARS = 60_000;

export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const cleaned = pages
    .map((page) =>
      page
        .replaceAll('\u0000', '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .join('\n\n')
    .slice(0, MAX_RESUME_CHARS);
  return { text: cleaned, pages: totalPages };
}
