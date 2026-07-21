# MVP実装計画

- 状態: 実装進行中。Phase 0完了、利用者依頼上のフェーズ1・2を実装済み。ADR-0004・ADR-0005対応は影響分析・migration計画までで、コード未着手。

2026-07-21以後の直近計画は `policy-decision-impact-analysis.md` のPD-01〜PD-07と `policy-decision-migration-plan.md` を正とする。

- 方針: 小さな縦切り、各フェーズに受入条件、未決事項はfeature flag/設定/TODOで隔離

> 注: 本文の当初フェーズ番号と、後続の利用者依頼で指定されたフェーズ番号は一致しない。利用者依頼上のフェーズ1は本文Phase 2〜4の一部、利用者依頼上のフェーズ2は本文Phase 4〜5の一部に相当する。未実装範囲は各実装報告を正とする。

## 1. フェーズ

### Phase 0 — 調査・要件・設計（今回）

成果物: 要件、矛盾一覧、アーキテクチャ、データモデル、状態遷移、セキュリティ、本計画、AGENTS草案。

完了条件:

- 受領した制度資料の根拠・矛盾と法務確認事項を明示
- 未決事項を本番仕様に固定していない
- 次のIssueと実装開始ゲートがレビュー可能

### Phase 1 — 開発基盤と安全な骨格

**状態（2026-07-20）:** 実装済み。Docker未導入の作業端末のためCompose実起動とPostgreSQL統合テストだけ未検証。CIではPostgreSQLサービス上で実行する。

範囲:

- TypeScript/Next.js、PostgreSQL/Prisma、選定したpackage managerをバージョン固定
- Docker Compose（app, db, local object storage, local mail catcher）
- 環境変数スキーマ、`.env.example`、本番でmock/既定secretを拒否
- lint、format、typecheck、unit/integration、buildのCI
- モジュール境界、共通エラー、request ID、安全なlogger、health/readiness
- 初期migration（ユーザー、監査、outboxの最小部）

除外: 実ユーザー機能、外部KYC/配送本番接続。

完了条件: 新規cloneから文書化された1コマンド群で起動し、CIと空migration検証が通る。

### Phase 2 — 認証・プロフィール・RBAC・プライバシー申請

- 登録、メール確認、ログイン/アウト、再設定、セッション管理
- userとstaffロール、サーバー認可、管理者MFA方針の実装/ゲート
- 通常プロフィールとprivate identityの分離
- KYC port + mock、管理者テストUI
- 退会、開示・訂正・削除等申請の受付と状態管理
- 認証/認可/CSRF/rate-limitテスト

### Phase 3 — 掲載・画像・審査

- 物品draft、画像隔離/検査/再エンコード、審査提出
- 設定型カテゴリ/禁止品ルール、管理審査、公開一覧・詳細
- 金額・希望ポイント項目が存在しないことをschema/UI/APIで保証
- レスポンシブ、キーボード、label、エラー、状態表示のアクセシビリティ

正式禁止品基準の15分類を版管理ルールへ落とし込むまで、公開可能カテゴリを安全なテスト用allowlistに限定し、全国公開flagを閉じる。

### Phase 4 — 申込み・取引・メッセージ・配送モック・安全機能

**状態（2026-07-20）:** 申込み、受取人選択、取引生成、受取人承諾、受渡し準備、双方完了報告、管理確認まで実装済み。メッセージ、配送モック、通報・ブロック等は未実装。

- 複数申込み、提供者選択、受取人承諾（C-106決定後）、日程、双方完了、管理審査
- TransactionServiceの状態機械と並行実行テスト
- 取引限定メッセージ、設定型金銭語句検知、hold/warn、人手判断
- 配送port + mock、暗号化追跡番号、作業負担申告/審査
- 通報、ブロック、制裁、異議、risk signals表示

### Phase 5 — ポイント追記台帳

**状態（2026-07-21）:** 取引付与、保留、反対仕訳、手動共通プール移行、履歴・管理UIを実装済み。残高は直接保存せず確定台帳から集計する。1年後の月末失効、60/30/7日前通知、利用可能残高30上限、自動pool移行、開発データ除外は正式決定済みだが未実装。

- point ledger migration、追記API、反対仕訳、冪等性、DB制約
- 管理確認後のみ基本1 + 配送0..3、合計最大4
- 残高projectionと全件再構築/照合
- 履歴UI、管理台帳UI、直接残高変更APIがないことのテスト

