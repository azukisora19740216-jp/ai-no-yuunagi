# 藍の夕凪（仮称）

日本国内での個人間の無償譲渡と社会貢献をつなぐ、物品循環プラットフォームのMVPです。

フェーズ2に加え、ADR-0004/0005のPD-01〜PD-07をexpand-onlyで実装しています。実証設定、単回招待、18歳・1人1アカウント確認、版付き同意、KYCゲート、取引事実時刻、正式/開発ポイント区分、期限、30ポイント上限、部分的な共通プール移行、失効通知予定を追加しました。

機能は段階導入用feature flagの既定値を無効にしています。本番開始日時、倉敷市周辺の具体範囲、登録枠算入規則、KYC事業者等は未決のため、本番設定を推測して有効化しないでください。現金決済、ポイントによる物品取得、寄付配分、配送会社API、本番KYCは含みません。

## PD-01〜PD-07の技術検証状況

PD-01〜PD-07は、対象SHA `1a8e19edcb9aa3cf3c6b670a8484db6f8e01fd7f` について「実装済み・PostgreSQL統合検証済み」です。[CI #55 / attempt 2](https://github.com/azukisora19740216-jp/ai-no-yuunagi/actions/runs/30035051625) で次を確認しました。

- `pnpm install --frozen-lockfile`: 成功
- 単体テスト: 40件成功、skip 0
- PostgreSQL 18.4統合テスト: 27件成功、skip 0
- 全migration、seed、production build: 成功
- Desktop/Mobile E2E: 12件完走、skip 0
- container build: 成功
- lockfile再生成および供給網ポリシーの緩和: なし

Mobile E2Eのログイン遷移と管理画面遷移は、各1回のretry後に成功しました。既知のflaky testとして記録し、クローズドテスト開始前に安定化します。

この結果は対象SHAにおける実装、migration、PostgreSQL統合、E2E、production buildおよびcontainer buildの技術的成功を示します。外部機関・専門家の見解、運用上の承認、第三者的な安全性評価、商用環境への移行判断は別途必要です。

### 配置経路の暫定方針

PR #14はhead SHA `e0edd87d0703f6b80dac41b6ea67a6e9a47ef9f0` でPreview配置まで成功し、merge commit `34b8ba05acca1a2330d24231df354c62c6c3234a` のmain CI #62も全job成功しました。PR #14は技術実装として完了しています。

本番準備が承認されるまで、Prisma ComputeのPR Previewを外部配置検証経路とします。main Computeは本番配置経路として未構成・未稼働です。mainでの失敗は、未承認のproduction設定を推測せず、`AUTH_SECRET`不足を検知してfail closedになった既知状態です。コード不良の解消を目的としてPreview用secretや暫定adapter設定をmainへコピーしません。

GitHubのmainにはbranch protection/rulesetによるrequired checkが設定されていないため、解除対象のrequired checkはありません。Prisma UIにはPreviewを維持したままmainだけを安全にpauseする操作が確認できなかったため、外部設定は変更せず、main Computeを未構成・未有効化・未配信のまま維持しています。再有効化条件と未決の承認主体は[ADR-0006](docs/decisions/0006-preview-only-deployment-until-production-readiness.md)を参照してください。

未完了事項:

1. 水島警察署生活安全課および岡山県公安委員会による一次見解
2. 弁護士による法務レビュー
3. 税理士による運営協賛金・公益配分原資の整理
4. 本番KYC事業者の選定
5. 本番メール配信事業者の選定
6. 本番開始日時と初期ポイントポリシーの承認
7. 対象地域および登録上限算入区分の確定
8. 失効通知workerと再送運用
9. 本番環境のセキュリティ確認
10. バックアップ、障害対応、利用者対応手順

## ローカル起動（Docker Compose）

前提: Docker Desktop / Compose v2。

```powershell
Copy-Item .env.example .env.local
docker compose build
docker compose up -d db mailpit
docker compose run --rm app pnpm db:deploy
docker compose run --rm app pnpm db:seed
docker compose up app
```

起動後:

- Web: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Readiness: `http://localhost:3000/api/ready`
- 開発用メール確認: 会員登録完了画面の「開発用メールボックス」
- Mailpit: `http://localhost:8025`（将来のSMTPアダプター確認用）

テスト用seedのパスワードは全アカウント共通で `Local-test-password-123!` です。

| 用途           | メールアドレス              |
| -------------- | --------------------------- |
| 管理者         | `admin@example.invalid`     |
| 投稿審査者     | `moderator@example.invalid` |
| 提供者         | `provider@example.invalid`  |
| 受取人         | `recipient@example.invalid` |
| 閲覧専用監査人 | `auditor@example.invalid`   |

seedは架空の `.invalid` アドレスだけを使用し、本番環境では実行を拒否します。

## 主な画面

- `/register`, `/login`: 会員登録・ログイン
- `/profile`: 公開プロフィール
- `/items`, `/items/new`: 公開物品一覧・物品登録
- `/dashboard`: 自分の物品、申込み確認への導線
- `/transactions`, `/transactions/[id]`: 当事者の取引一覧・状態遷移・完了報告
- `/points`: 自分の追記型ポイント履歴と算出残高
- `/admin/items`: moderator / administrator専用の投稿審査
- `/admin/transactions`: 運営確認、付与確定・保留・取引取消し
- `/admin/points`: ポイント台帳、反対仕訳、共通プール履歴
- `/admin/pilot`: 実証設定、管理者発行招待、開発限定KYCモック
- `/dev/mailbox`: 開発環境限定のメール確認モック

## ホスト上での検証

Node.js 24.18.x、pnpm 11.9.xを使用します。

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --audit-level=moderate
```

初回だけPlaywright用Chromiumが必要です。

```powershell
node node_modules/@playwright/test/cli.js install chromium
```

DB統合テストは、migration適用済みの専用テストDBを指定して実行します。本番DBを指定しないでください。

```powershell
$env:DATABASE_URL='postgresql://ainoyuunagi:local_only_password@127.0.0.1:5432/ainoyuunagi_test?schema=public'
$env:TEST_DATABASE_URL=$env:DATABASE_URL
pnpm db:deploy
pnpm test:integration
```

CIではPostgreSQLサービスへmigrationを適用し、単体・統合・主要E2Eを実行します。2026-07-25時点の検証済み証跡は上記「PD-01〜PD-07の技術検証状況」を参照してください。

## 重要な制約

- 物品代金、希望価格、希望ポイント、送料支払いの入力・決済機能はありません。
- 投稿公開はmoderatorまたはadministratorの承認が必要です。
- 監査人は閲覧専用で、投稿承認権限を持ちません。
- 監査イベントはDBトリガーで更新・削除を拒否する追記型です。
- ポイント残高カラムはなく、確定済みの符号付き台帳記録から都度算出します。
- 管理確認前のポイントは確定しません。保留記録は残高に含みません。
- ポイント取消しは元記録を変更せず、逆符号の反対仕訳を追記します。
- 正式ポイントは承認済みポリシー版と本番開始日時がある新規仕訳だけです。既存行は開発ポイントのままです。
- 正式残高の30ポイント超過分と期限到来分は、元行を変更せず利用者負数・共通プール正数・movementを同一トランザクションで追記します。
- ポイントの購入、換金、売買、会員間送金・譲渡、物品・サービス取得機能はありません。
- 物品価格、送料額、円換算率を保存するフィールドはありません。
- `DEPLOYMENT_ROLE=local|test|preview|production` を明示し、`NODE_ENV` だけでは配置先を判定しません。
- Previewではメール・Storageを明示的に`disabled`へできますが、呼出時は副作用前にfail closedで拒否します。mockメール、local storage、mock KYC／配送はPreviewとproductionで拒否します。
- productionでは外部メールadapterとS3互換Storage adapterだけを許可し、確定したHTTPSの`APP_URL`ホストが`APP_ALLOWED_HOSTS`へ完全一致しない設定を拒否します。productionでワイルドカードは使用できません。
- Prisma Compute PreviewはBetter Authの動的Base URLを使用し、HTTPS固定・fallbackなしで`*.prisma.build`だけを許可します。任意のHostヘッダー、他ドメイン、より広いワイルドカードは拒否します。
- 禁止品基準の正式資料が未配置のため、現状のカテゴリーは暫定許可リストです。
- 安全なファイル検証が未実装のため、物品画像アップロードは無効です。

## 文書

- `docs/product-requirements.md`: MVP要件
- `docs/architecture.md`: アーキテクチャ
- `docs/data-model.md`: データモデル
- `docs/security-and-privacy.md`: セキュリティ・プライバシー方針
- `docs/state-machines.md`: 状態遷移
- `docs/requirements-conflicts.md`: 矛盾・不足・法的確認事項
- `docs/decisions/0002-phase1-auth-and-listings.md`: フェーズ1の暫定判断
- `docs/decisions/0003-phase2-transactions-and-points.md`: フェーズ2の暫定判断
- `docs/phase-1-implementation-report.md`: 実装結果と残課題
- `docs/phase-2-implementation-report.md`: 取引・ポイント実装結果と残課題
- `docs/decisions/0004-pilot-access-identity-and-consent.md`: 実証、招待、年齢・同意、KYCの正式決定
- `docs/decisions/0005-transaction-completion-and-point-policy.md`: 所有権/運営確認とポイント運用の正式決定
- `docs/policy-decision-impact-analysis.md`: コード変更前の実装影響
- `docs/policy-decision-migration-plan.md`: 既存データを破壊しないmigration計画
- `docs/policy-decision-implementation-report.md`: PD-01〜PD-07の実装対応表、検証結果、残課題
