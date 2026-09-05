import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ErrorNote, Loading } from "@/components/Form";

interface Row {
  id: string;
  number: number;
  title: string;
  durationMs: number | null;
  publishedAt: string | null;
  series: { title: string; slug: string };
  listeners: number;
  avgCompletion: number;
  finished: number;
  rating: number | null;
  ratingCount: number;
  favorites: number;
  commentsApproved: number;
  commentsPending: number;
}

interface Data {
  users: number;
  totals: {
    episodes: number;
    listeners: number;
    finished: number;
    favorites: number;
    comments: number;
    pending: number;
  };
  episodes: Row[];
}

export function Stats() {
  const { data, isLoading, error } = useApi<Data>("/api/stats", { refetchMs: 30_000 });
  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Loading />;

  // Xếp theo số người nghe: câu hỏi đầu tiên luôn là "tập nào nhiều người nghe nhất".
  const rows = [...data.episodes].sort((a, b) => b.listeners - a.listeners);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Thống kê</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Đọc thẳng từ DB của trang nghe, không sao chép về đây — nên số liệu luôn là thứ người
          nghe đang tạo ra.
        </p>
        <p className="mt-2 max-w-2xl rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
          Chỉ đếm được người <strong>đã đăng nhập</strong>. Ai nghe mà không đăng nhập thì vị trí
          chỉ nằm trong máy họ, máy chủ không hề biết — nên đây là con số sàn dưới, không phải
          tổng lượt nghe.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tài khoản" value={data.users} />
        <Stat label="Tập đã xuất bản" value={data.totals.episodes} />
        <Stat label="Lượt bắt đầu nghe" value={data.totals.listeners} />
        <Stat label="Nghe hết" value={data.totals.finished} />
        <Stat label="Lượt yêu thích" value={data.totals.favorites} />
        <Stat
          label="Bình luận"
          value={data.totals.comments}
          hint={data.totals.pending > 0 ? `${data.totals.pending} chờ duyệt` : undefined}
        />
      </div>

      {data.totals.pending > 0 && (
        <p className="text-sm text-amber-300">
          <Link to="/comments" className="underline">
            {data.totals.pending} bình luận đang chờ duyệt
          </Link>{" "}
          — chưa duyệt thì chúng không hiện ở trang nghe.
        </p>
      )}

      <Section title="Theo tập">
        {rows.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
            Chưa có tập nào xuất bản.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2">Tập</th>
                  <th className="text-right">Bắt đầu</th>
                  <th className="text-right">Nghe hết</th>
                  <th className="text-right">Nghe được</th>
                  <th className="text-right">Sao</th>
                  <th className="text-right">Yêu thích</th>
                  <th className="text-right">Bình luận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-64 py-2">
                      <Link to={`/episode/${r.id}`} className="hover:underline">
                        <span className="text-neutral-500">{r.number}.</span> {r.title}
                      </Link>
                      <div className="truncate text-xs text-neutral-600">{r.series.title}</div>
                    </td>
                    <td className="text-right tabular-nums">{r.listeners}</td>
                    <td className="text-right tabular-nums text-neutral-400">{r.finished}</td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.listeners > 0 ? `${r.avgCompletion.toFixed(0)}%` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.rating !== null ? `${r.rating.toFixed(1)} (${r.ratingCount})` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-neutral-400">{r.favorites}</td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.commentsApproved}
                      {r.commentsPending > 0 && (
                        <span className="ml-1">
                          <Badge tone="amber">+{r.commentsPending}</Badge>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-600">
          <strong className="text-neutral-500">Nghe được</strong> là phần trăm trung bình của tập,
          tính trên những người đã bắt đầu. Con số thấp ở một tập cụ thể đáng xem lại — người nghe
          bỏ giữa chừng ở đó.
        </p>
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-amber-500">{hint}</div>}
    </div>
  );
}
