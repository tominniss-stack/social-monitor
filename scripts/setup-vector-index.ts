/**
 * Creates the HNSW cosine index on `Comment.embedding`.
 *
 * The column is `Unsupported("vector(1536)")` and the project uses
 * `prisma db push` (no migration files), so Prisma cannot manage this index.
 * Run after `npm run db:push`:
 *
 *   npm run db:vector-index
 *
 * Idempotent (IF NOT EXISTS). Logs and exits 0 if pgvector / HNSW is
 * unavailable so it is safe in environments without the extension.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (err) {
    console.warn('[vector-index] Could not ensure pgvector extension (may already exist / insufficient privileges):', errMessage(err));
  }

  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS comment_embedding_hnsw_idx ON "Comment" USING hnsw (embedding vector_cosine_ops)`
    );
    console.log('[vector-index] OK: comment_embedding_hnsw_idx is present (hnsw, vector_cosine_ops).');
  } catch (err) {
    console.warn(
      '[vector-index] Skipped: HNSW index could not be created. pgvector ≥ 0.5.0 is required for HNSW; clustering still works without the index (sequential scan).'
    );
    console.warn('[vector-index] Reason:', errMessage(err));
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main()
  .catch((err) => {
    console.error('[vector-index] Unexpected error:', errMessage(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
