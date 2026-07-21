# 2026-07-21 正式決定の実装影響分析

> 履歴注記（2026-07-21）: 本文はコード変更前の分析記録である。承認後のPD-01〜PD-07実装状況は `policy-decision-implementation-report.md` を参照する。

- 状態: コード変更前レビュー
- 根拠: ADR-0004、ADR-0005
- 対象: 現在のschema、サービス、API/action、UI、設定、seed、テスト、運用
- 変更制限: この分析ではソースコード、Prisma schema、migration、DB、seedを変更していない。

## 1. 結論

ポイントの「配送加算最大3・取引合計最大4」と「管理確認前に確定しない」は現行の主要サービス・DB制約と一致する。一方、招待制、50名上限、地域・全国公開flag、年齢/同意、KYC gate、有効期限、30ポイント上限、自動pool移行、非遡及projectionは未実装である。

取引状態の技術的な順序は概ね維持できるが、現行 `COMPLETED: 完了` と `adminVerifiedAt` は、所有権移転と運営確認を混同させるおそれがある。DB状態を直ちに破壊変更せず、API/UIの名称と追加時刻で意味を分離する必要がある。

## 2. 現行実装との一致

| 正式仕様                           | 現行根拠                                                                            | 評価                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| 基本1、配送加算0〜3、合計最大4     | `src/modules/points/domain/point-rules.ts`、phase2 DB check、unit/integration tests | 一致。全表示/API文言の回帰確認は必要        |
| 管理確認前に確定ポイントを作らない | `transaction-service.ts` は双方報告後もledger 0、admin reviewで付与                 | 一致                                        |
| 追記型台帳、直接残高なし           | phase2 migrationのimmutable trigger、集計query                                      | 一致                                        |
| 取消しは反対仕訳                   | point ledger serviceと`reversal_of` unique                                          | 一致。overflow/expiryには流用不可           |
| 利用者間決済、価格・送料額なし     | schema/UIに該当列・入力なし                                                         | 一致                                        |
| 対面原則、配送加算は作業区分       | delivery methodとworkload enum                                                      | 部分一致。地域/実証設定と証拠モデルは未実装 |

## 3. 不一致と影響範囲

### 3.1 認証・会員・招待

現状は `src/modules/identity/ui/register-form.tsx` とBetter Authのsign-upが、招待、年齢、版付き同意、50名上限を要求しない。

必要な変更候補:

- `src/modules/identity` に登録orchestration serviceを追加し、招待検証・枠確保・年齢/同意記録を認証アカウント作成と整合させる。
- Better Auth hook/route境界を調査し、認証userだけ作成され業務登録が失敗する中間状態を回復可能にする。
- 登録UIへ招待コード、18歳以上確認、規約/プライバシー版リンクと個別確認を追加する。
- 一般利用者向け招待発行UI/APIは作らない。管理者だけに発行・失効・一覧を許可する。
- 招待元、発行者、使用/失効をaudit serviceで記録し、生コード・email・同意本文を監査差分へ出さない。
- 51人目と同時登録をDBロックで拒否し、安定した日本語エラーを返す。

### 3.2 設定・地域・公開範囲

`src/shared/config/env.ts` にはKYC driverがあるが、pilot mode、登録上限、全国公開flag、許可地域の型付き設定がない。

必要な変更候補:

- pilot設定をDBの版管理値と起動時安全設定に分離する。
- 全国公開はserver-side query/commandでも拒否し、UI非表示だけに依存しない。
- 設定欠落・不正値はregistration/publicationをfail closedにし、readinessに安全な状態コードだけを出す。
- seedの利用者数は登録上限の本番算入と混同しない。全データを明示的なdevelopment scopeにする。

### 3.3 KYC・個人情報

`KYC_DRIVER` 環境設定は存在するが、KYC adapter/case modelと操作guardは存在しない。現在はKYCなしで物品作成、申込み、取引コマンドを実行できる。

必要な変更候補:

