import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { register } from "@/app/actions/auth";
import { AuthForm, AuthInput } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đăng ký" };

export default async function RegisterPage() {
  if (await auth()) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-xl font-semibold">Đăng ký</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Chỉ cần email và mật khẩu. Không cần xác minh gì thêm.
        </p>
      </div>

      <AuthForm action={register} submit="Tạo tài khoản">
        <AuthInput name="name" label="Tên hiển thị (tuỳ chọn)" autoComplete="nickname" />
        <AuthInput name="email" label="Email" type="email" autoComplete="email" required />
        <AuthInput
          name="password"
          label="Mật khẩu — ít nhất 8 ký tự"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </AuthForm>

      <p className="text-sm text-neutral-500">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
