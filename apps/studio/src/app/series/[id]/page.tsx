import Link from "next/link";
import { BatchStatus, prisma } from "@audio/database";
import { formatDuration } from "@audio/core";
import { parseWorld, type StoryBibleRecord } from "@audio/core";
import { Badge, Button, STATUS_TONE, Section } from "@/components/ui";
import { cancelBatch, saveArcSummary, startBatch } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUniqueOrThrow({
    where: { id },
    include: {
      characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }], include: { voice: true } },
      episodes: {
        orderBy: { number: "asc" },
        include: {
          _count: { select: { scenes: true, blocks: true } },
          exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
        },
      },
      batchRuns: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  const run = series.batchRuns[0];
  const active =
    run && (run.status === BatchStatus.RUNNING || run.status === BatchStatus.WAITING_REVIEW)
      ? run
      : null;
  const waitingEpisode = active?.currentEpisodeId
    ? series.episodes.find((e) => e.id === active.currentEpisodeId)
    : undefined;

  // Đếm theo dữ liệu thật chứ không theo Episode.status: status lệch được khi
  // bấm tay giữa chừng, còn "có bao nhiêu block" thì luôn đúng.
  const written = series.episodes.filter((e) => e._count.scenes > 0).length;
  const scripted = series.episodes.filter((e) => e._count.blocks > 0).length;
  const exported = series.episodes.filter((e) => e.exports.length > 0).length;

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

      <Section title="Chạy hàng loạt">
        {active ? (
          <div className="space-y-3 rounded border border-blue-900 bg-blue-950/30 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={active.status === BatchStatus.WAITING_REVIEW ? "amber" : "blue"}>
                {active.status === BatchStatus.WAITING_REVIEW ? "chờ duyệt" : "đang chạy"}
              </Badge>
              <span className="text-neutral-300">
                {written}/{series.episodes.length} tập đã viết · {scripted} có kịch bản ·{" "}
                {exported} có MP3
              </span>
            </div>

            {active.status === BatchStatus.WAITING_REVIEW && waitingEpisode ? (
              <p className="text-sm text-amber-200">
                Dừng ở tập {waitingEpisode.number}: {waitingEpisode.title}. Bản thảo cần người đọc
                trước khi tạo audio —{" "}
                <Link href={`/episode/${waitingEpisode.id}`} className="underline">
                  mở tập để đọc và duyệt
                </Link>
                . Duyệt xong lượt chạy tự đi tiếp.
              </p>
            ) : (
              <p className="text-xs text-neutral-400">
                Đang chạy trong worker — đóng tab này không làm gián đoạn. Tải lại trang để xem
                tiến độ mới.
              </p>
            )}

            <form action={cancelBatch.bind(null, active.id, series.id)}>
              <Button variant="ghost">dừng lượt chạy</Button>
            </form>
          </div>
        ) : (
          <form action={startBatch.bind(null, series.id)} className="space-y-3 rounded border border-neutral-800 p-4">
            <p className="text-sm text-neutral-400">
              Đưa từng tập đi hết chuỗi: viết cảnh → duyệt → kịch bản audio → tóm tắt → đọc →
              ghép MP3. Chạy tuần tự từng tập vì tập sau cần tóm tắt và sự kiện của tập trước.
            </p>
            <p className="text-xs text-neutral-600">
              {written}/{series.episodes.length} tập đã viết · {scripted} có kịch bản ·{" "}
              {exported} có MP3. Tập nào xong rồi sẽ được bỏ qua.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="withAudio" defaultChecked className="mt-1" />
              <span>
                Chạy cả TTS và ghép MP3
                <span className="block text-xs text-neutral-600">
                  Bỏ chọn để dừng sau khi có kịch bản audio — đọc lại toàn bộ bản thảo trước rồi
                  mới tốn thời gian đọc.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoApprove" className="mt-1" />
              <span>
                Tự duyệt bản thảo
                <span className="block text-xs text-amber-600/80">
                  Bỏ qua chốt chặn duy nhất ngăn bản thảo thô đi tiếp. Chỉ dùng khi đang thử.
                </span>
              </span>
            </label>

            <Button variant="primary">Bắt đầu</Button>
          </form>
        )}

        {run && !active && run.status === BatchStatus.FAILED && (
          <p className="mt-3 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            Lượt chạy trước thất bại: {run.error}
          </p>
        )}
      </Section>

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
