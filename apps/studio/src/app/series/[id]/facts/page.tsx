import Link from "next/link";
import { prisma } from "@audio/database";
import { Badge, Button, Section } from "@/components/ui";
import { deleteFact, resolveFact, toggleFactPin } from "../../../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  EVENT: "việc xảy ra",
  REVELATION: "phát hiện",
  PROMISE: "lời thề",
  RELATION: "quan hệ",
  OBJECT: "vật",
  PLACE: "địa điểm",
  OPEN_THREAD: "bỏ ngỏ",
};
const KIND_TONE: Record<string, string> = {
  OPEN_THREAD: "amber",
  PROMISE: "blue",
  REVELATION: "blue",
};

export default async function FactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUniqueOrThrow({ where: { id } });

  const [facts, missingVector] = await Promise.all([
    prisma.storyFact.findMany({
      where: { seriesId: id },
      orderBy: [{ episodeNumber: "asc" }, { kind: "asc" }],
    }),
    prisma.$queryRaw<[{ n: bigint }]>`
      SELECT count(*)::bigint AS n FROM "StoryFact"
      WHERE "seriesId" = ${id} AND embedding IS NULL`,
  ]);

  const open = facts.filter((f) => f.kind === "OPEN_THREAD" && !f.resolved);
  const pinned = facts.filter((f) => f.pinned);
  const byEpisode = new Map<number, typeof facts>();
  for (const f of facts) {
    const list = byEpisode.get(f.episodeNumber) ?? [];
    list.push(f);
    byEpisode.set(f.episodeNumber, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/series/${series.id}`} className="text-xs text-neutral-500 underline">
          ← {series.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Sự kiện truyện</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Mỗi sự kiện là một câu, có vector riêng. Khi viết cảnh, hệ thống chỉ lấy những sự kiện
          liên quan tới beat của cảnh đó — thay vì nhồi mọi tóm tắt cũ vào prompt. Sự kiện sống độc
          lập với việc nén tóm tắt, nên nén không làm mất chi tiết.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Tổng sự kiện" value={String(facts.length)} />
        <Stat label="Còn bỏ ngỏ" value={String(open.length)} hint="luôn được nạp" />
        <Stat label="Đã ghim" value={String(pinned.length)} hint="luôn được nạp" />
        <Stat
          label="Chưa có vector"
          value={String(Number(missingVector[0]?.n ?? 0))}
          hint={Number(missingVector[0]?.n ?? 0) > 0 ? "không truy hồi được" : "đủ"}
        />
      </div>

      {open.length > 0 && (
        <Section title={`Tình tiết còn bỏ ngỏ (${open.length})`}>
          <p className="text-xs text-neutral-500">
            Món nợ câu chuyện phải trả. Luôn được nạp vào prompt bất kể độ tương đồng — vì một tình
            tiết bỏ ngỏ ở tập 3 vẫn cần nhắc ở tập 40 dù chủ đề chẳng liên quan.
          </p>
          <div className="divide-y divide-neutral-900 rounded border border-amber-900/50">
            {open.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="text-sm">
                  <span className="text-xs text-neutral-500">tập {f.episodeNumber} · </span>
                  {f.text}
                </div>
                <form action={resolveFact.bind(null, f.id, series.id, f.episodeNumber)}>
                  <Button variant="ghost">đã giải</Button>
                </form>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Theo tập">
        <div className="space-y-3">
          {[...byEpisode.entries()].map(([num, list]) => (
            <details key={num} className="rounded border border-neutral-800">
              <summary className="cursor-pointer px-4 py-2.5 text-sm">
                <span className="text-neutral-500">Tập {num}</span>
                <span className="ml-2 text-xs text-neutral-600">{list.length} sự kiện</span>
              </summary>
              <div className="divide-y divide-neutral-900 border-t border-neutral-800">
                {list.map((f) => (
                  <div key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0 text-sm">
                      <span className="mr-2 align-middle">
                        <Badge tone={KIND_TONE[f.kind] ?? "neutral"}>
                          {KIND_LABEL[f.kind] ?? f.kind}
                        </Badge>
                      </span>
                      <span className={f.resolved ? "text-neutral-600 line-through" : ""}>
                        {f.text}
                      </span>
                      {f.resolved && f.resolvedInEpisode && (
                        <span className="ml-2 text-xs text-neutral-600">
                          giải ở tập {f.resolvedInEpisode}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={toggleFactPin.bind(null, f.id, series.id)}>
                        <Button variant="ghost">{f.pinned ? "bỏ ghim" : "ghim"}</Button>
                      </form>
                      <form action={deleteFact.bind(null, f.id, series.id)}>
                        <Button variant="ghost">xoá</Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-neutral-600">{hint}</div>}
    </div>
  );
}
