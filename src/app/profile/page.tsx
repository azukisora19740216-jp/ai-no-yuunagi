import { requireCurrentActor } from "@/modules/identity/application/current-actor";
import { findOwnProfile } from "@/modules/profile/application/profile-queries";
import { ProfileForm } from "@/modules/profile/ui/profile-form";

export default async function ProfilePage() {
  const actor = await requireCurrentActor();
  const profile = await findOwnProfile(actor.id);
  return (
    <main className="narrow">
      <h1>プロフィール</h1>
      <p>公開プロフィールです。住所や本人確認情報はここでは管理しません。</p>
      <ProfileForm profile={profile} />
    </main>
  );
}
