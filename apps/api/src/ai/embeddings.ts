import { resolve } from 'node:path';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

/** Vector dimension of the `vector(384)` columns. Changing it requires a migration. */
export const EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  /** Embeds documents (profiles, resumes, job descriptions). Returns L2-normalized vectors. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embeds a short search query. Returns an L2-normalized vector. */
  embedQuery(text: string): Promise<number[]>;
}

/** Roughly 350 tokens per chunk — comfortably inside the model's 512-token window. */
const CHUNK_CHARS = 1400;
const MAX_CHUNKS = 12;

/**
 * bge-small-en-v1.5 running locally through ONNX Runtime.
 *
 * bge is an asymmetric retrieval model: short queries get an instruction prefix, documents do not.
 * Documents longer than one window are split on paragraph boundaries and mean-pooled.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local:bge-small-en-v1.5';
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private static readonly MODEL = 'Xenova/bge-small-en-v1.5';
  private static readonly QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
  private extractor: Promise<FeatureExtractionPipeline> | null = null;

  constructor(private readonly cacheDir: string) {}

  private load(): Promise<FeatureExtractionPipeline> {
    this.extractor ??= (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = resolve(this.cacheDir);
      const extractor = await pipeline('feature-extraction', LocalEmbeddingProvider.MODEL, {
        dtype: 'q8',
      });
      return extractor as FeatureExtractionPipeline;
    })().catch((error: unknown) => {
      this.extractor = null;
      throw error;
    });
    return this.extractor;
  }

  /** Pre-loads the model so the first request does not pay the start-up cost. */
  async warmUp(): Promise<void> {
    await this.load();
  }

  private async embedRaw(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    const output = await extractor(texts, { pooling: 'cls', normalize: true });
    return output.tolist() as number[][];
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedRaw([LocalEmbeddingProvider.QUERY_PREFIX + text.slice(0, 1000)]);
    if (!vector) throw new Error('Embedding model returned no vector');
    return vector;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const chunks = chunkText(text, CHUNK_CHARS).slice(0, MAX_CHUNKS);
      const vectors = await this.embedRaw(chunks.length ? chunks : [' ']);
      results.push(meanPool(vectors));
    }
    return results;
  }
}

/** Splits on paragraph, then sentence boundaries, packing pieces up to `size` characters. */
export function chunkText(text: string, size: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= size) return normalized ? [normalized] : [];

  const pieces = normalized
    .split(/\n{2,}/)
    .flatMap((p) => (p.length <= size ? [p] : p.split(/(?<=[.!?])\s+|\n/)))
    .flatMap((p) => (p.length <= size ? [p] : p.match(new RegExp(`.{1,${size}}`, 'gs')) ?? []));

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current}\n${piece}` : piece;
    if (candidate.length > size && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export function meanPool(vectors: number[][]): number[] {
  const first = vectors[0];
  if (!first) throw new Error('Cannot pool zero vectors');
  const sum = new Array<number>(first.length).fill(0);
  for (const vector of vectors) for (let i = 0; i < vector.length; i++) sum[i]! += vector[i]!;
  return l2Normalize(sum.map((v) => v / vectors.length));
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** pgvector literal, e.g. "[0.1,0.2]". Values are numbers we produced, never user input. */
export function toVectorLiteral(vector: readonly number[]): string {
  if (vector.length !== EMBEDDING_DIMENSIONS || vector.some((v) => !Number.isFinite(v))) {
    throw new Error(`Invalid embedding: expected ${EMBEDDING_DIMENSIONS} finite numbers`);
  }
  return `[${vector.join(',')}]`;
}
