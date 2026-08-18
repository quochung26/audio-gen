import { resolve } from "node:path";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * Đổi các tham chiếu `file:///…` cũ trong DB thành khoá tương đối trong kho.
 *
 * Vì sao cần: bản đầu lưu đường dẫn TUYỆT ĐỐI. Đổi tên thư mục dự án, chuyển
 * sang máy khác, hay chuyển từ macOS sang WSL2 là toàn bộ audio đã sinh mất
 * tham chiếu — file vẫn còn trên đĩa nhưng không tra ra được.
 *
 * Chạy: `pnpm fix:storage-refs` (thêm `--apply` để ghi thật; mặc định chỉ xem trước)
 *
 * An toàn: chỉ đụng vào giá trị bắt đầu bằng `file://`. URL `http(s)` và khoá đã
 * đúng dạng thì bỏ qua, nên chạy lại nhiều lần không hỏng gì.
 */

const apply = process.argv.includes("--apply");
const root = resolve(process.cwd(), loadEnv().STORAGE_LOCAL_DIR);

interface Table {
  name: string;
  findMany: () => Promise<Array<{ id: string; url: string }>>;
  update: (id: string, url: string) => Promise<unknown>;
}

const tables: Table[] = [
  {
    name: "AudioAsset",
    findMany: () =>
      prisma.audioAsset.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.audioAsset.update({ where: { id }, data: { url } }),
  },
  {
    name: "Export",
    findMany: () =>
      prisma.export.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.export.update({ where: { id }, data: { url } }),
  },
  {
    name: "AudioTrack",
    findMany: () =>
      prisma.audioTrack.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.audioTrack.update({ where: { id }, data: { url } }),
  },
];

logger.info(`[fix-refs] gốc kho: ${root}`);
logger.info(`[fix-refs] chế độ: ${apply ? "GHI THẬT" : "xem trước (thêm --apply để ghi)"}`);

let converted = 0;
let outside = 0;

for (const table of tables) {
  const rows = await table.findMany();
  if (rows.length === 0) {
    logger.info(`[fix-refs] ${table.name}: không có bản ghi nào cần đổi`);
    continue;
  }

  for (const row of rows) {
    const abs = row.url.slice("file://".length);

    // Đường dẫn nằm ngoài kho hiện tại — thường là dấu vết của lần đổi tên thư
    // mục. Không đoán bừa: báo ra để người xử lý, vì đoán sai là trỏ nhầm file.
    if (abs !== root && !abs.startsWith(root + "/")) {
      logger.warn(`[fix-refs] ${table.name} ${row.id}: ngoài kho hiện tại, BỎ QUA — ${abs}`);
      outside++;
      continue;
    }

    const key = abs.slice(root.length + 1);
    logger.info(`[fix-refs] ${table.name} ${row.id}: ${key}`);
    if (apply) await table.update(row.id, key);
    converted++;
  }
}

logger.info(
  `[fix-refs] ${apply ? "đã đổi" : "sẽ đổi"} ${converted} bản ghi` +
    (outside > 0 ? `, ${outside} bản ghi nằm ngoài kho cần xử lý tay` : ""),
);

await prisma.$disconnect();
