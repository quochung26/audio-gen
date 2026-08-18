-- Bật pgvector TRƯỚC khi Prisma đẩy schema.
--
-- Thứ tự này quan trọng: `StoryFact.embedding` khai kiểu `Unsupported("vector(1024)")`
-- nên `prisma db push` sẽ tự tạo cột — mà tạo cột kiểu `vector` không được nếu
-- extension chưa bật. Trên máy đã dựng rồi thì lệnh này không làm gì.
CREATE EXTENSION IF NOT EXISTS vector;
