-- Chỉ mục cho cột embedding của StoryFact.
--
-- Bản thân CỘT do Prisma tạo (khai `Unsupported("vector(1024)")` trong schema);
-- extension do sql/000-extension.sql bật trước khi push. Ở đây chỉ còn chỉ mục,
-- vì Prisma không khai báo được chỉ mục trên kiểu nó không hiểu.
-- Chạy sau mỗi `prisma db push` / `migrate` — script db:vector lo việc này.

-- Phòng khi chạy tay file này trên DB dựng theo cách khác.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "StoryFact" ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW cho tìm lân cận gần nhất theo cosine. Chỉ mục này chỉ đáng khi đã có
-- vài trăm sự kiện; dưới ngưỡng đó Postgres tự quét tuần tự và vẫn nhanh.
CREATE INDEX IF NOT EXISTS storyfact_embedding_hnsw
  ON "StoryFact" USING hnsw (embedding vector_cosine_ops);

-- Truy vấn "sự kiện nào chưa có embedding" chạy thường xuyên.
CREATE INDEX IF NOT EXISTS storyfact_embedding_null
  ON "StoryFact" ("seriesId") WHERE embedding IS NULL;
