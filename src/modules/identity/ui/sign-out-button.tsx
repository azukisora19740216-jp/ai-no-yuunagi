"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/modules/identity/infrastructure/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="link-button"
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      ログアウト
    </button>
  );
}
