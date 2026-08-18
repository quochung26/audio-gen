import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { LOCAL_ONLY_TABLES } from "../src/publish-scope";

/**
 * Đẩy schema sang DB HOSTED mà Player đọc.
 *
 * `prisma db push` không nhận cờ `--url`, nó chỉ đọc `DATABASE_URL` — nên script
 * này chạy lại prisma với `DATABASE_URL` thay bằng `PLAYER_DATABASE_URL`. Gõ tay
 * rất dễ nhầm và nhầm ở đây là đẩy schema đè lên DB sản xuất.
 *
 * Chạy: `pnpm db:push:player`
 */

const url = process.env.PLAYER_DATABASE_URL;
if (!url) {
  console.error(
    "PLAYER_DATABASE_URL chưa đặt.\n" +
      "Đây là DB hosted mà Player đọc — để trống nghĩa là đang chạy chung một DB\n" +
      "với Studio, lúc đó không cần đẩy gì cả.",
  );
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.error("PLAYER_DATABASE_URL trùng DATABASE_URL. Hai DB phải khác nhau.");
  process.exit(1);
}

console.log(`Đẩy schema sang DB hosted: ${url.replace(/:[^:@]*@/, ":***@")}`);

const res = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
if (res.status !== 0) process.exit(res.status ?? 1);

// Kiểm luôn ranh giới quyền riêng tư. Schema đẩy sang là schema ĐẦY ĐỦ nên các
// bảng chỉ-local vẫn tồn tại ở hosted — chúng phải RỖNG. Có dòng nào ở đây
// nghĩa là có thứ đã rời khỏi máy mà lẽ ra không được.
const client = new PrismaClient({ datasourceUrl: url });
const counts: Array<[string, number]> = [];
for (const table of LOCAL_ONLY_TABLES) {
  const [row] = await client.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "${table}"`,
  );
  counts.push([table, Number(row?.n ?? 0)]);
}
await client.$disconnect();

const dirty = counts.filter(([, n]) => n > 0);
console.log("\nBảng chỉ được có ở local — kiểm trên DB hosted:");
for (const [t, n] of counts) console.log(`  ${n === 0 ? "✔" : "✖"} ${t}: ${n} dòng`);

if (dirty.length > 0) {
  console.error(
    `\nCÓ DỮ LIỆU KHÔNG ĐƯỢC PHÉP ở DB hosted: ${dirty.map(([t]) => t).join(", ")}.\n` +
      "Job PUBLISH không ghi vào những bảng này — kiểm xem có ai trỏ DATABASE_URL\n" +
      "vào DB hosted rồi chạy Studio/worker không.",
  );
  process.exit(1);
}
console.log("\nSạch. DB hosted chỉ có nội dung đã xuất bản.");
