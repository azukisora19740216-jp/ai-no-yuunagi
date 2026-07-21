export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly safeMessage: string,
    public readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
    this.name = "AppError";
  }
}

export type SafeErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export function toSafeErrorBody(error: unknown, requestId: string): SafeErrorBody {
  if (error instanceof AppError) {
    return {
      error: { code: error.code, message: error.safeMessage, requestId },
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "処理を完了できませんでした。時間をおいて再度お試しください。",
      requestId,
    },
  };
}
