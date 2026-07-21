# ADR-0001: Phase 1基盤スタック

- 状態: Accepted
- 決定日: 2026-07-20
- 範囲: 開発基盤のみ。認証・外部事業者・業務上の未決事項を含まない。

## 決定

- Node.js 24.18.x、pnpm 11.9.x、TypeScript 6.0.x
- Next.js 16.2.x App Router、React 19.2.x
- PostgreSQL 18、Prisma 7.8、`@prisma/adapter-pg`
- Zod、Pino、Vitest、Testing Library、Playwright
- モジュラーモノリス、Docker Compose、GitHub Actions暫定

全バージョンをmanifest/lockfileへ固定する。pnpmは供給網検証、明示build許可、Node engine固定、hoisted linkerを使用する。hoisted linkerはWindows sandboxとstandalone配布でシンボリックリンク解決に依存しないために選択した。

## 結果

- 単一リポジトリ・単一配布単位でMVPを小さく開始できる。
- Prisma 7の生成clientとdriver adapterを明示管理する必要がある。
- GitHub以外へ移行する場合、CI定義を置換する。
- 認証ライブラリ選定は別ADRとし、本決定から推論しない。
