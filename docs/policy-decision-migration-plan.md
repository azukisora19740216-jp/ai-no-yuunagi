# ADR-0004・ADR-0005 非破壊migration計画

> 実装注記（2026-07-21）: 本計画は承認され、追加migration `202607210004`〜`008` としてexpand-firstで実装した。検証状況と残課題は `policy-decision-implementation-report.md` を参照する。

- 状態: 実装承認前の計画
- 作成日: 2026-07-21
- 対象: 招待・実証登録・同意・KYC・取引用語・ポイント期限/上限/非遡及
- 重要: この文書作成時点では `prisma/schema.prisma`、既存migration、DB、seedを変更していない。

## 1. 方針

1. 適用済みの `202607200001`〜`202607200003` を編集しない。
2. 既存列・テーブル・enum値を削除、rename、型変更しない。最初はnullable列と新規テーブルだけを追加する。
3. `point_ledger_entries` と `common_pool_ledger_entries` の既存行を更新・削除しない。append-only triggerを無効化しない。
4. 本番開始前の既存ポイント行は正式ポイントへ変換しない。ポリシー版なし/開始日時前として正式projectionから除外する。
5. 新旧コードが一時的に共存できるexpand → backfill/分類 → cutover → 後日contractの順にする。
6. 招待使用、登録枠確保、ポイント付与、上限超過移行、失効移行、監査、outboxはそれぞれ同一DBトランザクションで行う。
7. migration適用前に本番開始日時、周辺地域、登録枠算入規則、残高算入status、消費順を承認する。

## 2. 変更候補

### 2.1 新規テーブル

| テーブル候補                 | 目的                                                | 既存データへの影響 |
| ---------------------------- | --------------------------------------------------- | ------------------ |
| `service_policy_versions`    | 本番開始日時、制度版、承認証跡                      | なし               |
| `pilot_settings`             | 地域、登録上限50、招待制、全国公開off               | なし               |
| `invitations`                | 運営発行単回コード、招待元・発行/使用/失効監査      | なし               |
| `consent_records`            | 規約・privacy・18歳確認の版付き追記証跡             | なし               |
| `kyc_cases`                  | mock/external差替可能なKYC履歴                      | なし               |
| `point_policy_versions`      | 基本1、配送最大3、合計4、上限30、月末失効、適用開始 | なし               |
| `point_movement_links`       | overflow/expiryの部分移動とuser/pool仕訳の対応      | なし               |
| `point_expiry_notifications` | 60/30/7日前の予定・送信結果                         | なし               |

既存の認証ライブラリが所有する `users` 等を直接拡張するか、`pilot_memberships` のsidecarを置くかはschema実装前にBetter Authのmigration境界を確認して決める。認証管理列との衝突を避けるため、初回候補はsidecarを優先する。

### 2.2 既存テーブルへの追加候補

| 対象                         | nullable追加候補                                                                          | 理由                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| `transactions`               | `both_reported_at`, `handover_occurred_at`, `admin_finalized_at`, `admin_finalized_by_id` | 当事者報告・現実の引渡し申告・運営確認を分離 |
| `point_ledger_entries`       | `policy_version_id`, `awarded_at`, `expires_at`, `award_group_id`                         | 正式/開発ポイント、期限、取引付与群を識別    |
| `common_pool_ledger_entries` | `movement_link_id` またはlink側参照のみ                                                   | overflow/expiryの対応関係                    |

既存 `admin_verified_at`, `completed_at`, `reversal_of` は削除・renameしない。新コードでは意味の明確な新列へ書き、移行期間はread projectionで旧列をfallback参照する。`reversal_of` は取消し専用のままにし、上限超過や失効へ流用しない。

### 2.3 enum・DB制約候補

- 既存PostgreSQL enumへの値追加はrollbackしにくいため、overflow/expiryの新イベント型は先に互換性を確認する。必要なら新しいmovementテーブルの文字列+checkで隔離する。
- 招待 `code_hash` unique、単回使用整合check、used/revoked/expiredの排他check。
- ポイントポリシー初期版: base=1、shipping max=3、transaction max=4、available cap=30。
- 取引単位の基本・配送付与uniqueは既存制約を維持する。
- 利用者out、pool in、movement linkの同額性は複数テーブルcheckだけでは完結しないため、サービスtransaction、遅延制約trigger候補、照合jobの三層で保証する。
- 既存append-only triggerを新規台帳・link・policy履歴にも適用する。

## 3. migration候補の分割

### M1: policy・pilot・identityのexpand

- policy version、pilot setting、invitation、consent、KYC履歴、必要なindex/外部キーを追加。
- 初期設定行はmigration SQLへ本番開始日時を直書きせず、承認済みbootstrap commandで登録する。
- 現行open registrationをこの段階で止めず、コード切替前のschema互換を保つ。

### M2: transaction terminologyのexpand

