import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";
import { Field } from "@/components/Field";

interface World {
  setting: string;
  tone: string;
  rules: string[];
  constraints: string[];
  glossary: Array<{ term: string; meaning: string }>;
}

export function Bible() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{ world: World; bible: string; title: string }>(
    `/api/series/${id}/world`,
  );
  if (isLoading || !data) return <Loading />;
  const { world } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${id}`} className="text-xs text-neutral-500 underline">
          ← {data.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Thiết lập thế giới</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Phần này nạp vào mỗi lần viết cảnh, nên nó là thứ giữ cho tập 30 vẫn đúng luật đã đặt ở
          tập 1. Sửa ở đây <strong className="text-neutral-200">không</strong> làm mất dàn ý, và
          sinh lại dàn ý <strong className="text-neutral-200">không</strong> làm mất phần này.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Form path={`/api/series/${id}/world`} method="PUT" submit="Lưu thiết lập" className="space-y-5">
          <Field
            name="setting"
            label="Bối cảnh"
            hint="Thời gian, địa điểm, không khí."
            placeholder="Quốc lộ miền Trung, thập niên 1970. Những chuyến xe khách chạy đêm, đường vắng, sương mù."
            defaultValue={world.setting}
            rows={3}
          />
          <Field
            name="rules"
            label="Luật thế giới"
            hint="Mỗi dòng một luật. Những điều LUÔN đúng — AI không được viết trái."
            placeholder={"Ma chỉ xuất hiện sau nửa đêm\nNgười chết không tự nói tên mình"}
            defaultValue={world.rules.join("\n")}
            rows={5}
          />
          <Field
            name="tone"
            label="Giọng văn"
            hint="Cách kể mong muốn."
            placeholder="Chậm rãi, nhiều khoảng lặng. Sợ bằng không khí chứ không bằng máu me."
            defaultValue={world.tone}
            rows={2}
          />
          <Field
            name="constraints"
            label="Điều cấm"
            hint="Mỗi dòng một điều. Những thứ KHÔNG được xuất hiện."
            placeholder={"Không mô tả bạo lực với trẻ em\nKhông kết thúc bằng giấc mơ"}
            defaultValue={world.constraints.join("\n")}
            rows={3}
          />
          <Field
            name="glossary"
            label="Thuật ngữ"
            hint="Mỗi dòng một mục, dạng «tên: nghĩa». Giữ cho AI không đổi cách gọi giữa các tập."
            placeholder={"Bến Cũ: bến xe bỏ hoang ngoài rìa thị trấn"}
            defaultValue={world.glossary.map((g) => `${g.term}: ${g.meaning}`).join("\n")}
            rows={3}
          />
        </Form>

        <Section title="Xem trước — đây là thứ AI thật sự đọc">
          <pre className="max-h-[36rem] overflow-auto rounded border border-neutral-800 bg-neutral-900/60 p-4 text-xs leading-relaxed whitespace-pre-wrap text-neutral-400">
            {data.bible}
          </pre>
          <p className="text-xs text-neutral-600">
            Nạp vào <code>system</code> prompt ở mọi lần viết cảnh, tóm tắt và biên tập audio.
            Lưu xong bấm tải lại để xem bản mới.
          </p>
        </Section>
      </div>
    </div>
  );
}
