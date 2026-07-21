# フェーズ2 実装報告

- 実施日: 2026-07-20
- 対象: 取引状態管理、おかげさまポイント追記台帳
- 法的評価: 実施していない

## 1. 既存設計との整合

`product-requirements.md`、`requirements-conflicts.md`、`architecture.md`、`data-model.md`、`state-machines.md`、`security-and-privacy.md` とフェーズ1実装を確認した。

C-106、保留解消、共通プール自動移行条件は未決のため、フェーズ2で必要な暫定判断を ADR-0003 に分離した。ポイントを物品対価・現金・送料と結び付けるデータや機能は追加していない。

## 2. 実装結果

### 取引状態

- 提供者の受取人選択と同一トランザクションで取引を生成
- 受取人承諾、受渡し準備、提供者完了報告、受取人完了報告
- 双方報告後だけ `UNDER_ADMIN_REVIEW` へ遷移
- moderator / administratorによる完了確認、付与保留、取引取消し
- 取引状態のバージョン付き条件更新と競合エラー
- 追記型状態イベントと重要操作監査

### おかげさまポイント

- 利用者残高を保存しない追記型 `point_ledger_entries`
- 管理確認時だけ基本1ポイントを `POSTED` として記録
- 配送作業区分 `NONE / SIMPLE / STANDARD / LARGE_SPECIAL` を0〜3ポイントへ決定的に対応
- 対面手渡しへの配送加算を拒否し、1取引合計を最大4ポイントに制限
- 保留を `HELD` として追記し、表示残高から除外
- 取消しを元仕訳と逆符号の `REVERSAL` として追記
- 二重付与・二重取消しを状態guard、冪等キー、一意制約で拒否
- 確定仕訳の符号付き合計によるポイント履歴・残高表示

### 共通おかげさまプール

- 現金と分離した追記型 `common_pool_ledger_entries`
- administratorだけが理由区分付きで確定ポイント仕訳を全額移行可能
- 利用者台帳の負数仕訳とプール台帳の正数仕訳を同一DBトランザクションで記録
- 期限・上限・未指定条件が未決のため、自動移行は未実装

### DB防御

- 取引参加者が同一人物になることをCHECK制約で拒否
- 基本付与1、配送加算1〜3、保留正数、反対仕訳負数をCHECK制約で検証
- `reversal_of`、取引別付与キー、状態イベントキーを一意化
- ポイント台帳、共通プール台帳、取引状態イベントの更新・削除をDBトリガーで拒否

## 3. 作成・変更した主なファイル

- DB: `prisma/schema.prisma`, `prisma/migrations/202607200003_phase2_transactions_points/migration.sql`, `prisma/seed.ts`
- 取引: `src/modules/transactions/**`, `src/app/transactions/**`, `src/app/admin/transactions/page.tsx`
- ポイント: `src/modules/points/**`, `src/app/points/**`, `src/app/admin/points/page.tsx`
- 連携: `src/modules/item-requests/application/item-request-service.ts`, `src/modules/identity/domain/authorization.ts`
- テスト: `tests/integration/phase2-transactions-points.test.ts`, `tests/e2e/foundation.spec.ts`
- 文書: ADR-0003、`state-machines.md`, `data-model.md`, `security-and-privacy.md`, `implementation-plan.md`, `README.md`

## 4. テスト結果

この端末での結果:

| 検査                                | 結果                                             |
| ----------------------------------- | ------------------------------------------------ |
| Prisma schema validate / generate   | 成功                                             |
| Prettier / ESLint / TypeScript      | 成功                                             |
| 単体・コンポーネント                | 11ファイル、30件成功                             |
| DB統合                              | 3ファイル、10件スキップ（PostgreSQL/Dockerなし） |
| Production build                    | 成功                                             |
| E2E（DB不要、PC・モバイル）         | 4件成功                                          |
| E2E（実DBログイン・取引・台帳閲覧） | 4件スキップ                                      |
| 依存関係監査                        | 既知の脆弱性なし                                 |

DB統合テストには、不正状態遷移、管理確認前の未付与、同時管理確認による二重付与防止、双方報告の競合と再試行、保留残高除外、二重取消し、二重共通プール移行、追記専用トリガーを含めた。CIではPostgreSQLへ全migrationとseedを適用して実行するが、CI実行結果自体は未確認。

## 5. 実行した主なコマンド

```text
pnpm db:generate
pnpm db:validate
pnpm format / pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

## 6. 未実装事項

- 取引専用メッセージ、金銭語句モデレーション
- 受渡し日時・場所の安全な合意機能
- 配送モック、追跡番号、配送証跡
- 通報・ブロック・異議申立てと取引リスクシグナル
- 保留調査の担当割当、証跡、期限、警告通知
- 確定済みポイント取消しと取引 `SUSPENDED` 等の自動連動
- ポイント期限、保有上限、未指定判定、共通プール自動移行
- ポイントによる寄付先指定と寄付期間
- ポイント台帳のページネーション・CSV・外部WORM保管

## 7. 既知のリスク

- DB統合・実DB E2E・migration適用はこの端末で未実行。CIまたはDocker環境での成功がマージ条件。
- 同時完了報告では競合した片方を安全に拒否し、利用者の再試行で完了させる。自動再試行は未実装。
- 保留後に承認すると `HELD` と新しい `POSTED` の両記録が残る。これは追記型履歴として意図した動作だが、運用説明が必要。
- 共通プール移行条件が未決のため、現状はadministratorの手動コマンドだけ。承認分離は未実装。
- 反対仕訳はポイントを相殺するが、完了済み取引状態を自動で停止・係争へ戻さない。
- 管理確認理由と作業区分は人手入力で、配送証跡による検証は未実装。
- ポイント台帳を更新・削除できないため、誤操作も追加仕訳で訂正する必要がある。

## 8. セキュリティ上の注意

- ポイント管理画面を一般利用者へ公開しない。administrator権限の付与・剥奪を監査すること。
- migrationの追記専用トリガーを本番DB権限で迂回できないよう、アプリDBロールを限定すること。
- 監査・台帳バックアップの暗号化、復旧テスト、外部WORM保管は本番前に必要。
- 管理確認理由へ個人情報、住所、追跡番号、メッセージ本文を記載しない運用が必要。

## 9. 人間の判断が必要な事項

1. 受取人承諾・受渡し準備状態の正式な期限と自動取消し
2. moderatorがポイント確定まで行えるか、administratorとの職務分掌を設けるか
3. 保留理由区分、調査SLA、保留解消の証跡
4. 配送作業区分を誰が申告し、管理者が何を証拠として確認するか
5. ポイント期限、保有上限、未指定判定と共通プール移行時期
6. 不正確認後の反対仕訳と取引停止・アカウント制裁の連動

## 10. 次に着手すべきタスク

1. `PH2-VERIFY-01`: Docker/CIで全migration、DB統合10件、実DB E2E4件を完走する。
2. `PH2-RISK-02`: 取引メッセージ、設定型金銭語句検知、管理確認キューを実装する。
3. `PH2-DISPUTE-03`: 保留・異議・取消し・反対仕訳・取引停止の一貫した解決フローを設計する。
4. `PH2-SHIPPING-04`: 配送モックと作業区分の証跡・管理確認を実装する。
5. `PH3-ALLOC-01`: ポイント期限・共通プール条件を決定後、寄付先指定と配分期間へ進む。
