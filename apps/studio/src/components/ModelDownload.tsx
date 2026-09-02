import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { ErrorNote, Form } from "@/components/Form";
import { Section } from "@/components/ui";

interface Variant {
  quant: string;
  sizeBytes: number;
  /** Lớn hơn 1 nghĩa là bản này bị chia nhiều file. */
  parts: number;
  /** Tên đầy đủ mà `ollama pull` hiểu. */
  tag: string;
}

/**
 * Mức lượng tử hoá — đánh đổi giữa dung lượng và chất lượng văn.
 *
 * Số càng nhỏ càng nhẹ và càng nhanh, nhưng văn nhạt dần. Q4_K_M là mức cân
 * bằng mà cộng đồng dùng phổ biến nhất; Q6_K nặng hơn ~35% mà văn mượt hơn rõ.
 *
 * Danh sách CỐ ĐỊNH này chỉ đúng với thư viện chính chủ của Ollama. Kho trên
 * Hugging Face mỗi nơi một kiểu, nên với kho HF thì quét thật — xem dưới.
 */
const QUANTS = [
  { tag: "q4_K_M", label: "Q4_K_M — cân bằng, phổ biến nhất", hint: "nhẹ nhất còn dùng tốt" },
  { tag: "q5_K_M", label: "Q5_K_M — nhỉnh hơn Q4", hint: "nặng hơn ~12%" },
  { tag: "q6_K", label: "Q6_K — văn mượt hơn rõ", hint: "nặng hơn ~35% so với Q4" },
  { tag: "q8_0", label: "Q8_0 — gần như bản gốc", hint: "nặng gấp đôi Q4" },
  { tag: "", label: "(mặc định của Ollama)", hint: "thường là Q4_K_M" },
];

const SUGGESTED = [
  "qwen3:14b",
  "qwen3:8b",
  "gemma3:12b",
  "bge-m3",
  "https://huggingface.co/Qwen/Qwen3-14B-GGUF",
];

/**
 * Dung lượng THẬP PHÂN cho khớp con số Hugging Face hiện trên trang kho.
 * Xem chú thích ở trang Model.
 */
