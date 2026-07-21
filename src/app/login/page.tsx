import { LoginForm } from "@/modules/identity/ui/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="narrow">
      <h1>ログイン</h1>
      {query.verified ? (
        <p className="success">メールアドレスを確認しました。ログインできます。</p>
      ) : null}
      <LoginForm />
    </main>
  );
}
