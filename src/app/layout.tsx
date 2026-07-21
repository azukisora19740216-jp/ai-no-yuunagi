import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentActor } from "@/modules/identity/application/current-actor";
import { SignOutButton } from "@/modules/identity/ui/sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "藍の夕凪",
  description: "個人間の無償譲渡と社会貢献をつなぐ物品循環プラットフォーム",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getCurrentActor();
  const canReview = actor?.roles.some((role) => role === "MODERATOR" || role === "ADMINISTRATOR");
  const canAudit = actor?.roles.some((role) =>
    ["MODERATOR", "ADMINISTRATOR", "AUDITOR"].includes(role),
  );

  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <nav aria-label="メインナビゲーション" className="nav-wrap">
            <Link className="brand" href="/">
              藍の夕凪
            </Link>
            <div className="nav-links">
              <Link href="/items">公開中の物品</Link>
              {actor ? (
                <>
                  <Link href="/dashboard">マイページ</Link>
                  <Link href="/profile">プロフィール</Link>
                  {actor.roles.includes("USER") ? <Link href="/transactions">取引</Link> : null}
                  {actor.roles.includes("USER") ? <Link href="/points">ポイント履歴</Link> : null}
                  {canReview ? <Link href="/admin/items">投稿審査</Link> : null}
                  {canAudit ? <Link href="/admin/transactions">取引確認</Link> : null}
                  {canAudit ? <Link href="/admin/points">ポイント台帳</Link> : null}
                  {actor.roles.includes("ADMINISTRATOR") ? (
                    <Link href="/admin/pilot">実証運用</Link>
                  ) : null}
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link href="/login">ログイン</Link>
                  <Link href="/register">会員登録</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
