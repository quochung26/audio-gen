import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";
import { GenParamsFields, type GenParamSpec } from "@/components/GenParamsFields";

interface P {
  id: string;
  step: string;
  genre: string;
  version: number;
  active: boolean;
  wins: boolean;
  params: Record<string, number>;
  unknownParams: string[];
}

/**
 * Vặn tham số sinh cho cả sáu bước trong một màn.
 *
 * Chỉ liệt kê bản THẮNG của mỗi bước — bản mà worker thật sự dùng. Liệt kê hết
 * mọi biến thể thì bảng dài ra mà phần lớn dòng chẳng ảnh hưởng gì tới lượt
 * chạy tiếp theo; sửa biến thể thì vào trang Prompt.
 */
export function GenParamsSettings() {
  const { data, isLoading } = useApi<{ prompts: P[]; genParams: GenParamSpec[] }>("/api/prompts");
  if (isLoading || !data) return <Loading />;

  const winners = data.prompts.filter((p) => p.wins);

  return (
    <Section title="Tham số sinh">
      <p className="-mt-1 text-xs text-neutral-500">
        Mỗi bước một bộ tham số riêng, vì chúng cần khác nhau: bước viết cần{" "}
        <code>temperature</code> cao cho văn biến hoá, bước biên tập và tóm tắt cần thấp cho bám
        sát bản gốc. Ô trống thì dùng mặc định của provider — số mờ trong ô chính là giá trị đó.
      </p>

      <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
        {winners.map((p) => (
          <Form
            key={p.id}
            path={`/api/prompts/${p.id}/params`}
            method="PUT"
            submit="Lưu"
            className="px-4 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-neutral-200">{p.step}</span>
              {p.genre !== "*" && <span className="text-xs text-neutral-500">· {p.genre}</span>}
              <Link
                to={`/prompts/${p.id}`}
                className="text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                sửa prompt
              </Link>
            </div>
            <GenParamsFields
              specs={data.genParams}
              params={p.params}
              unknownParams={p.unknownParams}
              compact
            />
          </Form>
        ))}
      </div>
    </Section>
  );
}
