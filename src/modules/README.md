# モジュール境界

業務機能は `identity`, `listings`, `transactions`, `messaging`, `safety`, `points`, `donations`, `privacy`, `audit` に分割します。Phase 1では `health`, `audit`, `outbox` の最小基盤だけ実装済みです。

- `domain`: 外部フレームワークに依存しない型、不変条件、状態機械
- `application`: ユースケースとport
- `infrastructure`: Prismaや外部adapter
- UI/Route Handlerはapplication serviceを呼び、Prismaを直接呼びません

未実装モジュールの業務判断は `docs/requirements-conflicts.md` の解決前に固定しません。
