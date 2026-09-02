import { useNavigate } from "react-router";
import { useApi } from "@/lib/api";
import { Form } from "@/components/Form";
import { Field } from "@/components/Field";
import { ModelPicker } from "@/components/ModelPicker";
import { LanguagePicker } from "@/components/LanguagePicker";
import { TagPicker } from "@/components/TagPicker";


export function SeriesNew() {
  const nav = useNavigate();
  // Lấy từ danh mục chứ không cứng trong mã: thêm thể loại ở trang Cài đặt là
  // ô này có ngay, và mỗi thể loại mang theo mô tả để model đọc.
  const { data } = useApi<{ genres: Array<{ name: string; description: string; enabled: boolean }> }>(
    "/api/genres",
  );
  const genres = (data?.genres ?? []).filter((g) => g.enabled);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Truyện mới</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Viết một dòng ý tưởng. Máy sẽ dựng dàn ý, nhân vật và <strong className="text-neutral-200">tập
          đầu tiên</strong> — bạn sửa lại trước khi cho viết. Tập sau thêm dần bằng nút “Viết tập
          mới” ở trang bộ truyện, để mỗi tập được dựng khi đã biết tập trước kết thúc ra sao.
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

        <div className="flex flex-wrap gap-4">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-neutral-400">Thể loại chính</span>
            <select
              name="genre"
              key={genres.length}
              disabled={genres.length === 0}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm disabled:text-neutral-600"
            >
              {/* Danh mục rỗng thì nói ra bằng một dòng. Select không có option
                  nào mở ra một danh sách trắng — trông như đang hỏng. */}
              {genres.length === 0 ? (
                <option value="">— chưa có thể loại nào —</option>
              ) : (
                genres.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
            {genres.length === 0 && (
              <span className="mt-1 block text-xs text-amber-500">
                Danh mục thể loại đang rỗng — thêm ở Cài đặt → Thể loại.
              </span>
            )}
          </label>
          <LanguagePicker />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-400">
            Thể loại phụ <span className="text-neutral-600">— tuỳ chọn</span>
          </span>
          <TagPicker genres={genres.map((g) => g.name)} />
          <span className="mt-1 block text-xs text-neutral-600">
            Bấm để chọn, chọn được nhiều. AI đọc chúng khi viết — thể loại chính quyết định dùng
            prompt nào, thể loại phụ lái giọng văn và tình tiết. Cũng thành từ khoá để người nghe
            tìm ra kênh.
          </span>
        </label>

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
