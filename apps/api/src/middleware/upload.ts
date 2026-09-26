import type { RequestHandler } from 'express';
import multer from 'multer';
import { UnsupportedMediaTypeError, ValidationError } from '../lib/errors';
import { isPdf } from '../lib/pdf';

export const ALLOWED_RESUME_MIME_TYPES = ['application/pdf'] as const;

/**
 * Single-file resume upload held in memory (size-capped) so it can be validated before it is
 * written anywhere. The declared MIME type and extension are checked here; the PDF signature is
 * verified by `assertPdfUpload` because clients can lie about both.
 */
export function resumeUpload(maxBytes: number): RequestHandler {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5 },
    fileFilter: (_req, file, callback) => {
      const extensionOk = /\.pdf$/i.test(file.originalname);
      const mimeOk = (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(file.mimetype);
      if (!extensionOk || !mimeOk) {
        callback(new UnsupportedMediaTypeError('Only PDF resumes are supported'));
        return;
      }
      callback(null, true);
    },
  }).single('file');
}

export function assertPdfUpload(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new ValidationError('Attach a PDF file in the "file" field');
  if (file.size === 0) throw new ValidationError('The uploaded file is empty');
  if (!isPdf(file.buffer)) throw new UnsupportedMediaTypeError('The file is not a valid PDF');
  return file;
}

/** Strips path components and unsafe characters from a client-supplied file name. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'resume.pdf';
  const cleaned = base
    .replace(/[^\w.\- ()]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'resume.pdf').slice(0, 120);
}
