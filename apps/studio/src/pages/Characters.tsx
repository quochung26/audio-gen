import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface Voice {
  id: string;
  name: string;
  engine: string;
  tier: string;
  commercialOk: boolean;
}
interface Character {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  appearance: string | null;
  state: string | null;
  stateThroughEpisode: number | null;
  voiceHint: string | null;
  isNarrator: boolean;
  voiceId: string | null;
  voice: Voice | null;
  /** Thẻ đã dùng để dựng nhân vật này. Chỉ là xuất xứ, không phải liên kết sống. */
  cardId: string | null;
  _count: { blocks: number };
}

interface Card {
  id: string;
  name: string;
}

export function Characters() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{
    characters: Character[];
    voices: Voice[];
    defaultVoiceId: string | null;
    title: string;
  }>(`/api/series/${id}/characters`);
  const { data: library } = useApi<{ cards: Card[] }>("/api/character-cards");
  if (isLoading || !data) return <Loading />;

  const { characters, voices } = data;
  const narrators = characters.filter((c) => c.isNarrator);

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${id}`} className="text-xs text-neutral-500 underline">
          ← {data.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nhân vật</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Danh sách này nạp vào system prompt mỗi lần viết cảnh, và là căn cứ để bước biên tập audio
          gán người nói cho từng block. Phần{" "}
          <strong className="text-neutral-200">mô tả</strong> là thứ giữ cho lời thoại của một nhân
          vật nghe giống nhau qua hàng chục tập.
        </p>
      </div>

      {narrators.length === 0 && characters.length > 0 && (
        <p className="rounded border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
          Chưa có người dẫn truyện. Bước biên tập audio sẽ không gán được lời dẫn cho ai — đánh dấu
          một nhân vật là người dẫn truyện.
        </p>
      )}

      <Section title="Giọng mặc định">
        <Form
          path={`/api/series/${id}/default-voice`}
          method="PUT"
          submit="Lưu"
          className="rounded border border-neutral-800 p-4"
        >
          <p className="mb-2 text-xs text-neutral-500">
            Hiện dùng <strong className="text-neutral-300">một giọng cho cả bộ</strong>. Casting
            riêng từng nhân vật bên dưới chỉ có tác dụng khi làm đa giọng.
          </p>
          <select
            name="defaultVoiceId"
            defaultValue={data.defaultVoiceId ?? ""}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="">— tự chọn giọng đầu tiên của engine đang cấu hình —</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.engine}
                {v.commercialOk ? "" : " · ⚠ phi thương mại"}
              </option>
            ))}
          </select>
        </Form>
      </Section>

      <div className="space-y-3">
        {characters.map((c) => (
          <details key={c.id} className="rounded border border-neutral-800">
            <summary className="cursor-pointer px-4 py-3">
              <span className="font-medium">{c.name}</span>
              {c.isNarrator && (
                <span className="ml-2">
                  <Badge tone="blue">dẫn truyện</Badge>
                </span>
              )}
              <span className="ml-2 text-xs text-neutral-500">{c.role}</span>
              <span className="ml-2 text-xs text-neutral-600">
                {c._count.blocks > 0 ? `${c._count.blocks} block` : ""}
                {c.voice ? ` · giọng: ${c.voice.name}` : " · chưa casting"}
                {c.description ? "" : " · chưa có mô tả"}
                {c.stateThroughEpisode ? ` · trạng thái tới tập ${c.stateThroughEpisode}` : ""}
              </span>
            </summary>

            <div className="border-t border-neutral-800 p-4">
              <Form
                path={`/api/series/${id}/characters/${c.id}`}
                method="PUT"
                submit="Lưu"
                className="space-y-3"
              >
                <CharacterFields c={c} />
              </Form>

              <Form
                path={`/api/series/${id}/characters/${c.id}/voice`}
                method="PUT"
                submit="Gán"
                className="mt-4 border-t border-neutral-900 pt-3"
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Giọng đọc (casting)</span>
                  <select
                    name="voiceId"
                    defaultValue={c.voiceId ?? ""}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                  >
                    <option value="">— chưa gán —</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.engine} · {v.tier === "FAST" ? "CPU" : "GPU"}
                        {v.commercialOk ? "" : " · ⚠ phi thương mại"}
                      </option>
                    ))}
                  </select>
                </label>
              </Form>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-900 pt-3">
                {/* Đưa bản đã sửa NGƯỢC lên thư viện. Phải bấm chứ không tự
                    động: "Tài lúc này đã biết mình bị lừa" đúng với bộ đang
                    viết và sai với mọi bộ khác. */}
                <ActionButton path={`/api/series/${id}/characters/${c.id}/save-card`}>
                  {c.cardId ? "cập nhật thẻ" : "lưu vào thư viện"}
                </ActionButton>
                {c.cardId && (
                  <ActionButton path={`/api/series/${id}/characters/${c.id}/save-card?asNew=1`}>
                    tách thành thẻ mới
                  </ActionButton>
                )}
                <ActionButton
                  path={`/api/series/${id}/characters/${c.id}`}
                  method="DELETE"
                  confirmText={`Xoá nhân vật "${c.name}"?`}
                >
                  Xoá nhân vật
                </ActionButton>
                {c._count.blocks > 0 && (
                  <span className="ml-2 text-xs text-neutral-600">
                    {c._count.blocks} block sẽ mất liên kết nhưng vẫn giữ tên người nói.
                  </span>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>

      {(library?.cards ?? []).length > 0 && (
        <Section title="Thêm từ thư viện thẻ">
          <div className="flex flex-wrap gap-2">
            {(library?.cards ?? [])
              // Thẻ đã có mặt trong bộ thì bỏ khỏi danh sách: bấm vào chỉ nhận
              // được lỗi trùng tên.
              .filter((card) => !characters.some((c) => c.name === card.name))
              .map((card) => (
                <Form
                  key={card.id}
                  path={`/api/series/${id}/characters/from-card`}
                  submit={card.name}
                >
                  <input type="hidden" name="cardId" value={card.id} />
                </Form>
              ))}
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Chép nội dung thẻ vào bộ này. Sửa về sau không đụng tới thẻ.
          </p>
        </Section>
      )}

      <details className="rounded border border-dashed border-neutral-700">
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
          + Thêm nhân vật
        </summary>
        <div className="border-t border-neutral-800 p-4">
          <Form
            path={`/api/series/${id}/characters`}
            submit="Thêm"
            className="space-y-3"
            resetOnSuccess
          >
            <CharacterFields />
          </Form>
        </div>
      </details>
    </div>
  );
}

function CharacterFields({ c }: { c?: Character }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Tên" defaultValue={c?.name ?? ""} placeholder="Tài" />
        <Input
          name="role"
          label="Vai trong truyện"
          defaultValue={c?.role ?? ""}
          placeholder="tài xế xe khách, 45 tuổi"
        />
      </div>

      <Textarea
        name="description"
        label="Tính cách và cách nói"
        hint="Thứ quyết định LỜI THOẠI có nhất quán không qua hàng chục tập. Càng cụ thể càng tốt."
        defaultValue={c?.description ?? ""}
        placeholder="Ít nói, hay bỏ lửng câu. Gọi khách là 'cô', 'chú'. Khi sợ thì nói nhanh và lặp từ."
        rows={3}
      />

      <Textarea
        name="appearance"
        label="Ngoại hình"
        hint="Dáng, tuổi nhìn ra, cách ăn mặc, một chi tiết dễ nhận. Lái phần TẢ — và là căn cứ cho mô tả ảnh bìa."
        defaultValue={c?.appearance ?? ""}
        placeholder="Gầy, da sạm. Áo sơ mi bạc màu xắn tay. Vết sẹo dài ở cổ tay trái."
        rows={2}
      />

      <Textarea
        name="state"
        label={
          "Trạng thái hiện tại" +
          (c?.stateThroughEpisode ? ` — cập nhật tới hết tập ${c.stateThroughEpisode}` : "")
        }
        hint="Đang ở đâu, biết gì, quan hệ đã đổi thế nào. Job tóm tắt tự cập nhật sau mỗi tập; sửa tay khi AI đọc sai."
        defaultValue={c?.state ?? ""}
        placeholder="Đang ở nhà bà Tư ngoài Cồn Vắng. Đã biết chiếc xe không phải của mình."
        rows={3}
      />

      <Input
        name="voiceHint"
        label="Gợi ý giọng đọc"
        defaultValue={c?.voiceHint ?? ""}
        placeholder="nam trung niên, giọng khàn"
      />

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="isNarrator"
          defaultChecked={c?.isNarrator ?? false}
          className="accent-neutral-300"
        />
        Là người dẫn truyện
        <span className="text-xs text-neutral-600">(mỗi bộ chỉ một người)</span>
      </label>
    </>
  );
}

function Input({
  name,
  label,
  ...rest
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      <input
        name={name}
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}

function Textarea({
  name,
  label,
  hint,
  ...rest
}: { name: string; label: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-xs text-neutral-400">{label}</label>
      {hint && <p className="mt-0.5 mb-1 text-xs text-neutral-600">{hint}</p>}
      <textarea
        name={name}
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2.5 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}
