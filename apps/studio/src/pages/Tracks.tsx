import { mediaUrl, useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TextInput } from "@/components/Field";

/** UNKNOWN là thứ chặn xuất bản, nên phải nhìn thấy ngay chứ không lẫn vào đám xám. */
const LICENSE_TONE: Record<string, string> = {
  ROYALTY_FREE: "green",
  CC0: "green",
  CC_BY: "green",
  PURCHASED: "green",
  SELF_MADE: "green",
  UNKNOWN: "red",
};
const LICENSE_LABEL: Record<string, string> = {
  ROYALTY_FREE: "miễn phí bản quyền",
  CC0: "CC0",
  CC_BY: "CC BY — phải ghi nguồn",
  PURCHASED: "đã mua",
  SELF_MADE: "tự làm",
  UNKNOWN: "chưa rõ",
};
const KIND_LABEL: Record<string, string> = {
  BGM: "nhạc nền",
  SFX: "hiệu ứng",
  INTRO: "nhạc mở",
  OUTRO: "nhạc kết",
};

interface Track {
  id: string;
  title: string;
  kind: string;
  url: string;
  durationMs: number;
  mood: string | null;
  tags: string[];
  licenseType: string;
  licenseNote: string | null;
  attribution: string | null;
  _count: { episodesAsBgm: number };
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Tracks() {
  const { data, isLoading } = useApi<{ tracks: Track[]; storageDriver: string }>("/api/tracks");
  if (isLoading || !data) return <Loading />;

  const isLocal = data.storageDriver === "local";
  const unknown = data.tracks.filter((t) => t.licenseType === "UNKNOWN");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Thư viện nhạc</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Nhạc nền được trộn dưới lời đọc kèm <strong className="text-neutral-200">ducking</strong> —
          nhạc tự nhỏ lại khi có lời, tự to lên ở khoảng lặng. Chọn nhạc cho từng tập ở trang Audio
          của tập đó.
        </p>
      </div>

      {unknown.length > 0 && (
        <p className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {unknown.length} track chưa xác minh giấy phép. Tập nào dùng chúng sẽ bị chặn ở bước xuất
          bản — điền giấy phép trước khi đưa vào tập.
        </p>
      )}

      <Section title={`Track (${data.tracks.length})`}>
        {data.tracks.length === 0 ? (
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-500">
            Chưa có track nào. Thêm một bản nhạc ở form bên dưới.
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.tracks.map((t) => (
              <div key={t.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <Badge>{KIND_LABEL[t.kind] ?? t.kind}</Badge>
                      <Badge tone={LICENSE_TONE[t.licenseType]}>
                        {LICENSE_LABEL[t.licenseType] ?? t.licenseType}
                      </Badge>
                      {t._count.episodesAsBgm > 0 && (
                        <Badge tone="blue">{t._count.episodesAsBgm} tập đang dùng</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {t.durationMs > 0 ? formatDuration(t.durationMs) : "độ dài chưa rõ"}
                      {t.mood ? ` · ${t.mood}` : ""}
                      {t.tags.length > 0 ? ` · ${t.tags.join(", ")}` : ""}
                    </p>
                    {(t.attribution || t.licenseNote) && (
                      <p className="mt-1 text-xs text-neutral-600">
                        {t.attribution}
                        {t.attribution && t.licenseNote ? " — " : ""}
                        {t.licenseNote}
                      </p>
                    )}
                  </div>
                  <ActionButton
                    path={`/api/tracks/${t.id}`}
                    method="DELETE"
                    confirmText={`Xoá "${t.title}" khỏi thư viện? File trên đĩa vẫn giữ.`}
                  >
                    xoá
                  </ActionButton>
                </div>
                <audio controls preload="none" className="h-8 w-full max-w-md" src={mediaUrl(t.url)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Thêm track">
        <Form
          path="/api/tracks"
          submit="Thêm vào thư viện"
          className="space-y-3 rounded border border-neutral-800 p-4"
          resetOnSuccess
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput name="title" label="Tên" placeholder="Đêm mưa — piano trầm" />
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Loại</span>
              <select
                name="kind"
                defaultValue="BGM"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLocal ? (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">File</span>
              <input
                type="file"
                name="file"
                accept="audio/*"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Lưu vào cùng kho mà worker đọc. Độ dài được đo tự động.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">URL công khai</span>
              <input
                name="url"
                placeholder="https://..."
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Đang dùng STORAGE_DRIVER={data.storageDriver} — không tải file lên thay bạn được.
              </span>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Giấy phép</span>
              <select
                name="licenseType"
                defaultValue="UNKNOWN"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.entries(LICENSE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextInput name="mood" label="Không khí (tuỳ chọn)" placeholder="u ám, căng thẳng" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name="attribution"
              label="Ghi nguồn (bắt buộc với CC BY)"
              placeholder="Nhạc: Tên tác giả"
            />
            <TextInput
              name="tags"
              label="Thẻ, cách nhau bằng dấu phẩy"
              placeholder="piano, chậm, kinh dị"
            />
          </div>

          <TextInput
            name="licenseNote"
            label="Ghi chú giấy phép"
            placeholder="Mua ở ... ngày ... / link điều khoản"
          />
        </Form>
      </Section>
    </div>
  );
}
