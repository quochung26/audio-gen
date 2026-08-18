import Link from "next/link";
import { prisma } from "@audio/database";
import { Badge, Button, Section } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import {
  assignVoice,
  createCharacter,
  deleteCharacter,
  setDefaultVoice,
  updateCharacter,
} from "../../../actions";

export const dynamic = "force-dynamic";

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const series = await prisma.series.findUniqueOrThrow({
    where: { id },
    include: {
      characters: {
        orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
        include: { voice: true, _count: { select: { blocks: true } } },
      },
    },
  });

  const narrators = series.characters.filter((c) => c.isNarrator);
  const voices = await prisma.voice.findMany({
    where: { enabled: true },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });
  const uncast = series.characters.filter((c) => !c.voiceId);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/series/${series.id}`} className="text-xs text-neutral-500 underline">
          ← {series.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nhân vật</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Danh sách này nạp vào system prompt mỗi lần viết cảnh, và là căn cứ để bước biên tập
          audio gán người nói cho từng block. Phần <strong className="text-neutral-200">mô tả</strong>{" "}
          là thứ giữ cho lời thoại của một nhân vật nghe giống nhau qua hàng chục tập.
        </p>
      </div>

      {narrators.length === 0 && series.characters.length > 0 && (
        <p className="rounded border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
          Chưa có người dẫn truyện. Bước biên tập audio sẽ không gán được lời dẫn cho ai — đánh dấu
          một nhân vật là người dẫn truyện.
        </p>
      )}

      <Section title="Giọng mặc định">
        <form
          action={setDefaultVoice.bind(null, series.id)}
          className="flex items-end gap-2 rounded border border-neutral-800 p-4"
        >
          <div className="flex-1">
            <p className="mb-2 text-xs text-neutral-500">
              Hiện dùng <strong className="text-neutral-300">một giọng cho cả bộ</strong>. Casting
              riêng từng nhân vật bên dưới chỉ có tác dụng khi làm đa giọng — để sau, khi thấy thật
              sự cần.
            </p>
            <select
              name="defaultVoiceId"
              defaultValue={series.defaultVoiceId ?? ""}
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
          </div>
          <Button type="submit">Lưu</Button>
        </form>
      </Section>

      <div className="space-y-3">
        {series.characters.map((c) => (
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
              <ActionForm action={updateCharacter.bind(null, c.id, series.id)} className="space-y-3">
                <CharacterFields
                  defaults={{
                    name: c.name,
                    role: c.role ?? "",
                    description: c.description ?? "",
                    state: c.state ?? "",
                    stateThrough: c.stateThroughEpisode,
                    voiceHint: c.voiceHint ?? "",
                    isNarrator: c.isNarrator,
                  }}
                />
                <div className="flex items-center gap-3">
                  <Button type="submit">Lưu</Button>
                  <span className="text-xs text-neutral-600">
                    Đổi tên không ảnh hưởng audio đã render — block giữ bản chụp tên người nói.
                  </span>
                </div>
              </ActionForm>

              <form
                action={assignVoice.bind(null, c.id, series.id)}
                className="mt-4 flex items-end gap-2 border-t border-neutral-900 pt-3"
              >
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-400">
                    Giọng đọc (casting)
                  </label>
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
                </div>
                <Button type="submit">Gán</Button>
              </form>

              <form
                action={deleteCharacter.bind(null, c.id, series.id)}
                className="mt-4 border-t border-neutral-900 pt-3"
              >
                <Button variant="ghost">Xoá nhân vật</Button>
                {c._count.blocks > 0 && (
                  <span className="ml-2 text-xs text-neutral-600">
                    {c._count.blocks} block sẽ mất liên kết nhưng vẫn giữ tên người nói.
                  </span>
                )}
              </form>
            </div>
          </details>
        ))}
      </div>

      <details className="rounded border border-dashed border-neutral-700">
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
          + Thêm nhân vật
        </summary>
        <div className="border-t border-neutral-800 p-4">
          <ActionForm action={createCharacter.bind(null, series.id)} className="space-y-3">
            <CharacterFields
              defaults={{
                name: "",
                role: "",
                description: "",
                state: "",
                stateThrough: null,
                voiceHint: "",
                isNarrator: false,
              }}
            />
            <Button type="submit" variant="primary">
              Thêm
            </Button>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}

function CharacterFields({
  defaults,
}: {
  defaults: {
    name: string;
    role: string;
    description: string;
    state: string;
    stateThrough: number | null;
    voiceHint: string;
    isNarrator: boolean;
  };
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Tên" defaultValue={defaults.name} placeholder="Tài" required />
        <Input
          name="role"
          label="Vai trò"
          defaultValue={defaults.role}
          placeholder="tài xế xe khách, 45 tuổi"
        />
      </div>

      <Textarea
        name="description"
        label="Mô tả — tính cách và cách nói"
        hint="Thứ quyết định lời thoại có nhất quán không. Càng cụ thể càng tốt."
        defaultValue={defaults.description}
        placeholder="Ít nói, hay bỏ lửng câu. Gọi khách là 'cô', 'chú'. Khi sợ thì nói nhanh và lặp từ."
        rows={3}
      />

      <Textarea
        name="state"
        label={
          "Trạng thái hiện tại" +
          (defaults.stateThrough ? ` — cập nhật tới hết tập ${defaults.stateThrough}` : "")
        }
        hint="Đang ở đâu, biết gì, quan hệ đã đổi thế nào, còn sống không. Job tóm tắt tự cập nhật sau mỗi tập; sửa tay khi AI đọc sai."
        defaultValue={defaults.state}
        placeholder="Đang ở nhà bà Tư ngoài Cồn Vắng. Đã biết chiếc xe không phải của mình. Không còn tin lời ông Bảy."
        rows={3}
      />

      <Input
        name="voiceHint"
        label="Gợi ý giọng đọc"
        defaultValue={defaults.voiceHint}
        placeholder="nam trung niên, giọng khàn"
      />

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="isNarrator"
          defaultChecked={defaults.isNarrator}
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
      <label htmlFor={name} className="mb-1 block text-xs text-neutral-400">
        {label}
      </label>
      <input
        id={name}
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
      <label htmlFor={name} className="block text-xs text-neutral-400">
        {label}
      </label>
      {hint && <p className="mt-0.5 mb-1 text-xs text-neutral-600">{hint}</p>}
      <textarea
        id={name}
        name={name}
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2.5 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}
