# フェーズ1 実装報告

- 実施日: 2026-07-20
- 対象: 認証、会員、物品掲載、受取申込み
- 法的評価: 実施していない

## 1. 既存文書との整合確認

実装前に `product-requirements.md`、`architecture.md`、`data-model.md`、`security-and-privacy.md`、`state-machines.md`、`implementation-plan.md`、`requirements-conflicts.md` を再確認した。

未決事項を本番仕様として固定しないため、フェーズ1の暫定判断を ADR-0002 に分離した。特にKYC条件、禁止品、詳細権限、受取人選択後の承諾、再申込み、画像アップロードは未決または未実装のまま明示している。

## 2. 実装結果

### ローカル基盤・DB

- Next.js / TypeScript / PostgreSQL / Prismaの既存基盤を継続
- Docker Composeのapp、PostgreSQL、Mailpit構成
- 認証、プロフィール、ロール、カテゴリー、物品、画像メタデータ、審査履歴、受取申込み、開発メールのmigration
- 受取人選択を1件に制限するPostgreSQL部分ユニークインデックス
- 架空の `.invalid` アカウント、低リスク想定カテゴリー、公開物品のseed

### 認証・会員

- Better Authによる会員登録、ログイン、ログアウト、安全なパスワードハッシュ
- メール確認必須、およびDB保存型の開発用メールモック
- 表示名、自己紹介、受渡し地域のプロフィール
- 認証情報、通常プロフィール、将来の住所／KYC領域を分離

### 物品・申込み

- 下書き作成・更新、投稿申請
- moderator / administratorによる承認公開・理由付き差戻し
- 公開物品一覧・詳細
- 公開中のみ受取申込み、自己申込み禁止
- 提供者による受取人選択と他申込みの未選択処理
- サーバー側の用途別状態遷移検証と権限チェック
- 重要操作の追記型監査イベント

### UI

- 日本語、レスポンシブ、明示的label、キーボードフォーカス、色以外の状態文言
- 金額、希望価格、希望ポイント、利用者間の送料支払い機能を設けていない
- 内部例外を画面へ露出しない安全な日本語エラー

## 3. テスト結果

この端末での結果:

| 検査                                     | 結果                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| Prisma schema validate / client generate | 成功                                                    |
| Prettier                                 | 成功                                                    |
| ESLint                                   | 成功                                                    |
| TypeScript                               | 成功                                                    |
| 単体・コンポーネントテスト               | 9ファイル、19件成功                                     |
| DB統合テスト                             | 2ファイル、4件スキップ（ローカルPostgreSQL/Dockerなし） |
| Production build                         | 成功                                                    |
| E2E（PC・モバイル、トップ・health）      | 4件成功                                                 |
| E2E（実DBログイン）                      | 2件スキップ（実DBなし）                                 |
| 依存関係監査                             | 既知の脆弱性なし                                        |

CIではPostgreSQL 18サービスにmigrationを適用し、DB統合4件とseedを使うログインE2E 2件も実行する構成にした。CIそのものの実行結果はまだ取得していない。

## 4. 未実装事項

- 本番メール配信、パスワードリセット
- 本番KYCとKYCモック管理画面
- 本人住所・本人確認情報
- 画像アップロード、画像再エンコード、マルウェア検査
- 正式な禁止品ルールエンジンと管理画面
- 申込み撤回・再申込み
- 選択後の受取人承諾、取引生成、取引メッセージ、引渡し以降
- 通報、ブロック、退会、個人情報開示・削除申請
- ポイント、寄付、配送、透明性ページ
- 管理者の会員・監査ログ閲覧、CSV出力など後続管理機能
- 本番運用、全国公開、本番データ移行

## 5. 既知のリスク

- `/docs` に予定された規約・禁止品基準等の原資料がなく、審査カテゴリーは法務・運用承認前の暫定値。
- 新規会員作成後のロール／プロフィール作成は認証ライブラリの後処理フックであり、DB障害時の補償ジョブは未実装。孤立会員を検出・修復する運用が必要。
- 受取申込み本文には取引メッセージ用の金銭語句モデレーションをまだ適用していない。
- 開発メールDBには有効期限内の確認URLが保存される。開発専用であり、本番起動時は禁止しているが、共有開発DBのアクセス制限が必要。
- レート制限は認証ライブラリ内蔵の単一プロセス向け構成。複数インスタンス運用前に共有ストアへ移行が必要。
- 監査ログの外部WORM保管、暗号鍵管理、バックアップ復旧、監視・通知は未構築。
- DB統合と実DB E2Eはこの端末で未実行。CIまたはDocker利用可能環境での成功確認がリリース条件。

## 6. 人間の判断が必要な事項

1. 利用対象者、対象地域、年齢制限、規約同意方法
2. 禁止品カテゴリー・例外・審査証跡
3. KYCを必須にする操作と不承認時の扱い
4. ロール別の詳細権限マトリクス
5. 申込み撤回後の再申込み、および受取人選択後の承諾・期限・辞退
6. プロフィール・申込み・監査ログの保存期間
7. 本番メール事業者、配信失敗・バウンス・再送の運用

## 7. 次に着手すべきタスク

1. `PH1-VERIFY-01`: Docker/CIでmigration、DB統合4件、実DB E2E 2件を実行し結果を固定する。
2. `PH1-MOD-02`: 受取申込み本文へ設定可能な金銭語句モデレーションと管理確認キューを追加する。
3. `PH1-RECOVERY-03`: 認証後処理失敗によるロール／プロフィール欠損を検出・修復する整合性ジョブを追加する。
4. `PH1-POLICY-04`: 正式な禁止品基準受領後、バージョン付きルールと審査画面へ反映する。
5. `PH2-TXN-01`: C-106を決定後、受取人承諾と取引生成を実装する。

## 8. 主な作成・変更ファイル

- 認証・権限: `src/modules/identity/**`, `src/app/api/auth/[...all]/route.ts`
- プロフィール: `src/modules/profile/**`, `src/app/profile/**`
- 物品: `src/modules/items/**`, `src/app/items/**`, `src/app/admin/items/page.tsx`
- 申込み: `src/modules/item-requests/**`
- DB: `prisma/schema.prisma`, `prisma/migrations/202607200002_phase1_identity_items/migration.sql`, `prisma/seed.ts`
- テスト: `src/**/*.test.ts`, `tests/integration/phase1-workflow.test.ts`, `tests/e2e/foundation.spec.ts`
- 基盤: `package.json`, `pnpm-lock.yaml`, `.env.example`, `Dockerfile`, `.github/workflows/ci.yml`
- 文書: `README.md`, `docs/decisions/0002-phase1-auth-and-listings.md`, 本報告書

## 9. 実行した主なコマンド

```text
pnpm install
pnpm db:generate
pnpm db:validate
pnpm format / pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm audit --audit-level=moderate
```

Dockerコマンドはこの端末にDockerがないため実行していない。Git実行ファイルは通常PATHに存在せず、作業場所もGitワークツリーとして認識されなかったため、差分確認はファイル一覧と検査コマンドで行った。