- `identity` から独立したKYC port、mock adapter、policy serviceを追加する。
- item service、item request service、transaction serviceのすべての書込commandで最新の有効verified caseを検証する。
- API/actionでactorのKYC値を受け取らず、サーバーで再取得する。
- 正確な受渡情報をprofile/transactionから分離し、`accepted` 後のprovider/recipientだけへ復号開示する。
- mock状態変更は管理者限定・監査必須。本番でmock許可時は起動または必須操作を拒否する。
- 1人1アカウント照合に使うデータは実装詳細未決であり、email uniqueだけを要件充足とみなさない。

### 3.4 取引・所有権用語

`src/modules/transactions/ui/labels.ts` は `COMPLETED` を「完了」と表示し、サービスは `adminVerifiedAt` / `completedAt` を使う。状態順序は利用できるが、正式用語との区別が不足する。

必要な変更候補:

- 利用者画面を「提供者報告済み」「受取人報告済み」「双方報告済み・運営確認待ち」「運営確認済み」と表示する。
- 管理操作名を `complete/approve` から「運営確認・確定」に寄せ、API event codeは互換期間中aliasを受けてもレスポンスは新用語にする。
- `both_reported_at`, `handover_occurred_at`, `admin_finalized_at/by` を追加し、所有権状態を表す列は作らない。
- ヘルプ、メール、監査理由、エラー、E2E selectorを含め、管理者確認が所有権移転条件と読める文言を検査する。
- 既存 `COMPLETED` enumは当面維持し、意味を運営projectionとして文書・型コメントで固定する。

### 3.5 ポイント台帳

`point-rules.ts` の上限は一致するが、`point-ledger-service.ts` は全額の手動pool移行だけで、失効・30上限・部分移動・正式/開発区分がない。`common_pool_ledger_entries.source_point_ledger_entry_id` unique と `reversal_of` uniqueは1原行1回の全額処理を前提にしている。

必要な変更候補:

- point policy versionとproduction startを導入し、新規正式付与へpolicy/award/expiry/groupを記録する。
- 正式残高queryをpolicy付き正式仕訳だけに限定し、既存開発仕訳を含めない。
- award時に利用者単位をロックし、30までの空きと超過を計算する。全付与、user overflow out、pool in、movement link、auditを原子的に追記する。
- expiry workerはAsia/Tokyoの月末ルールを確定UTCへ変換し、残存利用可能分だけを原子的に移す。
- 60/30/7日前通知はoutbox + idempotencyで予定・結果を記録する。
- `reversal_of` は訂正専用のままにし、overflow/expiry用の非unique source linkを追加する。
- 管理UIへ正式/開発区分、失効日、失効予定、上限超過pool移行を表示し、残高上書き操作は追加しない。

### 3.6 監査・ログ

既存audit serviceは再利用できるが、次のイベント型とsafe payload定義が必要になる。

- policy/pilot設定版の作成・承認・有効化
- invitation issued/used/expired/revoked/registration rejected
- consent/age confirmation recorded
- KYC mock status changed、KYC command denied
- handover report、both reported、admin finalized（所有権判定という名称を使わない）
- point awarded、overflow moved、expiry notified、expired、policy projection mismatch

招待コード、email、住所、KYC provider token、メッセージ、追跡番号は監査・application logへ出さない。

## 4. DB/API/UI/テスト変更候補

### DB

- 新規: policy/pilot、invitation、consent、KYC、point policy、movement link、expiry notification。
- 追加: transactionの事実別時刻、point entryのpolicy/award/expiry/group。
- 制約: 単回招待、付与1+0..3<=4、正式残高<=30を実現する排他方式、user/pool同額性、append-only。
- 既存台帳・migrationを更新せず、新規migrationだけを追加する。

### API / Server Actions

- 管理者: 招待発行/失効、pilot設定閲覧、KYC mock更新、正式point policy閲覧。
- 登録: invite redemption + age/consent + account creationのorchestration。
- 物品/申込み/取引: 共通 `requireVerifiedKycForTransacting` guard。
- 取引: party reportとadmin finalizationを明示したcommand/response。
- ポイント: formal balance/history、expiry schedule、overflow/expiry worker。送信・購入・換金APIは作らない。

### UI

