-- pgvector: cột embedding cho StoryFact.
-- Prisma không khai báo được kiểu `vector`, nên chạy riêng bằng SQL thô.
-- Chạy sau mỗi `prisma db push` / `migrate` (script db:vector lo việc này).

CREATE EXTENSION IF NOT EXISTS vector;

-- bge-m3 trả 1024 chiều. Đổi model thì phải đổi số này và tạo lại embedding.
ALTER TABLE "StoryFact"
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW cho tìm lân cận gần nhất theo cosine. Chỉ mục này chỉ đáng khi đã có
-- vài trăm sự kiện; dưới ngưỡng đó Postgres tự quét tuần tự và vẫn nhanh.
CREATE INDEX IF NOT EXISTS storyfact_embedding_hnsw
  ON "StoryFact" USING hnsw (embedding vector_cosine_ops);

-- Truy vấn "sự kiện nào chưa có embedding" chạy thường xuyên.
CREATE INDEX IF NOT EXISTS storyfact_embedding_null
  ON "StoryFact" ("seriesId") WHERE embedding IS NULL;
