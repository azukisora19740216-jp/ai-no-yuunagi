# ADR-0006: 本番準備承認までPR Previewを配置検証経路とする

- 状態: 採用（暫定運用。外部サービス設定の変更は未実施）
- 決定日: 2026-07-26
- 対象: Prisma Compute Preview、main Compute、本番設定、配置検証
- 見直し時期: production readiness checklistの承認時

## 背景

PR #14のhead SHA `e0edd87d0703f6b80dac41b6ea67a6e9a47ef9f0` では、GitHub Actions、PostgreSQL 18.4統合テスト、production build、container buildおよびPR Previewが成功した。mainへの通常マージ後も、merge commit `34b8ba05acca1a2330d24231df354c62c6c3234a` に対するGitHub Actionsは成功した。

一方、main Computeはproduction roleで必要な`AUTH_SECRET`が未設定のため、環境検証でfail closedとなった。Prisma Client生成、schema検証、Next.jsコンパイルおよび型検査の後、page data収集時に設定不足を検知したもので、当該デプロイは有効化も配信もされていない。

本番ドメイン、外部メール、本番Storage、本番KYC、本番配送設定、許可ホスト、障害対応およびバックアップ方針は未承認である。赤いチェックを解消する目的で暫定値やPreview用secretをmainへ転用することは、安全なproduction構成にならない。

## 決定

1. 本番準備が承認されるまで、PR Previewを継続的な外部配置検証経路とする。
2. main Computeは本番配置経路として未構成・未稼働の状態を維持し、一時停止またはmain向け自動デプロイ対象から除外する候補とする。
3. Prisma/GitHub上の連携停止、required check変更、アプリ削除は別の明示承認を得てから行う。本ADR作成時点では変更していない。
4. PRの技術的完了、mainへのコード統合、本番配置、本番運用開始を別の判定とする。
5. Preview用secret、Preview DB、`disabled` adapter設定をmainまたはproductionへコピーしない。
6. main Computeを再有効化する場合は、production readiness checklistと承認記録を先に満たす。

## PR Previewの条件

- `DEPLOYMENT_ROLE=preview`
- branch scopeのsecretと合成データだけを使用
- メールおよびStorageは`disabled`を許容するが、呼出時は副作用前にfail closed
- mockメール、local Storage、mock KYCおよびmock配送は拒否
- Prisma Computeが発行するHTTPS Preview hostだけを境界付きallowlistで許可
- 本番データ、本番secretおよび実在PIIを使用しない

## main Compute再有効化条件

最低限、次を承認・設定・検証してから再有効化する。

1. 本番ドメインと完全一致の許可ホスト
2. 本番専用`AUTH_SECRET`とsecret管理・ローテーション手順
3. 外部メール配信事業者と送信元設定
4. 本番Storageとアップロード検査・保持手順
5. 本番KYC事業者とデータ取扱い
6. 本番配送adapterの利用範囲
7. 本番開始日時、初期ポイントポリシー、対象地域、登録枠算入規則
8. バックアップ、復旧、監視、障害対応、利用者対応のrunbook
9. 本番環境のセキュリティ確認
10. 必要な法務・税務・運用確認の記録

本番値投入の最終承認主体と、役割間の承認順序は未決である。これが文書化されるまで本番値を投入しない。少なくとも、技術設定の承認と、法務・税務・運用上の開始判断をCI成功だけで代替しない。

## 外部設定の読取調査（2026-07-26）

- GitHubのmainにはclassic branch protectionが設定されていない。
- GitHub repository rulesetも作成されていない。
- したがって、現時点の「Prisma Compute Deploy」はrequired checkではなく、解除すべきrequired check設定は存在しない。
- PrismaのGit連携は「mainへのpushで自動デプロイ、PRでPreview branchを自動作成」と表示されている。
- main Computeは`Not activated`かつ`Not serving`で、トラフィックを配信していない。
- Prisma UIで確認できたCompute単位の操作は`Delete app`、Git連携単位の操作は`Unlink repository`だった。mainだけの安全なpause操作は確認できなかった。
- `Unlink repository`はPR Previewの自動作成も失うため、本決定の目的に反する。
- `Delete app`が将来のPreview Compute作成へ与える影響が確認できていないため、承認なく実行しない。

この結果から、外部設定は変更せず、main Computeを未構成・未有効化・未配信のfail closed状態に保つ。将来Prismaがmain単位の自動デプロイ停止機能を提供するか、削除の影響が公式に確認できた場合に再評価する。

## 影響

- PR #14は技術実装として完了扱いにできる。
- main Computeの失敗は、未承認設定を推測せず拒否した既知状態として管理する。
- main向け外部チェックはrequiredではない。GitHub Actionsをmainの技術検証、PR Previewを外部配置検証の証跡とする。
- 本決定は本番配置または運用開始の承認を意味しない。

## 証跡

- PR #14 head: `e0edd87d0703f6b80dac41b6ea67a6e9a47ef9f0`
- main merge commit: `34b8ba05acca1a2330d24231df354c62c6c3234a`
- main GitHub Actions: CI #62（全job成功）
- PR Preview: `https://cms05up7r2iknzmf9xzgppehb.nrt.prisma.build`
- main Compute: production設定不足によりfail closed、未有効化・未配信