- 登録画面: 招待、年齢、規約、privacy。
- 管理画面: 招待、KYC mock、登録枠、全国公開off、監査。
- 物品/申込み/取引画面: KYC未確認時の具体的な日本語案内と操作停止。
- 取引画面: party reportと運営確認の分離。所有権を運営が決める表現を排除。
- ポイント画面: 正式残高、期限、60/30/7日前通知状態、overflow/pool理由。円相当表示なし。

### テスト

- unit: expiry月末計算、leap year、JST境界、award上限、cap split、正式scope、表示用語。
- integration: invite二重使用/51人目競合、KYC guard、同時award、29/30/31境界、部分overflow、expiry/pool原子性、旧台帳不変。
- E2E: 招待登録→mail確認→KYC mock verified→出品、KYC未確認拒否、双方報告→運営確認→point履歴。
- security: 生招待コード/PII/token非ログ、当事者以外の受渡情報拒否、全国公開off、mock本番拒否、auditor read-only。
- migration: 既存phase2 DBからexpand、旧app互換、開発ポイント正式残高0、checksum不変。

## 5. 実装フェーズ案

| Issue候補 | 内容                                    | 依存                         | 主な受入条件                                     |
| --------- | --------------------------------------- | ---------------------------- | ------------------------------------------------ |
| PD-01     | policy/pilot設定と非破壊schema          | C-127A、production start承認 | 初期50、全国off、欠落時fail closed               |
| PD-02     | 単回招待・年齢・版付き同意登録          | PD-01、C-135A                | 同時二重使用不可、監査、生コード非保存           |
| PD-03     | KYC adapter/mockと全transactional guard | C-128Aの最低方針             | browse/仮登録可、出品/申込み/取引はverifiedのみ  |
| PD-04     | 取引事実時刻と運営確認用語              | PD-03                        | 所有権誤認文言0、pointはadmin finalize後のみ     |
| PD-05     | point policy・正式scope・期限           | C-129A、production start承認 | 開発行除外、月末期限、非遡及                     |
| PD-06     | 30 cap・原子的pool移行・通知            | PD-05                        | 競合時もbalance<=30、user/pool同額、60/30/7通知  |
| PD-07     | migration/E2E/security回帰              | PD-01〜06                    | 旧データ不変、主要フロー、権限・漏えいテスト合格 |

## 6. 既知のリスク

1. Better Auth account作成と業務招待使用を別transactionにすると、片方だけ成功する。hook境界と補償状態が必要。
2. 30上限をアプリ集計だけで判定すると同時付与で超過する。利用者単位ロックとDB側整合性が必要。
3. 現行のunique source/reversalモデルへ部分移動を押し込むと失効・overflow・取消しを誤分類する。
4. 既存開発ポイントを単純に合算すると正式残高・期限・上限が誤る。policy scopeを全queryで強制する必要がある。
5. `COMPLETED` の文言だけを変えて時刻・API意味を分離しないと、監査や通知で所有権誤認が残る。
6. 1人1アカウント対策を過剰なPII収集で実現するとプライバシーリスクが増す。照合方式の承認が必要。
7. 「周辺地域」が未設定のまま曖昧一致になると対象外公開が起こる。明示allowlist・fail closedが必要。

## 7. コード変更前に人間が決める事項

ブロッキングとなる実装詳細は次のとおり。正式決定済みの原則を再度判断する必要はない。

1. 周辺地域の市区町村/郵便番号等の具体範囲。
2. 登録上限50名に含めるaccount status、staff、seedの扱い。
3. 1人1アカウントの照合キー、例外審査、保持期間。
4. 利用可能残高へ含めるstatus、期限別ポイントの消費順序。
5. 本番開始日時、point policy初期版の承認・投入手順。
6. 失効通知チャネル、再送、通知不能時の扱い。
7. 招待の初期有効期間、再発行、取消し運用。

## 8. 今回変更していないもの

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/seed.ts`
- `src/**`
- `tests/**`
- ローカル/共有DBのschemaおよびデータ

次の実装は、この影響分析とmigration計画への承認後に開始する。
