import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { Field } from "@/components/Field";
import { ScenePeoplePicker } from "@/components/ScenePeoplePicker";
import { ActionButton, Form, Loading } from "@/components/Form";
import { ModelPicker } from "@/components/ModelPicker";
import { languageLabel } from "@/components/LanguagePicker";

interface Streaming {
  sceneId: string;
  order: number;
  text: string;
}

interface CharacterOverride {
  name: string;
  outfit: string;
  note: string;
}
interface SceneSetup {
  note: string;
  characters: CharacterOverride[];
}
interface ChapterSetup {
  focus: string;
  tone: string;
  mustHappen: string[];
  constraints: string[];
  characters: CharacterOverride[];
}

interface Scene {
  id: string;
  order: number;
  beat: string;
  characterIds: string[];
  setup: SceneSetup | null;
  text: string | null;
  /** Bản thảo trước chuyển ngữ. Null = cảnh này chưa qua bước đó. */
  sourceText: string | null;
}
interface Chapter {
  id: string;
  order: number;
  title: string | null;
  setup: ChapterSetup | null;
  scenes: Scene[];
}
interface Block {
  id: string;
  order: number;
  speakerLabel: string;
  characterId: string | null;
  pauseAfter: number;
  sfxHint: string | null;
  text: string;
}
interface Ep {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  status: string;
  wordCount: number | null;
  durationMs: number | null;
  summary: string | null;
  humanReviewed: boolean;
  reviewedAt: string | null;
  series: {
    id: string;
    title: string;
    language: string;
    draftLanguage: string;
    characters: Array<{ id: string; name: string; isNarrator: boolean }>;
  };
  chapters: Chapter[];
  blocks: Block[];
  renderJobs: Array<{ id: string; type: string; status: string; progress: number }>;
}

