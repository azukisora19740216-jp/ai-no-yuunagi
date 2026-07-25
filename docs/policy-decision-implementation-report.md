# PD-01〜PD-07 非破壊実装レポート

- 実装日: 2026-07-21
- 技術検証日: 2026-07-25
- 検証対象SHA: `1a8e19edcb9aa3cf3c6b670a8484db6f8e01fd7f`
- CI証跡: [CI #55 / attempt 2](https://github.com/azukisora19740216-jp/ai-no-yuunagi/actions/runs/30035051625)
- 対象ADR: ADR-0004、ADR-0005
- 方針: expand-first、既存migration不変、既存台帳行不変、feature flagによる段階導入
- 法的評価: 本レポートは実装事実を記録するもので、法的評価を行わない。

## 1. PD別対応

| PD        | 実装内容                                                                           | migration                                           | 状態                             |
| --------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| PD-01     | 制度版、pilot設定、全国公開off、feature flag、欠落時fail closed                    | `202607210004_policy_pilot_identity_expand`         | 実装済み・PostgreSQL統合検証済み |
| PD-02     | 管理者発行単回招待、18歳・個人・1人1アカウント確認、版付き同意、登録枠排他         | `202607210004_policy_pilot_identity_expand`         | 実装済み・PostgreSQL統合検証済み |
| PD-03     | KYC adapter/mock、出品・申込み・受取人選択・取引コマンドのサーバーguard、地域guard | `202607210004_policy_pilot_identity_expand`         | 実装済み・PostgreSQL統合検証済み |
| PD-04     | 現実の引渡し申告、双方報告、運営確認の時刻・表示・監査分離                         | `202607210005_transaction_facts_expand`             | 実装済み・PostgreSQL統合検証済み |
| PD-05     | point policy、正式/開発scope、1年後月末期限、非遡及                                | `202607210006_point_policy_expand`                  | 実装済み・PostgreSQL統合検証済み |
| PD-06     | 30ポイント上限、部分overflow、利用者/pool同額movement、利用者排他                  | `202607210007_point_movements_notifications_expand` | 実装済み・PostgreSQL統合検証済み |
| PD-07     | 部分失効、60/30/7日前通知予定、管理画面、監査、migration回帰                       | `202607210007_point_movements_notifications_expand` | 実装済み・PostgreSQL統合検証済み |
| PD-07追補 | 利用可能残高status方針を暗黙固定せず、未決状態でfail closed                        | `202607210008_point_projection_policy_expand`       | 実装済み・PostgreSQL統合検証済み |

## 2. feature flagと設定

すべて既定offとし、flag無効時は既存フェーズ2経路を維持する。

- `FEATURE_PILOT_ENROLLMENT`
- `FEATURE_KYC_GATES`
- `FEATURE_FORMAL_POINTS`
- `FEATURE_POINT_EXPIRY`
- `FEATURE_POINT_EXPIRY_NOTIFICATIONS`
- `NATIONWIDE_PUBLIC_ENABLED`（本番trueを拒否）

承認済み制度版/pilot設定、承認済みpoint policy、本番開始日時が欠ける場合、新経路はfail closedとする。migrationへ本番開始日時・周辺地域の具体値を書いていない。開発seedのpoint policyは `DEVELOPMENT` かつ本番開始日時NULLであり、正式付与を開始できない。

## 3. DB不変条件

- 追加したpolicy、同意、KYC、本人claim、point policy、point movementはUPDATE/DELETEをDB triggerで拒否する。
- 招待とpilot membershipは、使用・取消し・会員状態を管理するため制約付き可変行とする。
- `point_ledger_entries` の既存行へ追加した4列はnullableで、backfillしない。
- 正式付与行にはpolicy、付与時刻、期限、award groupを要求する。
- movementのポイントは正数、利用者outは負数、pool inは正数で、FKと一意な冪等キーにより対応を追跡する。
- 残高カラムおよび残高上書きAPIは追加していない。現金・寄付原資テーブルとのFKも追加していない。

## 4. 暫定値・未決事項の隔離

- 倉敷市周辺の具体範囲: `pilot_settings.allowed_area_keys` の承認済み版で管理。seedは架空の開発キーだけ。
- 50名の算入対象: invitation/membershipの `counts_toward_limit` で個別指定。運用既定は未決。
- 1人1アカウント: 年齢・1アカウント表明を追記し、開発KYC参照のHMAC claimで重複を拒否する。照合キーと保持期間は未決。
- 利用可能残高status: point policyの `available_balance_status_mode` を追加し、既存値は `UNDECIDED` とした。実装可能な安全側の開発モードは `POSTED_ONLY` だが、本番policyへ設定するには人間の承認が必要。`UNDECIDED` では正式付与を拒否する。
- ポイント消費順序: ポイント消費機能自体を実装していない。
- 本番開始日時/初期point policy承認: DB設定必須。未設定なら正式付与を拒否。
- 失効通知: 予定・outboxのみ。チャネル、再送、送信workerは未実装。
- 招待期間/再発行: 管理者が発行ごとに明示入力し、既定期間を持たない。

## 5. テスト

実装した自動テストは次を対象とする。

- 単体: 招待コード、point期限・上限分割、KYC mock fail closed、権限、状態遷移。
- PostgreSQL統合: 招待なし/使用済み/期限切れ、年齢/同意、再同意、登録枠、KYC/地域guard、正式/開発scope、運営確認前未付与、30上限部分移行、同時付与、部分失効、二重movement、権限、append-only。
- migration: フェーズ2までの旧schema/旧ポイント行を作り、004〜008適用後に旧全列・件数が不変かつ新列NULLであることを照合する。
- E2E: pilot登録画面の必須項目・無効招待拒否、管理者pilot画面、本番mock KYC非表示。

### 2026-07-21 ローカル検証結果

- Prisma schema検証・client生成、Prettier、ESLint、TypeScript: 成功。
- 単体/コンポーネントテスト: 15ファイル、40件成功。
- production build: 成功。全画面はrequest-scoped nonce付きCSPを使う動的routeとして生成された。
- expand migration回帰: PGlite PostgreSQL互換環境の空schemaで001〜008を適用し、旧ポイント行の全旧列・件数不変、新4列NULLを確認した。
- ポリシーE2E: Desktop Chromiumで2件成功。Mobileは登録gate 1件成功、管理画面1件がPGlite socketの接続終了により未完了。
- 既存基盤E2E: CSP修正前のローカル実行でdesktop/mobile合計4件成功。ポリシーE2E中にproduction CSPがNext.js初期化scriptを拒否する既存不具合を検出し、`unsafe-inline` ではなくrequest-scoped nonce方式へ修正した。
- PostgreSQL 17.10 native runtime: Windows sandboxで `initdb` が `CreateRestrictedToken error code 87` となり起動不能。Docker/WSLもこの実行環境では利用不可だった。
- PGliteは空schemaへのmigrationと単一路E2Eの補助検証には使用できたが、Prismaの複数接続・並行transactionではsocket multiplexerが接続を終了した。ネイティブPostgreSQLの代替証跡とはしない。

このローカル検証時点では、ネイティブPostgreSQL 18による統合テストと全E2Eの成功証跡がなく、PD-01〜PD-07の技術フェーズ判定を保留していた。次節のCI技術検証により、この保留は解消した。

### 2026-07-25 CI技術検証結果

対象SHA `1a8e19edcb9aa3cf3c6b670a8484db6f8e01fd7f` に対するCI #55のattempt 2で、次を確認した。

- `pnpm install --frozen-lockfile`: 成功。lockfile再生成および供給網ポリシーの緩和なし。
- 単体/コンポーネントテスト: 15ファイル、40件成功、skip 0。
- PostgreSQL 18.4統合テスト: 6ファイル、27件成功、skip 0。
- 空DBへのmigration、Prisma Client生成、schema検証、seed: 成功。
- production build: 成功。
- E2E: Desktop/Mobile合計12件完走、skip 0。
- container build: 成功。

この証跡により、PD-01〜PD-07の状態を「実装済み・PostgreSQL統合検証済み」とする。確認範囲は対象SHAにおける実装、migration、PostgreSQL統合、E2E、production buildおよびcontainer buildの技術的動作に限る。外部機関・専門家の見解、運用上の承認、第三者的な安全性評価、商用環境への移行判断は別のゲートとして維持する。

Mobile E2Eでは、次の2件がそれぞれ1回のretry後に成功した。現時点の技術フェーズ判定は変更しないが、クローズドテスト開始前の安定化対象とする。

- ログイン遷移
- 管理画面遷移

## 6. 既知の制約

- 本番KYC adapter、受渡し住所/追跡番号の限定開示、取引メッセージは今回の基盤に含まれない。
- KYC失効後の進行中取引を管理レビューへ自動登録するqueueは未実装。コマンドはfail closedで拒否する。
- invitationの期限到来はquery時に有効性を判定する。期限到来を `EXPIRED` へ追記/投影して通知するworkerは未実装。
- point通知の送信状態更新は将来workerの責務で、通知予定行自体はpoint台帳ではない。
- 既存 `admin_verified_*` / `completed_at` は互換用に残す。新規画面・監査は `admin_finalized_*` を運営確認として用いる。
- Mobile E2Eのログイン遷移と管理画面遷移は各1回retry後に成功しており、既知のflaky testとして追跡する。

## 7. 技術検証後も残る未完了事項

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
