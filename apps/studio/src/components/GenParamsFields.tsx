export interface GenParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

/**
 * Ô nhập tham số sinh.
 *
 * Thay cho ô gõ JSON tay: gõ sai tên khoá thì xưa nay không có gì báo, tham số
 * lặng lẽ bị bỏ qua và văn vẫn ra — chỉ là ra bằng giá trị mặc định, nên rất
 * khó nhận ra mình vừa không đổi được gì.
 *
 * Khoảng hợp lệ lấy từ API chứ không chép lại ở đây: chép lại là sớm muộn giao
 * diện cho nhập thứ mà API từ chối.
 *
 * Ô trống = không đặt, rơi về mặc định của provider — và gợi ý mờ trong ô trống
 * chính là giá trị mặc định đó.
 */
export function GenParamsFields({
  specs,
  params,
  unknownParams = [],
  compact = false,
}: {
  specs: GenParamSpec[];
  params: Record<string, number>;
  unknownParams?: string[];
  /** Bản gọn cho bảng nhiều dòng — bỏ phần giải thích dài. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
        {specs.map((spec) => (
          <label key={spec.key} className={compact ? "w-28" : "block"}>
            <span className="mb-1 block text-xs text-neutral-500">{spec.label}</span>
            <input
              name={spec.key}
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              defaultValue={params[spec.key] ?? ""}
              placeholder={String(spec.fallback)}
              title={spec.hint}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
            />
            {!compact && <span className="mt-1 block text-xs text-neutral-600">{spec.hint}</span>}
          </label>
        ))}
      </div>

      {/*
        Khoá lạ trong dữ liệu cũ chưa bao giờ có tác dụng — provider chỉ đọc các
        khoá đã biết. Nói ra để khỏi tưởng mình đã vặn được cái gì đó.
      */}
      {unknownParams.length > 0 && (
        <p className="text-xs text-amber-500">
          Bỏ qua khoá không dùng tới: <code>{unknownParams.join(", ")}</code> — provider không đọc
          chúng, lưu lại là chúng biến mất.
        </p>
      )}
    </div>
  );
}