- 新しいnullable時刻・actor列を追加。
- 既存行を「所有権移転済み」と推定してbackfillしない。
- `both_reported_at` は既存の双方報告時刻がある開発行についても、元行更新を避ける必要はない通常projectionだが、今回は開発データを正式記録へ昇格しないためbackfillしない案を第一候補とする。

### M3: point policy・expiry・movementのexpand

- policy version、movement link、notificationテーブル、新nullable列を追加。
- 既存台帳行をUPDATEしない。既存行の `policy_version_id IS NULL` を開発・非正式として扱う。
- 新規正式付与だけにpolicy ID、award日時、期限、group IDを必須とする。移行期間中はDBの全行NOT NULLではなく、正式付与用DB関数/triggerまたはサービスguardで条件付き必須を検証する。

### M4: application cutover後の制約強化

- 招待なし登録、登録枠超過、KYCなしtransactional commandを拒否するコードとテストを先に展開する。
- dry-run照合後、正式付与についてpolicy/expiry/group必須の制約を `NOT VALID` → validateの順で追加する。
- 全国公開offと登録上限の設定欠落時fail closedを起動時・readinessで確認する。

### M5: contract（別承認）

- 旧 `completed_at` 等の削除・renameはMVP中に行わない。
- 参照が完全に消え、保持/監査要件とrollback期間を満たした後、別ADR・別承認でのみ検討する。

## 4. 既存データを破壊しない分類

| データ                    | 扱い                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| 本番開始前のpoint ledger  | 元行不変。正式残高・失効job・30上限計算から除外                                          |
| 既存common pool行         | 元行不変。開発pool projectionへ残し、正式poolと集計を分離                                |
| 既存user                  | 自動的に正式招待会員へ昇格しない。staff/テスト/実証会員の分類手順を承認後にsidecarへ追記 |
| 既存consentなしuser       | 同意済みと推定しない。正式利用開始前に招待・同意・年齢・KYCの再ゲートを通す              |
| 既存completed transaction | 所有権や現実引渡しをDB値から推定しない。開発データとして保持                             |

本番データが既に存在すると判明した場合は、この計画を停止し、件数・状態・台帳checksumのread-only棚卸し後に個別移行ADRを作る。

## 5. cutover手順

1. 専用backupから復元試験し、schema・台帳件数・合計・checksum基準値を取得する。
2. M1〜M3をstagingへ適用し、旧アプリでread/writeできることを確認する。
3. 新アプリをfeature flag offで展開し、招待/KYC/point policyのdry-run結果を監査する。
4. 倉敷周辺範囲、登録上限算入規則、本番開始日時、初期point policyを二者確認で登録する。
5. 招待制・KYC gateを有効化し、全国公開が無効であることを外部/内部両経路で確認する。
6. 正式ポイント機能は本番開始日時到達後だけ有効化する。既存行が正式残高0として除外されることを照合する。
7. M4の制約を追加・validateし、監視期間後も旧列は残す。

## 6. rollback

- schema追加は原則残したまま、application feature flagをoffにして旧read pathへ戻す。
- 発行・同意・KYC・pointの新規追記を削除しない。誤付与は反対仕訳、誤設定は新しいpolicy/settings版で訂正する。
- migration適用直後の物理rollbackが必要でも、新規台帳行をdropしてはならない。適用後に正式仕訳が1件でも作られた場合はroll-forwardだけを許可する。
- 招待/KYC gateの障害時もopen registrationへ自動fallbackしない。登録・KYC必須操作を一時停止する。

## 7. 検証計画

- schema: Prisma validate、migrationの空DB/既存DB適用、rollback rehearsal、旧app互換。
- 招待: 同一コード同時使用、50枠目/51枠目競合、期限・取消し、監査、生コード非露出。
- KYC: browse/provisional registration可、listing/request/transaction参加拒否・許可、mockの本番fail closed。
- transaction: 双方報告とadmin finalize時刻分離、所有権を示す文言がないこと。
- point: 0〜3加算、合計1〜4、二重付与、29/30/31境界、同時付与、部分overflow、期限月末、60/30/7通知、開発仕訳除外、非遡及。
- integrity: user out = pool in、元台帳不変、正式残高<=30、全重要操作にaudit/outbox。

## 8. migration前の承認事項

1. 「倉敷市および周辺地域」の具体的な判定範囲。
2. 50名にstaff、seed、退会済み、一時停止中を含めるか。
3. 1人1アカウントの照合方法、例外審査、保持期間。
4. 利用可能残高に含めるstatusと、期限別ポイントの消費順序。
5. 本番開始日時、初期point policyの承認者、設定手順。
6. 失効通知のチャネル・再送・通知不能時の扱い。

これらは今回の正式決定を変更する論点ではないが、非破壊migrationと正しい不変条件を実装するために必要である。
