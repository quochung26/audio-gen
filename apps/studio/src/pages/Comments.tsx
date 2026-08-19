import { useState } from "react";
import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Loading } from "@/components/Form";

interface Comment {
  id: string;
  body: string;
  timestampMs: number | null;
  createdAt: string;
  status: string;
  user: { name: string | null; email: string | null };
  episode: { id: string; number: number; title: string; series: { title: string } };
}

const TABS = [
  ["PENDING", "Chờ duyệt"],
  ["APPROVED", "Đã duyệt"],
  ["REJECTED", "Đã từ chối"],
] as const;

function fmt(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Comments() {
  const [tab, setTab] = useState<string>("PENDING");
  const { data, isLoading } = useApi<{
    comments: Comment[];
    counts: Array<{ status: string; _count: number }>;
    separateDb: boolean;
  }>(`/api/comments?status=${tab}`, { refetchMs: 15000 });

  if (isLoading || !data) return <Loading />;
  const count = (s: string) => data.counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bình luận</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Bình luận của người nghe vào <strong className="text-neutral-200">hàng chờ</strong> và
          không hiện ở trang nghe cho tới khi được duyệt. Người gửi cũng không thấy bình luận của
          chính mình — thấy nó thì tưởng đã công khai rồi.
        </p>
        {!data.separateDb && (
          <p className="mt-2 text-xs text-neutral-600">
            Đang chạy chung một DB (PLAYER_DATABASE_URL trống).
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === value ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-neutral-400"
            }`}
          >
            {label} ({count(value)})
          </button>
        ))}
      </div>

      <Section title={`${data.comments.length} bình luận`}>
        {data.comments.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
            {tab === "PENDING" ? "Hàng chờ trống." : "Không có bình luận nào."}
          </p>
        ) : (
          <div className="space-y-3">
            {data.comments.map((c) => (
              <div key={c.id} className="rounded border border-neutral-800 p-4">
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-neutral-500">
                  <span className="text-neutral-300">{c.user.name ?? "Người nghe"}</span>
                  <span className="text-neutral-600">{c.user.email}</span>
                  <Link
                    to={`/episode/${c.episode.id}`}
                    className="text-neutral-500 underline"
                  >
                    {c.episode.series.title} · tập {c.episode.number}
                  </Link>
                  {c.timestampMs !== null && (
                    <span className="text-neutral-600">tại {fmt(c.timestampMs)}</span>
                  )}
                  <span className="text-neutral-700">
                    {new Date(c.createdAt).toLocaleString("vi")}
                  </span>
                  {c.status !== "PENDING" && (
                    <Badge tone={c.status === "APPROVED" ? "green" : "red"}>
                      {c.status === "APPROVED" ? "đã duyệt" : "đã từ chối"}
                    </Badge>
                  )}
                </div>

                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">
                  {c.body}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-900 pt-3">
                  {c.status !== "APPROVED" && (
                    <ActionButton
                      path={`/api/comments/${c.id}`}
                      method="PUT"
                      body={{ status: "APPROVED" }}
                      variant="primary"
                    >
                      Duyệt
                    </ActionButton>
                  )}
                  {c.status !== "REJECTED" && (
                    <ActionButton
                      path={`/api/comments/${c.id}`}
                      method="PUT"
                      body={{ status: "REJECTED" }}
                    >
                      Từ chối
                    </ActionButton>
                  )}
                  <ActionButton
                    path={`/api/comments/${c.id}`}
                    method="DELETE"
                    confirmText="Xoá hẳn bình luận này?"
                  >
                    xoá hẳn
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
