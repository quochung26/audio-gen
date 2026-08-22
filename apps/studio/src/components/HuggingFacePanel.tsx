import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Button, Section } from "@/components/ui";
import { ActionButton, ErrorNote, Loading } from "@/components/Form";

interface Variant {
  quant: string;
  sizeBytes: number;
  /** Lớn hơn 1 nghĩa là bản này bị chia nhiều file. */
  parts: number;
  /** Tên đầy đủ mà `ollama pull` hiểu. */
  tag: string;
}

/**
 * Dung lượng THẬP PHÂN cho khớp con số Hugging Face hiện trên trang kho.
 * Xem chú thích ở trang Model.
 */
function gb(bytes: number): string {
  if (bytes <= 0) return "—";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/**
 * Tải model GGUF thẳng từ Hugging Face.
 *
 * Danh sách lượng tử hoá cố định ở mục "Tải model về" chỉ đúng với thư viện
 * chính chủ của Ollama. Kho trên HF mỗi nơi một kiểu — có kho chỉ có `Q4_K_M`
 * và `Q8_0`, có kho có cả chục bản `IQ*`. Nên quét thẳng kho rồi hiện đúng
 * những bản thật sự có, kèm dung lượng, thay vì đoán.
 */
export function HuggingFacePanel({ busy }: { busy: boolean }) {
  const [input, setInput] = useState("");
  const [repo, setRepo] = useState<string | null>(null);

  const scan = useApi<{ repo: string; variants: Variant[] }>(
    repo ? `/api/models/hf?repo=${encodeURIComponent(repo)}` : null,
  );

  return (
    <Section title="Tải từ Hugging Face">
      <div className="space-y-3 rounded border border-neutral-800 p-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setRepo(input.trim() || null);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Đường dẫn kho Hugging Face"
            placeholder="https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF"
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
          <Button type="submit" disabled={!input.trim()}>
            Quét kho
          </Button>
        </form>

        <p className="text-xs text-neutral-600">
          Dán đường dẫn kho GGUF rồi bấm quét — trang sẽ hiện đúng những bản lượng tử hoá kho đó
          thật sự có. Ollama chỉ chạy được <strong className="text-neutral-400">GGUF</strong>, nên
          tìm kho có đuôi <code>-GGUF</code>.
        </p>

        {scan.isLoading && <Loading />}
        <ErrorNote error={scan.error} />

        {scan.data && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500">
              <span className="font-mono text-neutral-300">{scan.data.repo}</span> ·{" "}
              {scan.data.variants.length} bản
            </p>
            <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
              {scan.data.variants.map((v) => (
                <div
                  key={v.tag}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-neutral-200">{v.quant}</div>
                    <div className="mt-0.5 text-xs text-neutral-600">
                      {gb(v.sizeBytes)}
                      {v.parts > 1 && ` · ${v.parts} phần`}
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    {v.parts > 1 && <Badge tone="amber">chia nhiều phần</Badge>}
                    {/*
                      Mỗi lần một model: tải hai model 9 GB song song trên một
                      đường mạng thì cả hai đều chậm, và thanh tiến độ khó đọc.
                    */}
                    {busy ? (
                      <span className="text-xs text-neutral-600">đang tải model khác</span>
                    ) : (
                      <ActionButton path="/api/models/pull" body={{ model: v.tag }}>
                        tải bản này
                      </ActionButton>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-mono text-xs text-neutral-600">
              ollama pull {scan.data.variants[0]!.tag}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
