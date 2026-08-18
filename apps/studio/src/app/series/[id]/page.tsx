import Link from "next/link";
import { prisma } from "@audio/database";
import { formatDuration } from "@audio/core";
import { parseWorld, type StoryBibleRecord } from "@audio/core";
import { Badge, Button, STATUS_TONE, Section } from "@/components/ui";
import { saveArcSummary } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUniqueOrThrow({
    where: { id },
    include: {
      characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }], include: { voice: true } },
      episodes: { orderBy: { number: "asc" } },
    },
  });

  const world = parseWorld((series.storyBible as StoryBibleRecord | null)?.world);
  const worldThin = world.rules.length === 0 && !world.tone.trim();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{series.title}</h1>
          <Badge>{series.kind === "SHORT" ? "truyện ngắn" : "truyện dài"}</Badge>
          <Badge>{series.genre}</Badge>
        </div>
        {series.description && (
          <p className="mt-2 text-sm text-neutral-400">{series.description}</p>
        )}
      </div>

      <Section
        title="Thiết lập thế giới"
        action={
          <Link href={`/series/${series.id}/bible`} className="text-xs text-neutral-400 underline">
            sửa
          </Link>
        }
      >
        <div className="space-y-2 rounded border border-neutral-800 p-4 text-sm">
          <p className="text-neutral-400">{world.setting || "chưa đặt bối cảnh"}</p>
          <p className="text-xs text-neutral-600">
            {world.rules.length} luật thế giới · {world.constraints.length} điều cấm ·{" "}
            {world.glossary.length} thuật ngữ
          </p>
          {worldThin && series.kind === "LONG" && (
            <p className="pt-1 text-xs text-amber-500">
              Truyện dài nên đặt luật thế giới và giọng văn — đây là thứ giữ cho các tập sau không
              trôi khỏi thiết lập ban đầu.
            </p>
          )}
        </div>
      </Section>

      <Section
        title={`Nhân vật (${series.characters.length})`}
        action={
          <Link
            href={`/series/${series.id}/characters`}
            className="text-xs text-neutral-400 underline"
          >
            sửa
          </Link>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {series.characters.map((c) => (
            <div key={c.id} className="rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.isNarrator && <Badge tone="blue">dẫn truyện</Badge>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{c.role}</p>
              {c.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{c.description}</p>
              )}
              <p className="mt-2 text-xs text-neutral-600">
                giọng gợi ý: {c.voiceHint ?? "—"}
                <br />
                đã casting: {c.voice?.name ?? <span className="text-amber-500">chưa</span>}
                {!c.description && (
                  <>
                    <br />
                    <span className="text-amber-600">chưa có mô tả tính cách</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {(series.arcSummary || series.episodes.length > 6) && (
        <Section title="Mạch truyện từ đầu">
          <form action={saveArcSummary.bind(null, series.id)} className="space-y-2">
            <textarea
              name="arcSummary"
              rows={5}
              defaultValue={series.arcSummary ?? ""}
              placeholder="Tự sinh khi bộ đủ dài — nén các tập cũ lại để ngữ cảnh không phình theo số tập."
              className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-600"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" variant="ghost">
                Lưu
              </Button>
              <span className="text-xs text-neutral-600">
                {series.arcThroughEpisode
                  ? `Đã nén tới hết tập ${series.arcThroughEpisode}. Các tập sau đó vẫn giữ tóm tắt nguyên văn.`
                  : "Chưa nén — tóm tắt từng tập vẫn được nạp nguyên văn."}
              </span>
            </div>
          </form>
        </Section>
      )}

      <Section title={`Tập (${series.episodes.length})`}>
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {series.episodes.map((ep) => (
            <Link
              key={ep.id}
              href={`/episode/${ep.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
            >
              <div>
                <span className="text-sm text-neutral-500">Tập {ep.number}</span>
                <span className="ml-3 text-sm">{ep.title}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                {ep.wordCount ? <span>{ep.wordCount} từ</span> : null}
                {ep.durationMs ? <span>~{formatDuration(ep.durationMs)}</span> : null}
                <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