/** Ghi đè nhân vật hiện lại thành dạng dòng đúng như lúc gõ vào. */
function renderOverrides(list: CharacterOverride[] | undefined): string {
  return (list ?? [])
    .map((c) => `${c.name}: ${c.outfit}${c.note ? ` | ${c.note}` : ""}`)
    .join("\n");
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function Episode() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: ep, isLoading } = useApi<Ep>(`/api/episodes/${id}`, { refetchMs: 3000 });

  const active = ep?.renderJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");

  // Mọi hook phải đứng TRƯỚC nhánh return sớm bên dưới, kể cả hook chỉ dùng khi
  // có dữ liệu — React so thứ tự hook giữa hai lần render, gọi thiếu một cái là
  // sập cả trang.
  //
  // Chỉ hỏi khi có job đang viết chữ; `enabled: path !== null` ở useApi lo phần
  // tắt hẳn, nên trang đứng yên thì không có request nào chạy nền.
  const writing = active?.type === "WRITE_SCENE" || active?.type === "TRANSLATE";
  const { data: stream } = useApi<Streaming | null>(
    writing ? `/api/episodes/${id}/stream` : null,
    // Nhanh hơn nhịp 3 giây của cả trang: đây là thứ để nhìn chữ chạy.
    { refetchMs: 700 },
  );

  if (isLoading || !ep) return <Loading />;

  // Đếm trên TOÀN TẬP: chương chỉ là cách nhóm, còn "viết xong chưa" thì hỏi cả
  // tập — chốt duyệt và bước biên tập audio đều làm việc ở mức tập.
  const scenes = ep.chapters.flatMap((ch) => ch.scenes);
  const written = scenes.filter((s) => s.text).length;
  const allWritten = written === scenes.length && scenes.length > 0;
  // Bộ viết thẳng thì `draftLanguage` rỗng và cả khối chuyển ngữ biến mất.
  const untranslated = ep.series.draftLanguage
    ? scenes.filter((s) => s.text && !s.sourceText).length
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${ep.seriesId}`} className="text-xs text-neutral-500 underline">
          ← {ep.series.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            Tập {ep.number}: {ep.title}
          </h1>
          <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {ep.chapters.length} chương · {written}/{scenes.length} cảnh
          {ep.wordCount ? ` · ${ep.wordCount} từ` : ""}
          {ep.durationMs ? ` · ~${formatDuration(ep.durationMs)}` : ""}
        </p>
      </div>

      {active && (
        <Link
          to={`/job/${active.id}`}
          className="block rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200"
        >
          Đang chạy {active.type} — {active.progress}%. Bấm để xem tiến độ.
        </Link>
      )}

      <Section title="Chương & cảnh">
        {!allWritten && !active && (
          <Form
            path={`/api/episodes/${ep.id}/write-scenes`}
            submit={`Viết cả ${scenes.length - written} cảnh còn lại`}
            className="max-w-md rounded border border-neutral-800 p-4"
          >
            <ModelPicker />
            <p className="mt-2 text-xs text-neutral-600">
              Một job liền mạch, và phải đợi hết mới đọc được. Muốn xem sớm thì bấm{" "}
              <strong className="text-neutral-400">viết cảnh này</strong> ở từng cảnh bên dưới —
              đọc cảnh 1 rồi sửa beat trước khi tốn thời gian cho cảnh 2.
            </p>
          </Form>
        )}

        <div className="space-y-6">
          {ep.chapters.map((chapter) => (
            <div key={chapter.id}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-medium text-neutral-200">
                  Chương {chapter.order}
                  {chapter.title ? `: ${chapter.title}` : ""}
                </h2>
                <span className="text-xs text-neutral-600">
                  {chapter.scenes.filter((sc) => sc.text).length}/{chapter.scenes.length} cảnh
                </span>
              </div>

              <details className="mb-3 rounded border border-neutral-800">
                <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                  Thiết lập chương {chapter.order} — áp cho mọi cảnh trong chương
                </summary>
                <div className="border-t border-neutral-800 px-4 py-4">
                  <p className="mb-3 text-xs text-neutral-500">
                    Tầng giữa: bộ có <strong className="text-neutral-400">Thiết lập thế giới</strong>
                    , cảnh có <strong className="text-neutral-400">beat</strong>, còn đây là thứ
                    đúng cho riêng chương này. Ghi đè nhân vật ở đây thắng Story Bible; ghi đè ở
                    từng cảnh lại thắng ở đây.
                  </p>
                  <Form
                    path={`/api/episodes/${ep.id}/chapters/${chapter.id}/setup`}
                    method="PUT"
                    submit="Lưu"
                    className="space-y-3"
                  >
                    <Field
                      name="focus"
                      label="Chương này hướng về điều gì"
                      hint="Câu hỏi chương phải trả lời, hoặc cảm giác nó phải để lại."
                      placeholder="Tài phải chọn: nói thật với bà Tư, hay giữ lời hứa với người đã chết."
                      rows={2}
                      defaultValue={chapter.setup?.focus ?? ""}
                    />
                    <Field
                      name="tone"
                      label="Giọng riêng chương này"
                      hint="Đè lên giọng của cả bộ. Bỏ trống thì giữ nguyên."
                      placeholder="Chậm hơn thường lệ. Mưa suốt chương, tiếng mưa lấp gần hết lời thoại."
                      rows={2}
                      defaultValue={chapter.setup?.tone ?? ""}
                    />
                    <Field
                      name="mustHappen"
                      label="Việc phải xảy ra — mỗi dòng một việc"
                      placeholder={"Tài quay lại Bến Cũ\nBà Tư nhắc tới cái tên chưa ai nói ra"}
                      rows={2}
                      defaultValue={(chapter.setup?.mustHappen ?? []).join("\n")}
                    />
                    <Field
                      name="constraints"
                      label="Điều cấm riêng chương — mỗi dòng một điều"
                      placeholder="Không cho ông Bảy xuất hiện"
                      rows={2}
                      defaultValue={(chapter.setup?.constraints ?? []).join("\n")}
                    />
                    <Field
                      name="characters"
                      label="Ghi đè nhân vật — mỗi dòng một người"
                      hint="Dạng: Tên: mặc gì | ghi chú. Đè lên Story Bible cho riêng chương này."
                      placeholder={"Tài: áo mưa rách, ủng cao su | tay trái băng kín\nBà Tư: áo bà ba nâu"}
                      rows={3}
                      defaultValue={renderOverrides(chapter.setup?.characters)}
                    />
                  </Form>
                </div>
              </details>

              <div className="space-y-3">
                {chapter.scenes.map((scene) => (
                  <div key={scene.id} className="rounded border border-neutral-800">
                    <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2">
                      <span className="text-xs text-neutral-500">
                        Cảnh {chapter.order}.{scene.order} · {scene.beat}
                      </span>
                      {/* Viết từng cảnh một: cảnh 600–900 từ đã mất vài chục
                          giây trên GPU thật, nên cả tập là một lần chờ dài mà
                          không xem được gì. Cùng một endpoint — đặt `text` về
                          null rồi đẩy WRITE_SCENE cho đúng cảnh đó, nên cảnh
                          chưa viết cũng chạy. */}
                      {!active && (
                        <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/write`}>
                          {scene.text ? "viết lại" : "viết cảnh này"}
                        </ActionButton>
                      )}
                    </div>
                    <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                      {stream && stream.sceneId === scene.id ? (
                        <>
                          {stream.text}
                          {/* Con trỏ nhấp nháy: phân biệt "đang viết" với "viết
                              xong mà ngắn thế thôi". */}
                          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-neutral-500 align-text-bottom" />
                        </>
                      ) : (
                        (scene.text ?? <span className="text-neutral-600">chưa viết</span>)
                      )}
                    </div>

                    <details className="border-t border-neutral-900">
                      <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                        Chỉ dẫn cho cảnh này
                      </summary>
                      <div className="border-t border-neutral-900 px-4 py-3">
                        <Form
                          path={`/api/episodes/${ep.id}/scenes/${scene.id}`}
                          method="PUT"
                          submit="Lưu chỉ dẫn"
                          className="space-y-3"
                        >
                          <Field
                            name="beat"
                            label="Beat — việc xảy ra trong cảnh"
                            rows={2}
                            defaultValue={scene.beat}
                          />
                          <ScenePeoplePicker
                            characters={ep.series.characters}
                            initial={scene.characterIds}
                          />
                          <Field
                            name="note"
                            label="Ghi chú riêng cảnh"
                            placeholder="Cảnh này không có thoại. Chỉ tiếng mưa và tiếng bước chân."
                            rows={2}
                            defaultValue={scene.setup?.note ?? ""}
                          />
                          <Field
                            name="characters"
                            label="Ghi đè nhân vật cho riêng cảnh này"
                            hint="Dạng: Tên: mặc gì | ghi chú. Đè lên thiết lập chương, theo TỪNG Ô — chỉ ghi phần khác đi."
                            placeholder="Tài: đã cởi áo mưa"
                            rows={2}
                            defaultValue={renderOverrides(scene.setup?.characters)}
                          />
                        </Form>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Viết nháp bằng tiếng khác thì phải viết lại TRƯỚC khi duyệt: duyệt bản
          thảo ở thứ tiếng không phát ra loa thì chốt chặn không chặn được gì. */}
      {ep.series.draftLanguage && allWritten && (
        <Section
          title="Chuyển ngữ"
          action={
            !active ? (
              <ActionButton
                path={`/api/episodes/${ep.id}/translate${untranslated > 0 ? "" : "?force=1"}`}
                variant={untranslated > 0 ? "primary" : "default"}
              >
                {untranslated > 0 ? "viết lại" : "làm lại"}
              </ActionButton>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {untranslated > 0
              ? `Bản thảo đang là ${languageLabel(ep.series.draftLanguage)}. Còn ${untranslated}/${scenes.length} cảnh chưa viết lại sang ${languageLabel(ep.series.language)}.`
              : `Đã viết lại toàn bộ sang ${languageLabel(ep.series.language)}. Bản thảo ${languageLabel(ep.series.draftLanguage)} vẫn được giữ, sửa prompt rồi làm lại được.`}
          </p>
        </Section>
      )}

      {/* Chốt chặn không cho bản thảo thô đi tiếp. */}
      {allWritten && untranslated === 0 && (
        <Section title="Duyệt bản thảo">
          <div className="rounded border border-neutral-800 p-4">
            {ep.humanReviewed ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-300">
                  Đã duyệt
                  {ep.reviewedAt ? ` lúc ${new Date(ep.reviewedAt).toLocaleString("vi")}` : ""}
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/unapprove`}>bỏ duyệt</ActionButton>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">
                  Đọc lại toàn bộ bản thảo phía trên. Chưa duyệt thì không tạo được kịch bản audio —
                  đây là chốt chặn duy nhất ngăn bản thảo thô lọt ra ngoài.
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/approve`} variant="primary">
                  Tôi đã đọc và duyệt
                </ActionButton>
              </div>
            )}
          </div>
        </Section>
      )}

      {ep.humanReviewed && (
        <Section
          title={`Kịch bản audio${ep.blocks.length ? ` (${ep.blocks.length} block)` : ""}`}
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/audio-script`} variant="default">
                {ep.blocks.length ? "tạo lại" : "tạo kịch bản"}
              </ActionButton>
            ) : null
          }
        >
          {ep.blocks.length === 0 ? (
            <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
              Chưa có. Bấm “tạo kịch bản” để tách block và gán người nói.
            </p>
          ) : (
            <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
              {ep.blocks.map((b) => (
                <div key={b.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">{b.order}.</span>
                    <Badge tone={b.speakerLabel === "narrator" ? "neutral" : "blue"}>
                      {b.speakerLabel === "narrator" ? "dẫn truyện" : b.speakerLabel}
                    </Badge>
                    {!b.characterId && b.speakerLabel !== "narrator" && (
                      <Badge tone="amber">chưa khớp nhân vật</Badge>
                    )}
                    <span className="text-neutral-600">nghỉ {b.pauseAfter}ms</span>
                    {b.sfxHint && <span className="text-neutral-600">sfx: {b.sfxHint}</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{b.text}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {ep.blocks.length > 0 && (
        <Section title="Audio">
          <Link
            to={`/episode/${ep.id}/audio`}
            className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-900"
          >
            <span>Nghe, duyệt từng block và xuất MP3</span>
            <span className="text-xs text-neutral-500">{ep.blocks.length} block →</span>
          </Link>
        </Section>
      )}

      {allWritten && (
        <Section
          title="Tóm tắt"
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/summarize`}>
                {ep.summary ? "tóm tắt lại" : "tóm tắt"}
              </ActionButton>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {ep.summary ?? "Chưa có. Tóm tắt được nạp làm ngữ cảnh khi viết các tập sau."}
          </p>
        </Section>
      )}

      {/* Cuối trang, tách khỏi mọi nút hằng ngày: xoá tập không hoàn tác được. */}
      <Section title="Vùng nguy hiểm">
        <div className="flex flex-wrap items-center gap-3 rounded border border-red-950 bg-red-950/20 p-4">
          <ActionButton
            path={`/api/episodes/${ep.id}`}
            method="DELETE"
            confirmText={`Xoá tập ${ep.number} "${ep.title}" cùng bản thảo, kịch bản, audio và sự kiện của tập? Không hoàn tác được.`}
            onDone={() => nav(`/series/${ep.seriesId}`)}
          >
            Xoá tập này
          </ActionButton>
          <span className="text-xs text-neutral-500">
            Xoá luôn sự kiện của tập, để các tập sau không còn bị lái theo nó. Số tập không đánh
            lại — dãy sẽ khuyết số {ep.number}.
          </span>
        </div>
      </Section>
    </div>
  );
}
