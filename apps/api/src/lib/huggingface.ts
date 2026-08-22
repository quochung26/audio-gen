/**
 * Tải model GGUF thẳng từ Hugging Face.
 *
 * Ollama kéo được từ HF bằng tên dạng `hf.co/{user}/{repo}:{QUANT}`, nên phần
 * việc ở đây chỉ là: bóc tên kho từ đường dẫn người dùng dán vào, liệt kê các
 * bản lượng tử hoá có trong kho, rồi ghép lại thành tên mà Ollama hiểu.
 */

/**
 * Bóc "user/repo" từ thứ người dùng dán vào.
 *
 * Nhận cả đường dẫn đầy đủ lẫn dạng rút gọn, vì dán từ thanh địa chỉ thì thường
 * kèm `/tree/main` và tham số truy vấn.
 */
export function parseHfRepo(input: string): string | null {
  let text = input.trim();
  if (!text) return null;

  // Bỏ giao thức và tên miền nếu có.
  text = text.replace(/^https?:\/\//i, "");
  text = text.replace(/^(?:www\.)?(?:huggingface\.co|hf\.co)\//i, "");
  // Bỏ tham số truy vấn và neo.
  text = text.split(/[?#]/)[0]!;
  // Bỏ phần điều hướng trong kho: /tree/main, /blob/main/abc.gguf, /resolve/…
  text = text.replace(/\/(tree|blob|resolve|raw)\/.*$/i, "");
  text = text.replace(/\/+$/, "");

  const parts = text.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [user, repo] = parts as [string, string];
  const ok = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!ok.test(user) || !ok.test(repo)) return null;
  if (text.length > 120) return null;

  return `${user}/${repo}`;
}

/**
 * Đọc mức lượng tử hoá từ tên file.
 *
 * Tên file GGUF trên HF không theo một chuẩn nào: có kho viết `Q4_K_M`, có kho
 * viết `q4_k_m`, có kho ngăn bằng dấu chấm thay vì gạch ngang. Nên tìm theo
 * mẫu ở bất cứ đâu trong tên chứ không cắt theo vị trí.
 *
 * Nhờ tìm theo mẫu mà không phải xử riêng file chia nhiều phần
 * ("…-Q4_K_M-00001-of-00009.gguf"): số thứ tự không khớp mẫu nên bị bỏ qua, và
 * các phần tự gom về cùng một bản vì cùng mức lượng tử hoá.
 */
export function quantFromFilename(filename: string): string | null {
  const base = filename.split("/").pop() ?? filename;
  if (!/\.gguf$/i.test(base)) return null;

  const m = /(?:^|[-_.])((?:IQ|Q)\d+(?:_[A-Za-z0-9]+)*|BF16|F16|F32)(?=[-_.]|$)/i.exec(
    base.replace(/\.gguf$/i, ""),
  );
  return m?.[1] ?? null;
}

export interface HfFile {
  path: string;
  size?: number;
  lfs?: { size?: number };
}

export interface QuantVariant {
  /** Đúng chuỗi trong tên file — Ollama đối chiếu với nó. */
  quant: string;
  /** Tổng dung lượng, cộng cả các phần nếu file bị chia nhỏ. */
  sizeBytes: number;
  /** Số file — lớn hơn 1 nghĩa là bản này bị chia nhiều phần. */
  parts: number;
}

/**
 * Gom file GGUF trong kho thành danh sách bản lượng tử hoá.
 *
 * Cộng dung lượng theo bản chứ không theo file: model lớn hay bị chia thành
 * chục phần, hiện dung lượng từng phần thì không ai ước lượng được phải tải
 * bao nhiêu.
 */
export function collectQuantVariants(files: HfFile[]): QuantVariant[] {
  const byQuant = new Map<string, QuantVariant>();

  for (const f of files) {
    const quant = quantFromFilename(f.path);
    if (!quant) continue;

    const key = quant.toUpperCase();
    const size = f.lfs?.size ?? f.size ?? 0;
    const cur = byQuant.get(key);
    if (cur) {
      cur.sizeBytes += size;
      cur.parts += 1;
    } else {
      byQuant.set(key, { quant, sizeBytes: size, parts: 1 });
    }
  }

  // Nhẹ lên trước: bản nhẹ nhất thường là bản người ta thử đầu tiên.
  return [...byQuant.values()].sort((a, b) => a.sizeBytes - b.sizeBytes);
}

/** Tên mà `ollama pull` hiểu. */
export function hfPullTag(repo: string, quant: string): string {
  return `hf.co/${repo}:${quant}`;
}
