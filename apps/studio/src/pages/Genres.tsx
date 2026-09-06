import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface G {
  id: string;
  name: string;
  promptName: string;
  description: string;
  enabled: boolean;
  /** Bao nhiêu bộ đang dùng, tính cả làm thể loại chính lẫn phụ. */
  usedBy: number;
}

interface Data {
  genres: G[];
  /** Thể loại có bộ đang dùng nhưng chưa có trong danh mục. */
  unlisted: Array<{ name: string; usedBy: number }>;
}

export function Genres() {
  const { data, isLoading } = useApi<Data>("/api/genres");
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Thể loại</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Mô tả ở đây <strong className="text-neutral-200">không phải ghi chú cho người đọc</strong>{" "}
          — nó được nhét vào Story Bible, nên model hiểu “kinh dị” theo nghĩa bạn định thay vì nghĩa
          nó tự đoán. Sửa mô tả là đổi cách viết của mọi bộ dùng thể loại đó, từ lượt viết kế tiếp.
        </p>
      </div>

      <Section title="Thêm thể loại">
        <Form path="/api/genres" submit="Thêm" resetOnSuccess className="space-y-3 rounded border border-neutral-800 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs text-neutral-500">Tên — người nghe nhìn thấy</span>
              <input
                name="name"
                placeholder="kiếm hiệp"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Hiện ở trang nghe và trong từ khoá RSS — giữ tiếng của người nghe.
              </span>
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs text-neutral-500">
                Tên cho model <span className="text-neutral-600">— tuỳ chọn</span>
              </span>
              <input
                name="promptName"
                placeholder="wuxia"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Bỏ trống thì model đọc luôn tên bên trái. Đặt tên tiếng Anh thì model 7–14B có
                liên tưởng dày hơn hẳn.
              </span>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Mô tả — model sẽ đọc câu này</span>
            <textarea
              name="description"
              rows={3}
              placeholder="Focus on martial arts and the code of the jianghu. Fights need specific, named moves — no vague choreography."
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
            <span className="mt-1 block text-xs text-neutral-600">
              Viết <strong className="text-neutral-400">bằng tiếng Anh</strong>, như đang dặn
              người viết thuê: nói rõ cái gì nên và cái gì tránh. Câu này là chỉ dẫn cho model
              và nằm cùng khối prompt tiếng Anh, cạnh “tên cho model”.
            </span>
          </label>
        </Form>
      </Section>

      {data.unlisted.length > 0 && (
        <Section title="Đang dùng nhưng chưa có mô tả">
          <p className="-mt-1 text-xs text-neutral-500">
            Những thể loại này có truyện đang dùng nhưng chưa nằm trong danh mục, nên model không
            được dặn gì về chúng. Thêm ở trên với đúng tên để chúng có mô tả.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.unlisted.map((u) => (
              <Badge key={u.name} tone="amber">
                {u.name} · {u.usedBy} bộ
              </Badge>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Danh mục (${data.genres.length})`}>
        <div className="space-y-3">
          {data.genres.map((g) => (
            <Form
              key={g.id}
              path={`/api/genres/${g.id}`}
              method="PUT"
              submit="Lưu"
              className={`rounded border p-4 ${g.enabled ? "border-neutral-800" : "border-neutral-900 bg-neutral-950"}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  name="name"
                  defaultValue={g.name}
                  title="Tên người nghe nhìn thấy"
                  className="rounded border border-neutral-700 bg-neutral-900 p-1.5 text-sm"
                />
                <input
                  name="promptName"
                  defaultValue={g.promptName}
                  placeholder="tên cho model"
                  title="Tên đưa cho model đọc. Bỏ trống thì dùng tên bên trái."
                  className="rounded border border-neutral-800 bg-neutral-900 p-1.5 text-sm text-neutral-400"
                />
                {g.usedBy > 0 ? (
                  <Badge tone="green">{g.usedBy} bộ đang dùng</Badge>
                ) : (
                  <Badge>chưa bộ nào dùng</Badge>
                )}
                {!g.enabled && <Badge tone="amber">đã ẩn</Badge>}
              </div>
              <textarea
                name="description"
                rows={3}
                defaultValue={g.description}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton path={`/api/genres/${g.id}/toggle`} method="PUT">
                  {g.enabled ? "ẩn khỏi ô chọn" : "bật lại"}
                </ActionButton>
                {/* Xoá chỉ mở khi không bộ nào dùng — API cũng chặn lần nữa. */}
                {g.usedBy === 0 && (
                  <ActionButton
                    path={`/api/genres/${g.id}`}
                    method="DELETE"
                    confirmText={`Xoá thể loại "${g.name}"?`}
                  >
                    xoá
                  </ActionButton>
                )}
              </div>
            </Form>
          ))}
        </div>
      </Section>
    </div>
  );
}
