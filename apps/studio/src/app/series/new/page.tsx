import { createStory } from "../../actions";
import { Button } from "@/components/ui";

const GENRES = ["kinh dị", "tình cảm", "trinh thám", "đời thường", "kỳ ảo"];

function Field({
  name,
  label,
  placeholder,
  rows,
}: {
  name: string;
  label: string;
  placeholder: string;
  rows: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs text-neutral-400">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2.5 text-sm outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}

export default function NewSeriesPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Truyện mới</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Viết một dòng ý tưởng. Máy sẽ dựng dàn ý, nhân vật và chia cảnh — bạn sửa lại trước
          khi cho viết.
        </p>
      </div>

      <form action={createStory} className="space-y-4">
        <div>
          <label htmlFor="idea" className="mb-1 block text-sm text-neutral-400">
            Ý tưởng
          </label>
          <textarea
            id="idea"
            name="idea"
            required
            rows={3}
            placeholder="một tài xế xe khách đêm chở phải hành khách đã chết từ ba năm trước"
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-3 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="genre" className="mb-1 block text-sm text-neutral-400">
              Thể loại
            </label>
            <select
              id="genre"
              name="genre"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label htmlFor="episodeCount" className="mb-1 block text-sm text-neutral-400">
              Số tập
            </label>
            <input
              id="episodeCount"
              name="episodeCount"
              type="number"
              min={1}
              max={30}
              defaultValue={1}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
          </div>
        </div>

        <details className="rounded border border-neutral-800">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
            Thiết lập thế giới trước{" "}
            <span className="text-neutral-600">— tuỳ chọn, nhưng nên có với truyện dài</span>
          </summary>
          <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
            <p className="text-xs text-neutral-500">
              Bỏ trống thì AI tự nghĩ ra bối cảnh, bạn sửa lại sau ở trang Story Bible. Điền sẵn
              thì AI buộc phải bám theo ngay từ dàn ý — đỡ phải viết lại.
            </p>

            <Field
              name="setting"
              label="Bối cảnh"
              placeholder="Quốc lộ miền Trung, thập niên 1970. Đường vắng, sương mù, những chuyến xe chạy đêm."
              rows={2}
            />
            <Field
              name="rules"
              label="Luật thế giới — mỗi dòng một luật"
              placeholder={"Ma chỉ xuất hiện sau nửa đêm\nNgười chết không tự nói tên mình"}
              rows={3}
            />
            <Field
              name="tone"
              label="Giọng văn"
              placeholder="Chậm rãi, nhiều khoảng lặng. Sợ bằng không khí chứ không bằng máu me."
              rows={2}
            />
            <Field
              name="constraints"
              label="Điều cấm — mỗi dòng một điều"
              placeholder={"Không kết thúc bằng giấc mơ"}
              rows={2}
            />
          </div>
        </details>

        <Button type="submit" variant="primary">
          Dựng dàn ý
        </Button>
      </form>
    </div>
  );
}
