# 14_引継ぎ一覧 — 初回の設定

このフォルダを `claude 作業場` の直下に置くと、作業場の CLAUDE.md の仕組みで「引継ぎ一覧を作って」から呼ばれる。

## 置くもの

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | トリガーと最重要ルール |
| `SKILL.md` | 手順・レポートの形式 |
| `handover_kintone.js` | kintoneの読み取り（GETのみ、書き込みなし） |
| `handover_config.example.json` | 設定のひな形 |
| `handover_config.json` | 実際の設定（下の手順で作る） |

## 手順（15分ほど）

1. **APIトークンを作る。** kintoneのアプリ33（外国人進捗管理）とアプリ30（受注管理）の設定 → APIトークンで、**「レコード閲覧」だけ**にチェックしたトークンを作る。
   - 既存の `assistant_kintone_digest.js` が使っているトークンが閲覧だけなら、それを使ってもよい。
   - 2つのアプリのトークンは、カンマでつないで1つの環境変数に入れられる。
2. **トークンを環境変数に入れる**（実行するPCごと。共有フォルダには置かない）。
   ```
   setx KINTONE_HANDOVER_TOKEN "アプリ33のトークン,アプリ30のトークン"
   ```
   入れたあと、Claude Code（VS Code）を開き直す。
3. **設定ファイルを作る。** `handover_config.example.json` を写して `handover_config.json` にし、`domain` を書き換える（`assistant_kintone_digest.js` の中にあるドメインと同じ）。
4. **フィールドコードを合わせる。**
   ```
   node handover_kintone.js fields
   node handover_kintone.js fields 30
   ```
   出てきた一覧を見て、`fields` と `orderFields` の値を実際のフィールドコードに直す。Claudeに「この一覧で handover_config.json を直して」と頼んでもよい。使わない項目は `null` にする。
   - `assignee` はユーザー選択のフィールド。`people` のメールアドレスがkintoneのログイン名と違うときは、ログイン名に直す。
   - `status` はステイタス（入管）とステイタス（国交省）の2つ。
   - `progressTable` は「進捗の記録」のサブテーブル。中の日付・担当・内容のコードも合わせる。
5. **試す。**
   ```
   node handover_kintone.js cases 井上
   ```
   件数と、在留期限の近い案件が先頭に来ているかを確認する。`error` が出たら、その文面をClaudeに見せる。

## 栗林さんが休むとき

栗林さんのPCは使えないので、芳川さんか井上さんのPCで実行する。そのPCでも手順2（トークンの環境変数）が要る。**休職が決まる前に、芳川さんのPCで一度試しておく**こと。

## 確認済みのこと・まだのこと

- `handover_kintone.js` は、模擬のkintoneサーバーで動作を確認した（担当者の絞り込み、完了案件の除外、在留期限順の並べ替え、伏せ字、コメント・進捗の記録の取り出し）。実際のアプリ33ではまだ動かしていない。
- フィールドコードは推測で書いてある。手順4で必ず直す。
- LINE WORKSは読まない（使い方が分かっていないため）。
