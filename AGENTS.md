# AGENTS.md（草案）

このリポジトリで作業する人間・自動エージェント向けの共通ルール。現在は初回設計段階の草案であり、チーム承認後に正式化する。

## 最初に読むもの

1. `README.md`
2. `docs/product-requirements.md`
3. `docs/requirements-conflicts.md`
4. 変更対象に応じて `architecture.md`, `data-model.md`, `state-machines.md`, `security-and-privacy.md`, `implementation-plan.md`
5. 配置後の利用規約、プライバシーポリシー、禁止品基準、寄付団体審査基準、配送運用基準等

資料と実装が矛盾するときは、独断で一方を採用しない。`docs/requirements-conflicts.md` に該当箇所、影響、候補、決定要否を記録し、重大判断を止める。

## 不変条件

- サービスは無償譲渡の仲介であり、物品代金・送料・謝礼など利用者間決済を実装しない。
- 金額、希望価格、希望ポイントの入力欄・API・DB列を掲載/申込みに追加しない。
- おかげさまポイントに換金、購入、譲渡、送信、商品取得、固定円換算を持たせない。
- ポイントと寄付原資/送金現金を同じ残高・台帳にしない。
- ポイント残高を直接更新しない。追記台帳と反対仕訳を使う。
- 取引状態をクライアント指定値へ汎用更新しない。状態機械のコマンドを使う。
- 管理確認前にポイントを確定しない。
- 配送協力加算は0〜3、基本1を含む取引合計は1〜4。画面・API・DB・テストで値を変えない。
- 利用可能ポイント上限は30。超過・失効は元行を変えず、利用者台帳と共通プール台帳へ原子的に追記する。
- ポイントは付与日の1年後の月末失効。本番開始前データは正式ポイントにせず、ルールを自動遡及しない。
- 運営確認は運営上の取引確定とポイント条件であり、所有権移転の要件として表現しない。
- 実証は倉敷市および周辺、運営発行単回招待、初期50名、全国公開off。18歳以上の個人・1人1アカウントに限定する。
- 閲覧・仮登録はKYC不要、出品・申込み・取引参加はverified KYC必須とする。
- 自動モデレーションだけで永久停止しない。
- auditorは原則read-only。UIだけでなくサービス/APIで認可する。
- 法的結論（「合法」「許可不要」等）をコード・画面・文書で断定しない。

## 設計ルール

- UI/Route HandlerからORMを直接使わず、application/domain serviceを通す。
- 取引、ポイント、寄付、モデレーションを独立モジュールにする。
- KYC、配送、メール、storageはport/adapter化し、開発mockを本番でfail closedにする。
- 重要操作は理由付き監査ログを業務変更と原子的に追記する。
- 住所/KYC/追跡番号/証明原本は通常プロフィール・一般ログ・分析から分離する。
- 外部入力はサーバー検証し、安定した安全な日本語エラーを返す。
- 並行実行、二重送信、再試行を想定して冪等性とDB制約を入れる。

## セキュリティ・データ

- 実在する住所、電話、本人確認資料、追跡番号、本番データをseed/fixture/screenshotへ入れない。
- secret、token、cookie、パスワード、PII、メッセージ本文をログへ出さない。
- `.env`、秘密鍵、API keyをcommitしない。`.env.example` は安全なダミーだけ。
- 画像は実MIME/マジックバイト検査、再エンコード、EXIF除去後だけ公開する。SVG/HTML/実行形式を拒否。
- 削除は保持義務・紛争・監査との競合を記録し、勝手なhard deleteをしない。
- 不可逆migration、台帳行更新、監査削除を行わない。必要なら事前にADRと承認を得る。

## 変更手順

1. 関連要件、未決事項、状態遷移、脅威を確認する。
2. 小さなIssue/PR単位で実装し、既存の利用者変更を壊さない。
3. 業務ロジックを先にunit/integration testし、UIはそのserviceを使う。
4. 正常系に加え、権限拒否、無効遷移、競合、冪等性、情報漏えいをテストする。
5. schema/API/状態/運用が変われば同じ変更でdocsを更新する。
6. 実行したcommand/testと未実施理由を報告する。

## コマンド

Node.js 24.18.x / pnpm 11.9.xを使用する。標準ゲートは次のとおり。

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e --project=chromium
```

DB統合テストは専用テストDBへmigrationを適用し、`TEST_DATABASE_URL` を指定して `pnpm test:integration` を実行する。本番DBや共有DBをテストへ使用しない。migration作成時は既存データを破壊しないことを確認し、適用済みmigrationを書き換えない。

Docker起動手順は `README.md` を正本とする。WindowsでPowerShellの実行ポリシーによりラッパーが拒否される場合は `.CMD` を使用する。

## 判断を止める条件

- 法務・税務・プライバシーの適用判断が必要
- 禁止品の例外、保持期間、寄付端数、地域境界、重複確認方式、期限別ポイント消費順等の未決事項を固定する必要がある
- 本番secret/PIIへのアクセス、新たな外部送信、新事業者契約が必要
- ポイント/現金台帳の過去記録を書換える必要がある
- 依頼範囲外の破壊的操作またはデータ移行が必要

この場合は仮実装、feature flag、設定未指定時fail closed、TODOのいずれかで隔離し、`requirements-conflicts.md` とIssueに判断事項を残す。
