import { AudioTrackKind, LicenseType, prisma } from "@audio/database";
import { loadEnv } from "@audio/config";
import { formatDuration } from "@audio/core";
import { Badge, Button, Section } from "@/components/ui";
import { createTrack, deleteTrack } from "../actions";

export const dynamic = "force-dynamic";

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

export default async function TracksPage() {
  const [tracks, env] = await Promise.all([
    prisma.audioTrack.findMany({
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { episodesAsBgm: true } } },
    }),
    Promise.resolve(loadEnv()),
  ]);

  const isLocal = env.STORAGE_DRIVER === "local";
  const unknown = tracks.filter((t) => t.licenseType === LicenseType.UNKNOWN);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Thư viện nhạc</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Nhạc nền được trộn dưới lời đọc kèm{" "}
          <strong className="text-neutral-200">ducking</strong> — nhạc tự nhỏ lại khi có lời, tự to
          lên ở khoảng lặng. Chọn nhạc cho từng tập ở trang Audio của tập đó.
        </p>
      </div>

      {unknown.length > 0 && (
        <p className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {unknown.length} track chưa xác minh giấy phép. Tập nào dùng chúng sẽ bị chặn ở bước xuất
          bản — điền giấy phép trước khi đưa vào tập.
        </p>
      )}

      <Section title={`Track (${tracks.length})`}>
        {tracks.length === 0 ? (
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-500">
            Chưa có track nào. Thêm một bản nhạc ở form bên dưới.
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {tracks.map((t) => (
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
                  <form action={deleteTrack.bind(null, t.id)} className="shrink-0">
                    <Button variant="ghost">xoá</Button>
                  </form>
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" className="h-8 w-full max-w-md" src={proxy(t.url)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Thêm track">
        <form action={createTrack} className="space-y-3 rounded border border-neutral-800 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Tên</span>
              <input
                name="title"
                required
                placeholder="Đêm mưa — piano trầm"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Loại</span>
              <select
                name="kind"
                defaultValue={AudioTrackKind.BGM}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.values(AudioTrackKind).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k] ?? k}
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
                Đang dùng STORAGE_DRIVER={env.STORAGE_DRIVER} — Studio không tải file lên thay bạn
                được. Tải lên R2 rồi dán URL vào đây.
              </span>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Giấy phép</span>
              <select
                name="licenseType"
                defaultValue={LicenseType.UNKNOWN}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.values(LicenseType).map((l) => (
                  <option key={l} value={l}>
                    {LICENSE_LABEL[l] ?? l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Không khí (tuỳ chọn)</span>
              <input
                name="mood"
                placeholder="u ám, căng thẳng"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">
                Ghi nguồn (bắt buộc với CC BY)
              </span>
              <input
                name="attribution"
                placeholder="Nhạc: Tên tác giả"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Thẻ, cách nhau bằng dấu phẩy</span>
              <input
                name="tags"
                placeholder="piano, chậm, kinh dị"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Ghi chú giấy phép</span>
            <input
              name="licenseNote"
              placeholder="Mua ở ... ngày ... / link điều khoản"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
          </label>

          <Button variant="primary">Thêm vào thư viện</Button>
        </form>
      </Section>
    </div>
  );
}

/** file:// không phát được trong trình duyệt — đi qua route phục vụ file. */
function proxy(url: string): string {
  if (url.startsWith("file://")) {
    return `/api/audio?path=${encodeURIComponent(url.slice("file://".length))}`;
  }
  return url;
}
