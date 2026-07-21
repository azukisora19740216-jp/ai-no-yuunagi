import { ZodError } from "zod";
import { AppError } from "@/shared/errors/app-error";

export type ActionState = { ok: boolean; message: string };
export const initialActionState: ActionState = { ok: false, message: "" };

export function actionError(error: unknown): ActionState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  if (error instanceof ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  return { ok: false, message: "処理を完了できませんでした。時間をおいて再度お試しください。" };
}
