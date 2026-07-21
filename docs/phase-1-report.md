# Phase 1 実装報告

- 実施日: 2026-07-20
- 対象Issue: MVP-003, MVP-004, MVP-005, MVP-006の基盤部分
- 状態: コード基盤完了。Docker/PostgreSQL実行は端末制約によりCI検証待ち。

## 実装したもの

- Node.js 24.18 / pnpm 11.9 / TypeScript 6.0 / Next.js 16.2 / React 19.2
- PostgreSQL 18 / Prisma 7.8 / driver adapter
- 日本語・レスポンシブ・キーボードfocusを考慮した基盤ページ
- `/api/health` とDB疎通を含む `/api/ready`
- Zodによる環境変数検証。本番でmock KYC/配送とlocal storageをfail closed
- 許可フィールドだけを出力する構造化loggerと安全なエラー形式
- `users`, `audit_events`, `outbox_events` の初期migration
- DB triggerによる `audit_events` のUPDATE/DELETE拒否
- outboxの冪等キーunique制約
- 架空 `.invalid` メールだけを使うseed。本番seed拒否
- Docker Compose（app, PostgreSQL, Mailpit, local storage volume）
- GitHub Actions（format, lint, typecheck, unit, migration, integration, build, E2E, container build）
- Dependabot、pnpm供給網ポリシー、許可build script、脆弱性override

## モジュール境界

Phase 1では `health`, `audit`, `outbox` を実装した。今後の `identity`, `listings`, `transactions`, `messaging`, `safety`, `points`, `donations`, `privacy` は、要件決定後にdomain/application/infrastructureへ分離して追加する。Route HandlerからPrismaを直接呼ばない。

## 検証結果

| 検証                        | 結果                                          |
| --------------------------- | --------------------------------------------- |
| pnpm供給網lockfile検証      | PASS（659件）                                 |
| peer dependency検査         | PASS                                          |
| Prisma Client生成           | PASS                                          |
| Prisma schema検証           | PASS                                          |
| Prettier                    | PASS                                          |
| ESLint                      | PASS、warning 0                               |
| TypeScript                  | PASS                                          |
| Unit/component              | PASS、7 files / 13 tests                      |
| Next.js production build    | PASS                                          |
| Playwright Chromium         | PASS、2 tests                                 |
| production dependency audit | PASS、既知脆弱性0                             |
| PostgreSQL integration      | 未実行。2 testsはDB未指定でskip、CIで実行予定 |
| Docker Compose実起動        | 未実行。Dockerが端末に存在しない              |

## セキュリティ判断

- pnpm 11の依存build scriptは、Prisma engine、Prisma、esbuild、sharp、unrs-resolverだけを明示許可した。
- 監査イベントはDB triggerで追記専用にした。訂正は将来の反対/訂正イベントで表現する。
- loggerはメール、住所、token等を受け取らないallowlist contextを公開する。
- productionの環境変数検証はmock KYC/配送とlocal storageを拒否する。
- auditで検出されたPostCSSとHono node serverのmoderate脆弱性は、互換範囲内の修正版へoverrideした。
- CSPは基盤値であり、認証・アップロード・外部接続追加時に再評価する。開発時のみNext.jsのため `unsafe-eval` を許可する。

## 未実装

- 認証、メール確認、セッション、RBAC/KYC UI
- 掲載、画像検査、禁止品審査
- 申込み、取引状態機械、メッセージ、配送
- ポイント台帳・残高projection
- 団体、寄付期間、原資、送金、透明性ページ
- 通報、ブロック、制裁、異議、プライバシー申請、CSV

## リスク・保留

- Docker/DB統合を実機でまだ実行していない。最初のCIまたはDocker利用可能端末でmigration triggerを確認する。
- Gitホストが未決のためGitHub Actionsは暫定。実際のbranch protection設定は未実施。
- 認証ライブラリ、管理者MFA、外部storage/KYC/配送/メール事業者は未選定。
- 予定される制度資料8点が未着で、業務機能の公開条件は未確定。
- Docker imageはtag固定だがdigest固定は未実施。Dependabotと定期reviewが必要。

## 次の実装候補

1. MVP-001: 制度資料8点の取込と要件差分
2. MVP-007: 登録・メール確認・セッション・パスワード再設定
3. MVP-008: RBAC/ABAC権限マトリクス
4. MVP-009: profile/private identity分離と暗号化ADR
5. MVP-010: KYC port/mock管理UI
