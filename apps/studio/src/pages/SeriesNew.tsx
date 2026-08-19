import { useNavigate } from "react-router";
import { Form } from "@/components/Form";
import { Field } from "@/components/Field";
import { ModelPicker } from "@/components/ModelPicker";

const GENRES = ["kinh dị", "tình cảm", "trinh thám", "đời thường", "kỳ ảo"];

export function SeriesNew() {
  const nav = useNavigate();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Truyện mới</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Viết một dòng ý tưởng. Máy sẽ dựng dàn ý, nhân vật và chia cảnh — bạn sửa lại trước khi
          cho viết.
        </p>
      </div>

      <Form
        path="/api/series"
        submit="Dựng dàn ý"
        className="space-y-4"
        onDone={(r) => {
          const jobId = (r as unknown as { jobId?: string }).jobId;
          if (jobId) nav(`/job/${jobId}`);
        }}
      >
        <Field
          name="idea"
          label="Ý tưởng"
          placeholder="một tài xế xe khách đêm chở phải hành khách đã chết từ ba năm trước"
          rows={3}
        />

        <div className="flex gap-4">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-neutral-400">Thể loại</span>
            <select
              name="genre"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="w-32">
            <span className="mb-1 block text-sm text-neutral-400">Số tập</span>
            <input
              name="episodeCount"
              type="number"
              min={1}
              max={30}
              defaultValue={1}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
          </label>
        </div>

        <ModelPicker />

        <details className="rounded border border-neutral-800">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
            Thiết lập thế giới trước{" "}
            <span className="text-neutral-600">— tuỳ chọn, nhưng nên có với truyện dài</span>
          </summary>
          <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
            <p className="text-xs text-neutral-500">
              Bỏ trống thì AI tự nghĩ ra bối cảnh, bạn sửa lại sau ở trang Story Bible. Điền sẵn thì
              AI buộc phải bám theo ngay từ dàn ý — đỡ phải viết lại.
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
              placeholder="Không kết thúc bằng giấc mơ"
              rows={2}
            />
          </div>
        </details>
      </Form>
    </div>
  );
}
