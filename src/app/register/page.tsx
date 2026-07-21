import { RegisterForm } from "@/modules/identity/ui/register-form";
import { getPublicPilotRegistrationContext } from "@/modules/pilot/application/pilot-policy-service";

export default async function RegisterPage() {
  const context = await getPublicPilotRegistrationContext();
  const pilot = context.enabled
    ? context.available
      ? {
          enabled: true as const,
          available: true,
          regionLabel: context.regionLabel,
          areaKeys: context.allowedAreaKeys,
          termsVersion: context.termsVersion,
          privacyVersion: context.privacyVersion,
        }
      : { enabled: true as const, available: false }
    : { enabled: false as const };
  return (
    <main className="narrow">
      <h1>会員登録</h1>
      <p>物品の代金や謝礼を伴わない無償譲渡のための会員登録です。</p>
      <RegisterForm pilot={pilot} />
    </main>
  );
}
