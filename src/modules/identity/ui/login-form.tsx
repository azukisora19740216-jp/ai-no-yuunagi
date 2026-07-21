"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/modules/identity/infrastructure/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
    if (result.error) {
      setMessage("ログインできませんでした。メール確認状況と入力内容をご確認ください。");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <form className="form-card" onSubmit={submit}>
      <label>
        メールアドレス
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        パスワード
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button className="button" type="submit">
        ログイン
      </button>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