function gb(bytes: number): string {
  if (bytes <= 0) return "—";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/**
 * Ô Model đang trỏ tới một kho Hugging Face, hay tới thư viện của Ollama?
 *
 * Chỉ dùng để chọn xem hiện danh sách lượng tử hoá NÀO. Bóc tên kho và kiểm
 * kho có thật là việc của API, nên đoán sai ở đây cùng lắm là hiện nhầm ô chọn
 * rồi nhận một lời báo lỗi rõ ràng. Tên trong thư viện Ollama (`qwen3:14b`,
 * `bge-m3`) không bao giờ có dấu "/", nên dấu "/" là dấu hiệu đủ chắc.
 */
export function looksLikeHfRepo(input: string): boolean {
  return input.trim().includes("/");
}

/** Chờ gõ xong rồi mới quét — mỗi ký tự một lần gọi API thì phí cả hai đầu. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Tải model về — từ thư viện Ollama hoặc thẳng từ một kho GGUF trên Hugging Face.
 *
 * Một ô Model duy nhất cho cả hai, vì đứng từ phía người dùng thì đó là cùng
 * một việc. Khác nhau ở chỗ lấy danh sách lượng tử hoá: thư viện Ollama thì
 * dùng danh sách quen thuộc, còn kho HF thì hỏi thẳng kho rồi hiện đúng những
 * bản có thật kèm dung lượng — đoán mò một tag không tồn tại chỉ tổ nhận lỗi.
 */
export function ModelDownload({ busy }: { busy: boolean }) {
  const [base, setBase] = useState("qwen3:14b");
  const [quant, setQuant] = useState("q4_K_M");
  const [hfQuant, setHfQuant] = useState("");

  const typed = base.trim();
  const hf = looksLikeHfRepo(typed);
  const repo = useDebounced(typed, 300);

  // Chỉ hỏi khi ô đã lặng. Thiếu vế `repo === typed` thì ngay sau khi dán link,
  // `hf` đã bật mà `repo` còn là giá trị CŨ — trang đi quét nhầm thứ vừa bị
  // thay đi, rồi hiện danh sách của nó.
  const ready = hf && repo === typed;
  const scan = useApi<{ repo: string; variants: Variant[] }>(
    ready ? `/api/models/hf?repo=${encodeURIComponent(repo)}` : null,
  );
  const scanning = hf && (!ready || scan.isLoading);

  const variants = scan.data?.variants ?? [];
  // Bản nhẹ nhất là mặc định, và cũng là chỗ lùi về khi đổi sang kho khác
  // không có mức đang chọn.
  const chosen = variants.find((v) => v.quant === hfQuant) ?? variants[0];
  const tag = hf ? (chosen?.tag ?? "") : quant ? `${base}-${quant}` : base;

  return (
    <Section title="Tải model về">
      <Form
        path="/api/models/pull"
        submit={tag ? `Tải ${tag}` : "Tải"}
        // Mỗi lần một model: tải hai model 9 GB song song trên một đường mạng
        // thì cả hai đều chậm, và thanh tiến độ khó đọc.
        disabled={busy || !tag}
        className="space-y-3 rounded border border-neutral-800 p-4"
      >
        <input type="hidden" name="model" value={tag} />

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Model</span>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            list="model-suggestions"
            aria-label="Model"
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
        </label>
        <datalist id="model-suggestions">
          {SUGGESTED.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Mức lượng tử hoá</span>
          {hf ? (
            <>
              <select
                value={chosen?.quant ?? ""}
                onChange={(e) => setHfQuant(e.target.value)}
                disabled={variants.length === 0}
                aria-label="Mức lượng tử hoá"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm disabled:text-neutral-600"
              >
                {variants.length === 0 ? (
                  <option value="">
                    {scanning ? "đang quét kho…" : "— chưa quét được kho —"}
                  </option>
                ) : (
                  variants.map((v) => (
                    <option key={v.quant} value={v.quant}>
                      {v.quant} — {gb(v.sizeBytes)}
                      {v.parts > 1 && ` · ${v.parts} phần`}
                    </option>
                  ))
                )}
              </select>
              <span className="mt-1 block text-xs text-neutral-600">
                {chosen && chosen.parts > 1
                  ? "Bản này bị chia nhiều phần — dung lượng trên đã cộng cả."
                  : "Lấy thẳng từ kho: chỉ hiện những bản kho đó thật sự có."}
              </span>
            </>
          ) : (
            <>
              <select
                value={quant}
                onChange={(e) => setQuant(e.target.value)}
                aria-label="Mức lượng tử hoá"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {QUANTS.map((q) => (
                  <option key={q.tag} value={q.tag}>
                    {q.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-600">
                {QUANTS.find((q) => q.tag === quant)?.hint}
              </span>
            </>
          )}
        </label>

        {hf && scan.data && (
          <p className="text-xs text-neutral-500">
            <span className="font-mono text-neutral-300">{scan.data.repo}</span> ·{" "}
            {scan.data.variants.length} bản
          </p>
        )}
        <ErrorNote error={scan.error} />

        {tag && (
          <p className="rounded bg-neutral-900 p-2 font-mono text-xs text-neutral-400">
            ollama pull {tag}
          </p>
        )}
        <p className="text-xs text-neutral-600">
          {hf ? (
            <>
              Dán đường dẫn kho GGUF là trang tự quét. Ollama chỉ chạy được{" "}
              <strong className="text-neutral-400">GGUF</strong>, nên tìm kho có đuôi{" "}
              <code>-GGUF</code>.
            </>
          ) : (
            "Không phải model nào cũng có đủ mọi mức lượng tử hoá. Tag không tồn tại thì Ollama báo lỗi và hiện ngay ở đây."
          )}
        </p>
        {busy && <p className="text-xs text-neutral-600">Đang tải model khác — xong rồi hãy tải tiếp.</p>}
      </Form>
    </Section>
  );
}
