import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge } from "@/components/ui";

interface Card {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  appearance: string | null;
  voiceHint: string | null;
  isNarrator: boolean;
}

/**
 * Một người trong dàn của bộ SẮP tạo.
 *
 * `cardId` null = nhân vật gõ riêng cho bộ này, không có trong thư viện.
 * `key` là khoá React tạm, không gửi lên — hai nhân vật chưa đặt tên vẫn phải
 * phân biệt được nhau trong lúc gõ.
 */
interface Row {
  key: string;
  cardId: string | null;
  name: string;
  role: string;
  description: string;
  appearance: string;
  voiceHint: string;
  isNarrator: boolean;
}

const blank = (over: Partial<Row> = {}): Row => ({
  key: crypto.randomUUID(),
  cardId: null,
  name: "",
  role: "",
  description: "",
  appearance: "",
  voiceHint: "",
  isNarrator: false,
  ...over,
});

const input =
  "w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm placeholder:text-neutral-700";

/**
 * Chọn dàn nhân vật trước khi dựng dàn ý.
 *
 * Ba việc trong một chỗ, vì chúng là cùng một quyết định: lấy thẻ có sẵn, sửa
 * lại cho hợp bộ này, hoặc gõ hẳn một người mới.
 *
 * Sửa ở đây KHÔNG đụng tới thẻ. Thẻ là bản mô tả gốc mang đi được; "Tài của bộ
 * này" là chuyện riêng của bộ này. Muốn đưa bản sửa lên thư viện thì có nút Lưu
 * riêng ở trang Nhân vật, sau khi bộ đã dựng xong.
 *
 * Gửi lên MỘT trường `cast` dạng JSON: danh sách dài ngắn tuỳ lúc, mà `FormData`
 * phẳng thì tên trường phải mang theo chỉ số và chỗ nào cũng phải tự ghép lại.
 */
export function CastPicker() {
  const { data } = useApi<{ cards: Card[] }>("/api/character-cards");
  const cards = data?.cards ?? [];
  const [rows, setRows] = useState<Row[]>([]);

  const usedCardIds = new Set(rows.map((r) => r.cardId).filter(Boolean));

  function edit(key: string, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return { ...r, ...(patch.isNarrator ? { isNarrator: false } : {}) };
        return { ...r, ...patch };
      }),
    );
  }

  function addCard(card: Card) {
    setRows((rs) => [
      ...rs,
      blank({
        cardId: card.id,
        name: card.name,
        role: card.role ?? "",
        description: card.description ?? "",
        appearance: card.appearance ?? "",
        voiceHint: card.voiceHint ?? "",
        // Người dẫn của thẻ chỉ là mặc định; bộ vẫn chỉ được có một, nên thẻ
        // thứ hai mang cờ này vào sẽ không được nhận.
        isNarrator: card.isNarrator && !rs.some((r) => r.isNarrator),
      }),
    ]);
  }

  return (
    <div className="space-y-4">
      <input
        type="hidden"
        name="cast"
        value={JSON.stringify(
          rows
            .filter((r) => r.name.trim())
            .map(({ key: _key, ...r }) => r),
        )}
      />

      {cards.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs text-neutral-500">
            Thẻ trong thư viện — bấm để thêm vào bộ này
          </span>
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => {
              const used = usedCardIds.has(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={used}
                  onClick={() => addCard(card)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    used
                      ? "border-neutral-800 bg-neutral-900 text-neutral-700"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
                  }`}
                >
                  {card.name}
                  {card.isNarrator && <span className="ml-1 text-neutral-600">(dẫn)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="space-y-2 rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => edit(r.key, { name: e.target.value })}
                  placeholder="Tên"
                  className={input}
                />
                {r.cardId ? (
                  <Badge>từ thẻ</Badge>
                ) : (
                  <Badge tone="blue">riêng bộ này</Badge>
                )}
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300"
                >
                  bỏ
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={r.role}
                  onChange={(e) => edit(r.key, { role: e.target.value })}
                  placeholder="Vai trong truyện — vd: tài xế xe khách, 45 tuổi"
                  className={`${input} flex-1`}
                />
                <input
                  value={r.voiceHint}
                  onChange={(e) => edit(r.key, { voiceHint: e.target.value })}
                  placeholder="Chất giọng — vd: nam trung niên, khàn"
                  className={`${input} flex-1`}
                />
              </div>

              <textarea
                value={r.description}
                onChange={(e) => edit(r.key, { description: e.target.value })}
                rows={2}
                placeholder="Tính cách và cách nói — thứ giữ cho lời thoại của người này nghe giống nhau qua hàng chục tập."
                className={input}
              />

              <textarea
                value={r.appearance}
                onChange={(e) => edit(r.key, { appearance: e.target.value })}
                rows={2}
                placeholder="Ngoại hình: dáng, tuổi nhìn ra, cách ăn mặc, một chi tiết dễ nhận. Lái phần tả, không phải lời thoại."
                className={input}
              />

              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="radio"
                  name="castNarrator"
                  checked={r.isNarrator}
                  onChange={() => edit(r.key, { isNarrator: true })}
                />
                Người dẫn truyện
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blank()])}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        >
          + Nhân vật riêng cho bộ này
        </button>
        {rows.length === 0 && (
          <span className="text-xs text-neutral-600">
            Bỏ trống thì AI tự nghĩ ra dàn nhân vật.
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-neutral-600">
          Sửa ở đây <strong className="text-neutral-400">không</strong> đụng tới thẻ trong thư
          viện. AI phải dùng đúng những người này, và được thêm người mới nếu truyện cần.
        </p>
      )}
    </div>
  );
}
