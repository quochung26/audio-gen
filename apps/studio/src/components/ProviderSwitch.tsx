import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/Form";

/**
 * Chọn nơi chạy model — MỘT trong hai.
 *
 * Ollama tại chỗ: miễn phí, nội dung không rời khỏi máy, nhưng giới hạn bởi
 * card đồ hoạ ở nhà. OpenRouter: model mạnh hơn nhiều, trả tiền theo token, và
 * nội dung gửi đi.
 *
 * Đổi là ăn ngay ở lượt gọi model tiếp theo, kể cả worker đang chạy dở: lựa
 * chọn nằm trong bảng `Setting` và được hỏi lại mỗi lượt.
 */
export function ProviderSwitch({
  provider,
  envProvider,
  openRouterReady,
}: {
  provider: string;
  envProvider: string;
  /** Có khoá API và gọi được không — chưa sẵn sàng thì đổi sang là job chết. */
  openRouterReady: boolean;
}) {
  const options = [
    {
      id: "ollama",
      title: "Ollama — tại chỗ",
      desc: "Miễn phí. Nội dung không rời khỏi máy. Giới hạn bởi card đồ hoạ ở nhà.",
      blocked: null as string | null,
    },
    {
      id: "openrouter",
      title: "OpenRouter — đám mây",
      desc: "Model mạnh hơn nhiều, trả tiền theo token. Nội dung gửi lên rời khỏi máy này.",
      blocked: openRouterReady ? null : "Chưa kết nối được — xem khối OpenRouter bên dưới.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const on = provider === o.id;
          return (
            <div
              key={o.id}
              className={`rounded border p-4 ${
                on ? "border-neutral-500 bg-neutral-900" : "border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-200">{o.title}</span>
                {on && <Badge tone="green">đang chạy</Badge>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{o.desc}</p>

              {!on && (
                <div className="mt-3">
                  {o.blocked ? (
                    <p className="text-xs text-amber-500">{o.blocked}</p>
                  ) : (
                    <ActionButton
                      path="/api/models/provider"
                      method="PUT"
                      body={{ provider: o.id }}
                      confirmText={
                        o.id === "openrouter"
                          ? "Chuyển sang OpenRouter? Story Bible, bản thảo và lời thoại sẽ được gửi lên dịch vụ đám mây, và mỗi lượt sinh đều tính tiền."
                          : undefined
                      }
                    >
                      chuyển sang {o.id === "ollama" ? "Ollama" : "OpenRouter"}
                    </ActionButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {provider === "mock" && (
        <p className="rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
          Đang chạy provider <strong>giả lập</strong> — model không thật sự viết gì. Chọn một trong
          hai ở trên để chạy thật.
        </p>
      )}

      <p className="text-xs text-neutral-600">
        Model mặc định nhớ riêng cho từng bên, nên đổi qua đổi lại không mất lựa chọn cũ.{" "}
        {provider !== envProvider && (
          <>
            Giá trị trong <code>.env</code> là <code>{envProvider}</code>; lựa chọn ở đây đè lên nó.
          </>
        )}
      </p>
    </div>
  );
}
