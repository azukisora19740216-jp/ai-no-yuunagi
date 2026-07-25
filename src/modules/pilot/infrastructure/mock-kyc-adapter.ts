import type { KycAdapter } from "@/modules/pilot/domain/kyc-adapter";
import { getServerEnv } from "@/shared/config/env";
import { AppError } from "@/shared/errors/app-error";

export const mockKycAdapter: KycAdapter = {
  provider: "mock",
  async decide(input) {
    const env = getServerEnv();
    const mockRole = env.DEPLOYMENT_ROLE === "local" || env.DEPLOYMENT_ROLE === "test";
    if (!env.ALLOW_MOCK_ADAPTERS || env.KYC_DRIVER !== "mock" || !mockRole) {
      throw new AppError("MOCK_KYC_FORBIDDEN", "この環境ではモック本人確認を使用できません。", 403);
    }
    return { provider: this.provider, ...input };
  },
};
