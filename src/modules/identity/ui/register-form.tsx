"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { registerPilotMemberAction } from "@/app/register/actions";
import { authClient } from "@/modules/identity/infrastructure/auth-client";
import { initialActionState } from "@/shared/ui/action-state";

type PilotRegistrationProps =
  | { enabled: false }
  | {
      enabled: true;
      available: boolean;
      regionLabel?: string;
      areaKeys?: string[];
      termsVersion?: string;
      privacyVersion?: string;
    };

export function RegisterForm({ pilot }: { pilot: PilotRegistrationProps }) {
  const [legacyMessage, setLegacyMessage] = useState("");
  const [email, setEmail] = useState("");
  const [legacySent, setLegacySent] = useState(false);
  const [pilotState, pilotAction, pilotPending] = useActionState(
    registerPilotMemberAction,
    initialActionState,
  );

  async function submitLegacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await authClient.signUp.email({
      name: String(data.get("name")),
      email: String(data.get("email")),
      password: String(data.get("password")),
      callbackURL: "/login?verified=1",
    });
    if (result.error) {
      setLegacyMessage(
        "登録できませんでした。入力内容または登録済みメールアドレスをご確認ください。",
      );
      return;
    }
    setLegacySent(true);
    setLegacyMessage("確認メールを作成しました。メール確認後にログインしてください。");
  }

  if (pilot.enabled && !pilot.available) {
    return <p className="error">実証運用の登録設定が未完了のため、現在登録できません。</p>;
  }

  const status = pilot.enabled ? pilotState.message : legacyMessage;
  const succeeded = pilot.enabled ? pilotState.ok : legacySent;

  return (
    <form
      className="form-card"
      action={pilot.enabled ? pilotAction : undefined}
      onSubmit={pilot.enabled ? undefined : submitLegacy}
    >
      {pilot.enabled ? (
        <>
          <label>
            運営者発行の招待コード
            <input name="invitationCode" required maxLength={200} autoComplete="off" />
          </label>
          <label>
            対象地域
            <select name="areaKey" required defaultValue="">
              <option value="" disabled>
                選択してください
              </option>
              {pilot.areaKeys?.map((areaKey) => (
                <option key={areaKey} value={areaKey}>
                  {pilot.regionLabel}（{areaKey}）
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <label>
        表示名
        <input name="name" required maxLength={50} autoComplete="name" />
      </label>
      <label>
        メールアドレス
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        パスワード
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <p className="help">12文字以上で設定してください。</p>
      {pilot.enabled ? (
        <fieldset>
          <legend>利用条件の確認</legend>
          <label>
            <input type="checkbox" name="age18OrOver" required />
            私は18歳以上です
          </label>
          <label>
            <input type="checkbox" name="oneAccountAttested" required />
            個人として登録し、他にアカウントを保有していません
          </label>
          <label>
            <input type="checkbox" name="termsAgreed" required />
            利用規約（版: {pilot.termsVersion}）に同意します
          </label>
          <label>
            <input type="checkbox" name="privacyAcknowledged" required />
            プライバシーポリシー（版: {pilot.privacyVersion}）を確認しました
          </label>
        </fieldset>
      ) : null}
      <button className="button" type="submit" disabled={pilot.enabled && pilotPending}>
        {pilot.enabled && pilotPending ? "登録中…" : "会員登録"}
      </button>
      {status ? (
        <p className={succeeded ? "success" : "error"} role="status">
          {status}
        </p>
      ) : null}
      {succeeded ? (
        <p>
          <Link href={`/dev/mailbox?email=${encodeURIComponent(email)}`}>
            開発用メールボックスを確認
          </Link>
        </p>
      ) : null}
    </form>
  );
}
