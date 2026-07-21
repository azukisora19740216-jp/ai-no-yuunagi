import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { getPilotAdminOverview } from "@/modules/pilot/application/invitation-service";
import {
  IssueInvitationForm,
  MockKycForm,
  RevokeInvitationForm,
} from "@/modules/pilot/ui/pilot-admin-forms";
import { getServerEnv } from "@/shared/config/env";

export default async function AdminPilotPage() {
  const actor = await requireCurrentActor();
  if (!hasPermission(actor.roles, "pilot:manage")) notFound();
  const overview = await getPilotAdminOverview();
  const env = getServerEnv();
  const mockKycEnabled =
    env.NODE_ENV !== "production" && env.ALLOW_MOCK_ADAPTERS && env.KYC_DRIVER === "mock";
  return (
    <main>
      <h1>実証運用・招待・本人確認</h1>
      <section className="card">
        <h2>現在の設定</h2>
        <p>対象: {overview.context.regionLabel}</p>
        <p>
          登録枠: {overview.countedMembers} / {overview.context.registrationLimit}
        </p>
        <p>全国公開: 無効</p>
        <p>対象地域キー: {overview.context.allowedAreaKeys.join("、")}</p>
      </section>
      <section>
        <h2>単回招待コード発行</h2>
        <IssueInvitationForm />
      </section>
      <section>
        <h2>招待履歴</h2>
        <div className="stack-list">
          {overview.invitations.map((invitation) => {
            const effectiveStatus =
              invitation.status === "ISSUED" && invitation.expiresAt <= new Date()
                ? "EXPIRED"
                : invitation.status;
            return (
              <article className="card" key={invitation.id}>
                <h3>{invitation.source}</h3>
                <p>状態: {effectiveStatus}</p>
                <p>
                  発行: {invitation.issuedAt.toLocaleString("ja-JP")}／失効:{" "}
                  {invitation.expiresAt.toLocaleString("ja-JP")}
                </p>
                <p>上限算入: {invitation.countsTowardLimit ? "する" : "しない"}</p>
                {invitation.usedAt ? (
                  <p>使用日時: {invitation.usedAt.toLocaleString("ja-JP")}</p>
                ) : null}
                {effectiveStatus === "ISSUED" ? (
                  <RevokeInvitationForm invitationId={invitation.id} />
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h2>開発用KYCモック</h2>
        {mockKycEnabled ? (
          <MockKycForm
            users={overview.users.map((user) => ({
              id: user.id,
              name: user.profile?.displayName ?? "会員",
            }))}
          />
        ) : (
          <p>モック本人確認は開発環境でのみ有効です。本番用アダプターは未接続です。</p>
        )}
        <ol className="timeline">
          {overview.kycCases.map((kycCase) => (
            <li key={kycCase.id}>
              <strong>
                {kycCase.user.profile?.displayName ?? "会員"}: {kycCase.status}
              </strong>
              <span>{kycCase.createdAt.toLocaleString("ja-JP")}</span>
              <p>provider: {kycCase.provider}／本人参照の生値は保存・表示しません。</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
