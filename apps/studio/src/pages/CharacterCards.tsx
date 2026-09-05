import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { Field, TextInput } from "@/components/Field";

interface Voice {
  id: string;
  name: string;
  language: string;
}

interface Card {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  voiceHint: string | null;
  isNarrator: boolean;
  voiceId: string | null;
  voice: Voice | null;
  _count: { characters: number };
}

/**
 * Thư viện thẻ nhân vật — nhân vật dùng lại được giữa các bộ truyện.
 *
 * Thẻ KHÔNG phải liên kết sống: mang thẻ vào một bộ là chép nội dung nó, từ đó
 * hai bên đi đường riêng. Nói rõ ra ở đầu trang, vì đây đúng là chỗ người ta
 * mặc định hiểu ngược lại.
 */
export function CharacterCards() {
  const { data, isLoading } = useApi<{ cards: Card[]; voices: Voice[] }>("/api/character-cards");
  const [editing, setEditing] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Thẻ nhân vật</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Nhân vật dùng lại được giữa các bộ. Mang thẻ vào một bộ là{" "}
          <strong className="text-neutral-200">chép nội dung nó</strong> — từ đó nhân vật sống đời
          sống riêng trong bộ đó, sửa thẻ ở đây không đụng tới bộ đã dùng, và sửa nhân vật trong bộ
          cũng không đụng ngược lên thẻ.
        </p>
      </div>

      <Section title="Thêm thẻ">
        <CardForm voices={data.voices} />
      </Section>

      <Section title={`Thư viện (${data.cards.length})`}>
        {data.cards.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
            Chưa có thẻ nào. Thêm ở trên, hoặc dựng một bộ truyện rồi bấm “lưu vào thư viện” ở
            trang Nhân vật của bộ đó.
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.cards.map((card) => (
              <div key={card.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-neutral-200">{card.name}</span>
                  {card.isNarrator && <Badge tone="blue">người dẫn</Badge>}
                  {card.voice && <Badge>{card.voice.name}</Badge>}
                  {card._count.characters > 0 && (
                    <span className="text-xs text-neutral-600">
                      {card._count.characters} bộ đã dùng
                    </span>
                  )}
                  <span className="grow" />
                  <button
                    type="button"
                    onClick={() => setEditing(editing === card.id ? null : card.id)}
                    className="text-xs text-neutral-400 underline hover:text-neutral-200"
                  >
                    {editing === card.id ? "đóng" : "sửa"}
                  </button>
                  <ActionButton path={`/api/character-cards/${card.id}`} method="DELETE">
                    xoá
                  </ActionButton>
                </div>

                {card.role && <p className="mt-1 text-sm text-neutral-400">{card.role}</p>}
                {card.description && (
                  <p className="mt-1 text-sm text-neutral-500">{card.description}</p>
                )}

                {editing === card.id && (
                  <div className="mt-3 border-t border-neutral-900 pt-3">
                    <CardForm voices={data.voices} card={card} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function CardForm({ voices, card }: { voices: Voice[]; card?: Card }) {
  return (
    <Form
      path={card ? `/api/character-cards/${card.id}` : "/api/character-cards"}
      method={card ? "PUT" : "POST"}
      submit={card ? "Lưu thẻ" : "Thêm"}
      resetOnSuccess={!card}
      className="space-y-3 rounded border border-neutral-800 p-4"
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <TextInput name="name" label="Tên" placeholder="Tài" defaultValue={card?.name ?? ""} />
        </div>
        <div className="flex-1">
          <TextInput
            name="role"
            label="Vai, tuổi, nghề"
            placeholder="tài xế xe khách, 45 tuổi"
            defaultValue={card?.role ?? ""}
          />
        </div>
      </div>

      <Field
        name="description"
        label="Tính cách và cách nói"
        hint="Model đọc câu này mỗi lần viết — đây là thứ giữ cho lời thoại của người này nghe giống nhau qua hàng chục tập."
        placeholder="Ít nói, trả lời cộc lốc. Chỉ dài lời khi nhắc tới con gái."
        rows={2}
        defaultValue={card?.description ?? ""}
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <TextInput
            name="voiceHint"
            label="Chất giọng — để casting"
            placeholder="nam trung niên, giọng khàn"
            defaultValue={card?.voiceHint ?? ""}
          />
        </div>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-neutral-500">Giọng ưa dùng</span>
          <select
            name="voiceId"
            defaultValue={card?.voiceId ?? ""}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="">— chưa chọn —</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.language})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        <input type="checkbox" name="isNarrator" defaultChecked={card?.isNarrator} />
        Thường là người dẫn truyện
        <span className="text-xs text-neutral-600">
          — chỉ là mặc định; mỗi bộ vẫn chỉ có đúng một người dẫn
        </span>
      </label>
    </Form>
  );
}