C-102〜C-104およびC-129Aの残高・配分詳細を決定するまでポイント配分を無効にする。失効・上限はADR-0005に従い、非破壊migration承認後に実装する。

### Phase 6 — 団体・ポイント配分・寄付原資・透明性

- 団体審査、寄付期間9状態、ポイント配分
- 現金原資の別台帳、決定的計算snapshot、二者承認
- 送金実績、証明原本/公開版、透明性publication
- 比率・整数円・端数・繰越のproperty-based test

端数方式、ポイント確定方式、団体審査基準、公開証明手順が決まるまで本番送金/公開を不可にする。

### Phase 7 — 管理運用、CSV、監査強化

- 要求された管理一覧/詳細を権限マトリクスに従い完成
- 非同期・短命・監査付きCSV
- 監査照合、運用dashboard、通知、失敗ジョブ対応
- アカウント/寄付の職務分掌と異議担当分離

### Phase 8 — パイロット前ハードニング

- 予定8資料と実装のtraceability review
- 法務・税務・プライバシー決定反映
- 脅威モデル、第三者セキュリティレビュー候補、性能・復元・障害演習
- WCAG観点、主要ブラウザ/端末、運用runbook、問い合わせ訓練
- 岡山県倉敷市および周辺地域の運営発行単回招待制パイロット。初期50名、全国公開feature flagはoff
- 18歳以上の個人・1人1アカウント・版付き同意・verified KYC gateの回帰試験

## 2. ローカル開発環境

### 現在

Phase 1基盤は実装済み。前提はDocker Desktop（Compose v2）。Nodeをホストで使う場合は24.18.x、pnpmは11.9.x。

```powershell
Copy-Item .env.example .env.local
docker compose build
docker compose up -d db mailpit
docker compose run --rm app pnpm db:deploy
docker compose up app
```

URL:

- Web: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Readiness: `http://localhost:3000/api/ready`
- Mail catcher UI: `http://localhost:8025`
- ファイル保存はPhase 1ではDocker volume上のローカルstorage adapter用領域。アップロード機能自体はPhase 3。

DB migrationと架空seedは明示コマンドとし、自動で破壊的resetしない。

```powershell
docker compose run --rm app pnpm db:seed
docker compose run --rm app pnpm test
```

## 3. テスト方針

### レイヤー

| 種類        | 対象                                                       | 重点                                        |
| ----------- | ---------------------------------------------------------- | ------------------------------------------- |
| Unit        | 状態機械、ポイント、寄付計算、モデレーション、認可ポリシー | 境界値、不変条件、全許可/拒否遷移           |
| Component   | フォーム、状態表示、管理表、エラー                         | label、focus、キーボード、色非依存          |
| Integration | service + PostgreSQL + repository                          | transaction、制約、競合、冪等性、監査原子性 |
| Contract    | KYC/配送/メール/storage ports                              | mockと将来adapterの共通契約                 |
| E2E         | 登録→掲載→申込み→引渡し→管理確認→ポイント、寄付公開        | actor切替、権限、失敗復旧、主要a11y         |
| Security    | authz、CSRF、XSS、upload、rate limit、情報漏えい           | `security-and-privacy.md` の不変条件        |
| Migration   | 空DB/前版DBからのupgrade                                   | rollback可否、制約、seed非本番性            |

### 必須シナリオ

- 他人のIDへ差し替えてもプロフィール、取引、メッセージ、追跡番号を取得/変更できない。
- 無効状態遷移、二重クリック、並行受取人選択を拒否する。
- 管理確認前、取消し、未着、禁止品、金銭疑いではポイントが利用可能にならない。
- 基本+配送が4を超えず、対面時加算の決定規則に従う。
- 取消しは原台帳を消さず、反対仕訳で残高を再構築できる。
- ポイント配分と現金原資に外部キーを除く「残高共有」がない。
- 配分だけでは透明性ページがcompleted/寄付完了にならない。
- 語句検知は管理レビューへ進み、自動永久停止しない。
- 画像を装った実行ファイルとPIIを含む証明原本の直接公開を拒否する。

### CIゲート

PRごとに format check、lint、typecheck、unit/component/integration、migration、build、dependency/secret scan。main/リリース候補でPlaywright、アクセシビリティ、コンテナscan。実行時間に応じた分割は可だが、必須ゲートを無効化しない。

## 4. Issue単位のバックログ

