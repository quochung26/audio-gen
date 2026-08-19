import Link from "next/link";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";

/**
 * Góc tài khoản.
 *
 * Chưa đăng nhập thì chỉ hiện một liên kết nhỏ — đăng nhập là TUỲ CHỌN, không
 * phải cổng vào. Ai không muốn tài khoản vẫn nghe được đầy đủ.
 */
export async function AccountMenu() {
  const session = await auth();

  if (!session?.user) {
    return (
      <Link href="/dang-nhap" className="text-sm text-neutral-400 hover:text-neutral-100">
        Đăng nhập
      </Link>
    );
  }

  const label = session.user.name || session.user.email || "Tài khoản";

  return (
    <div className="flex items-center gap-3">
      <span className="max-w-32 truncate text-sm text-neutral-400">{label}</span>
      <form action={logout}>
        <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-200">
          Thoát
        </button>
      </form>
    </div>
  );
}
