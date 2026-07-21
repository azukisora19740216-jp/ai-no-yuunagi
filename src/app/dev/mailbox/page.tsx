import { notFound } from "next/navigation";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";

export default async function DevMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const env = getServerEnv();
  if (!env.ALLOW_MOCK_ADAPTERS || env.EMAIL_DRIVER !== "mock" || env.NODE_ENV === "production")
    notFound();
  const { email } = await searchParams;
  const messages = email
    ? await getPrisma().mockEmail.findMany({
        where: { recipientEmail: email },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];
  return (
    <main className="narrow">
      <h1>開発用メールボックス</h1>
      <p className="notice-inline">ローカル開発専用です。本番環境では無効になります。</p>
      {messages.length ? (
        <ul className="stack-list">
          {messages.map((message) => (
            <li className="card" key={message.id}>
              <strong>{message.subject}</strong>
              <p>{message.createdAt.toLocaleString("ja-JP")}</p>
              <a className="button" href={message.actionUrl}>
                メールアドレスを確認
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>対象の確認メールはありません。</p>
      )}
    </main>
  );
}