| Issue   | フェーズ | 内容                                                    | 依存/決定          |
| ------- | -------: | ------------------------------------------------------- | ------------------ |
| MVP-001 |        0 | 予定8資料を配置し、要件traceabilityと矛盾表を更新       | 資料提供           |
| MVP-002 |      0/1 | ADR-001〜003: runtime/認証/storage選定                  | 運用・デプロイ条件 |
| MVP-003 |        1 | Next.js/TypeScript/Prismaの最小scaffoldとモジュール境界 | 実装開始承認       |
| MVP-004 |        1 | ComposeでPostgres、Storage、Mail catcher、appを構築     | MVP-003            |
| MVP-005 |        1 | CI、lint/type/build/test/migration/secret scan          | MVP-003            |
| MVP-006 |        1 | 安全なlogger、error、env validation、audit/outbox基盤   | MVP-003            |
| MVP-007 |        2 | 登録・メール確認・セッション・再設定                    | ADR-001            |
| MVP-008 |        2 | RBAC/ABACポリシーと権限マトリクステスト                 | C-115決定          |
| MVP-009 |        2 | profile/private identity分離、暗号化ADR                 | ADR-006            |
| MVP-010 |        2 | KYC port/mockと本番mock拒否                             | KYC必須範囲決定    |
| MVP-011 |        2 | 退会・プライバシー申請workflow                          | 保持表決定         |
| MVP-012 |        3 | items/category/review schemaと掲載フォーム              | 禁止品基準         |
| MVP-013 |        3 | 画像隔離・検査・再エンコード                            | storage ADR        |
| MVP-014 |        3 | 禁止品設定・審査UI・公開ゲート                          | 資料/法務確認      |
| MVP-015 |        4 | item requestsとrecipient selection競合制御              | C-106/C-108        |
| MVP-016 |        4 | TransactionService全遷移と履歴                          | 状態表承認         |
| MVP-017 |        4 | 取引メッセージと設定型moderation                        | hold/warn基準      |
| MVP-018 |        4 | Shipping port/mockと追跡番号保護                        | C-104/C-111        |
| MVP-019 |        4 | 通報・ブロック・制裁・異議                              | C-113/C-116        |
| MVP-020 |        5 | append-only point ledger + DB制約                       | ADR-004            |
| MVP-021 |        5 | 取引完了ポイントと反対仕訳                              | C-103/C-104        |
| MVP-022 |        5 | balance projection再構築・照合                          | MVP-020            |
| MVP-023 |        6 | 団体審査と寄付期間9状態                                 | 寄付団体審査基準   |
| MVP-024 |        6 | allocation/共通pool仕訳                                 | C-101/C-102        |
| MVP-025 |        6 | 現金原資、計算snapshot、端数・繰越                      | C-117/C-118        |
| MVP-026 |        6 | remittance/proof/publication/透明性ページ               | C-119/C-120        |
| MVP-027 |        7 | 管理画面権限別機能、監査検索                            | C-115              |
| MVP-028 |        7 | 安全な非同期CSV export                                  | CSV列/保持決定     |
| MVP-029 |        8 | threat model、復元、性能、a11y、運用訓練                | C-004、運用体制    |

## 5. 次に着手すべき3〜5件

1. **MVP-001**: 予定8資料の受領と要件差分レビュー（実装判断の前提）。
2. **MVP-002**: 認証・storage・runtimeのADRを、デプロイ条件とともに決定。
3. **MVP-003**: 承認後、最小scaffoldとモジュール境界を作る。
4. **MVP-004**: 再現可能なCompose開発環境を作る。
5. **MVP-005/006**: CIと安全な共通基盤を同じ最初の縦切りで整える。

資料受領が遅れる場合でも、MVP-003〜006は制度判断を固定しない基盤として並行可能。ただし認証本番運用、掲載公開、ポイント失効、寄付計算には進まない。

## 6. Definition of Done

- 要件ID/Issueへの対応が説明でき、未決事項を新たに暗黙固定していない。
- 認可、入力検証、監査、エラー、PIIログ禁止を含む。
- 正常系だけでなく拒否、競合、冪等性、回復テストがある。
- migrationはレビュー可能で、破壊的変更を自動適用しない。
- 日本語UI、キーボード、focus、label、色非依存を確認。
- 文書・環境変数例・runbookを実装と同じPRで更新。
- 本番secret/実在PII/実本人確認画像/本番データを含まない。
