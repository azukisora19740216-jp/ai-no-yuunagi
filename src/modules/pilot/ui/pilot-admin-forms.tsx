"use client";

import { useActionState } from "react";
import {
  issueInvitationAction,
  recordMockKycAction,
  revokeInvitationAction,
} from "@/app/admin/pilot/actions";
import { initialActionState } from "@/shared/ui/action-state";

function ActionMessage({ state }: { state: typeof initialActionState }) {
  return state.message ? (
    <p className={state.ok ? "success" : "error"} role="status">
      {state.message}
    </p>
  ) : null;
}

export function IssueInvitationForm() {
  const [state, action, pending] = useActionState(issueInvitationAction, initialActionState);
  return (
    <form className="form-card" action={action}>
      <label>
        招待元
        <input name="source" required maxLength={100} placeholder="運営相談会・個別案内等" />
      </label>
      <label>
        失効日時（運用判断済みの値を入力）
        <input name="expiresAt" type="datetime-local" required />
      </label>
      <label>
        登録上限への算入
        <select name="countsTowardLimit" defaultValue="true">
          <option value="true">算入する</option>
          <option value="false">算入しない（staff/開発用途を個別判断）</option>
        </select>
      </label>
      <button className="button" disabled={pending}>
        単回招待コードを発行
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, initialActionState);
  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <label>
        取消し理由
        <input name="reason" required maxLength={500} />
      </label>
      <button className="button danger" disabled={pending}>
        未使用招待を取消す
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function MockKycForm({ users }: { users: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(recordMockKycAction, initialActionState);
  return (
    <form className="form-card" action={action}>
      <label>
        会員
        <select name="userId" required defaultValue="">
          <option value="" disabled>
            選択してください
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        状態
        <select name="status" defaultValue="PENDING">
          <option value="UNVERIFIED">未確認</option>
          <option value="PENDING">審査中</option>
          <option value="VERIFIED">確認済み</option>
          <option value="REJECTED">不承認</option>
        </select>
      </label>
      <label>
        開発用本人参照（確認済みの場合必須・生値は保存しません）
        <input name="subjectReference" minLength={8} maxLength={200} autoComplete="off" />
      </label>
      <label>
        有効期限（未決の場合は空欄）
        <input name="validUntil" type="datetime-local" />
      </label>
      <label>
        理由コード
        <input name="reasonCode" maxLength={100} />
      </label>
      <button className="button" disabled={pending}>
        判定履歴を追記
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
