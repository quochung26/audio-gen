import Link from "next/link";
import { prisma } from "@audio/database";
import { parseWorld, renderBible, type StoryBibleRecord } from "@audio/core";
import { Button, Section } from "@/components/ui";
import { saveWorld } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function BiblePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUniqueOrThrow({
    where: { id },
    include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } },
  });

  const stored = (series.storyBible ?? {}) as StoryBibleRecord;
  const world = parseWorld(stored.world);

  // Xem trước đúng thứ sẽ được nạp vào system prompt mỗi lần viết cảnh.
  const preview = renderBible({
    title: series.title,
    genre: series.genre,
    logline: series.description ?? undefined,
    world,
    characters: series.characters,
    episodes: stored.raw?.episodes,
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/series/${series.id}`} className="text-xs text-neutral-500 underline">
          ← {series.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Thiết lập thế giới</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Phần này nạp vào mỗi lần viết cảnh, nên nó là thứ giữ cho tập 30 vẫn đúng luật đã đặt ở
          tập 1. Sửa ở đây <strong className="text-neutral-200">không</strong> làm mất dàn ý, và
          sinh lại dàn ý <strong className="text-neutral-200">không</strong> làm mất phần này.
        </p>
      </div>

      <form action={saveWorld.bind(null, series.id)} className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
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
            placeholder={"Ma chỉ xuất hiện sau nửa đêm\nNgười chết không tự nói tên mình\nKhông ai trong làng dám nhắc tới bến xe cũ"}
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
            placeholder={"Bến Cũ: bến xe bỏ hoang ngoài rìa thị trấn\nÔng Bảy gác: người trông bến, không ai biết tuổi"}
            defaultValue={world.glossary.map((g) => `${g.term}: ${g.meaning}`).join("\n")}
            rows={3}
          />

          <Button type="submit" variant="primary">
            Lưu thiết lập
          </Button>
        </div>

        <Section title="Xem trước — đây là thứ AI thật sự đọc">
          <pre className="max-h-[36rem] overflow-auto rounded border border-neutral-800 bg-neutral-900/60 p-4 text-xs leading-relaxed whitespace-pre-wrap text-neutral-400">
            {preview}
          </pre>
          <p className="text-xs text-neutral-600">
            Nạp vào <code>system</code> prompt ở mọi lần viết cảnh, tóm tắt và biên tập audio.
          </p>
        </Section>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  placeholder,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  hint: string;
  placeholder: string;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-200">
        {label}
      </label>
      <p className="mt-0.5 mb-1.5 text-xs text-neutral-500">{hint}</p>
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}
