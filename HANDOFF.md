# 引き継ぎ書 — 四領の書

作成: 2026-09-13 / 引き継ぎ元: Claude（Cowork） → 引き継ぎ先: Claude Code

---

## 0. 最初に読むもの

| 順 | ファイル | 何が書いてあるか |
|---|---|---|
| 1 | この HANDOFF.md | 全体像・制約・作業の入り口 |
| 2 | `docs/design.md` | 設計の決定と理由。v0.1→v1.6の全履歴 |
| 3 | `docs/open-items.md` | 未決事項7件（GitHub Issue #1 と同内容） |
| 4 | `shiryou-no-sho.html` | 実装。これ一つで動く |

---

## 1. これは何か

芳川恒徳さんが兼務する役職ごとにタスクを管理する盤。三国志風の意匠。
**Claude Artifact として公開して動かしている**。単一HTMLファイル、ビルド工程なし、依存パッケージなし。

公開先: `https://claude.ai/code/artifact/3fdb406a-b6ae-45d2-b30c-78c395be1df7`
（現在 Version 14。db に実データが約75件入っている）

### 領地（6つ）

| id | 表示名 | 実体 | type |
|---|---|---|---|
| `hal` | HAL | 行政書士法人HAL 役員 | 統治 |
| `gema` | GEMA | 外国人材雇用マネジメント協会 代表理事 | 統治 |
| `awillize` | Awillize | 個人名義の発信・教材 | 統治 |
| `umiha` | 海羽会 | 医療法人社団海羽会 監事 | 監察 |
| `apsip` | APSIP | 国際人材普及振興協会 監事 | 監察 |
| `koubou` | 工房 | AI基盤・実験 | 工房 |

---

## 2. いま最初にやること

### 2-1. GitHubへプッシュ（未完了）

このリポジトリは**まだリモートに上がっていない**。ローカルに1コミットあり、remoteは設定済み。

```
cd ~/Downloads/taskmanager
git push -u origin main
```

Cowork側のセッションからは押せなかった（セッションの認可リポジトリ集合に `awillize/taskmanager` が入っておらず、プロキシが資格情報を差し込まない）。GitHub CLI は認証済みなので、手元からは通るはず。

### 2-2. Issue #1 が未決事項の一覧

`https://github.com/awillize/taskmanager/issues/1`
優先度が高いのは **1番（APSIPのログイン開通の期日）** と **3番（書庫のPDF読み取りの実地検証）**。

---

## 3. 最重要の制約 — ローカルでは動かない

`shiryou-no-sho.html` をブラウザで直接開いても、**保存も軍師も動かない**。

理由は、この盤が Claude Artifact のランタイム機能に乗っているから。

| 機能 | 使っているもの | ローカルでの挙動 |
|---|---|---|
| 任務・武将・書庫などの保存 | `claude.use("db")` | `null` が返り、画面に「記録所に繋がっていません」と出る。変更は保存されない |
| 軍師への相談／武将への下命 | `claude.use("sample")` | `null` が返り、相談欄が「この画面からClaudeに相談できません」になる |

`window.claude` は Artifact ビューアの中にしか存在しない。したがって **Claude Code でできるのは以下まで**。

- HTML/CSS/JSの編集
- 構文チェック（`node --check` で `<script>` の中身を検査できる）
- レイアウトの確認（データなしの空の状態で）

**db と sample が絡む挙動の確認は、公開してからでないとできない。**

### 再公開は Claude Code からはできない

同じURLに差し替えるには、Artifact ツールを持つ Claude のセッション（Cowork など）から、同じファイルパスで再公開する必要がある。Claude Code にはそのツールがない。

**推奨する進め方**: Claude Code でファイルを編集してコミット → 編集後のファイルを Cowork 側の Claude に渡して再公開してもらう。

---

## 4. 実装の地図

`shiryou-no-sho.html` は 1ファイル・約2,000行。構成は上から順に。

```
<title> / Google Fonts の link
<style>            … CSS。クラス名は機能名（.win .card .qrow .mrow .advisor .shelf .grow …）
<div class="wrap"> … 画面の器。#status #otsugeWin #field #realmView #routeView #genView
<script>           … 全ロジック（IIFE、ES5寄り。ビルドなしでそのまま動かす前提）
```

### `<script>` の中の並び（コメントで区切ってある）

| 区切り | 主な関数 | 役割 |
|---|---|---|
| 日付 | `fmt` `daysUntil` `longToday` | 日付整形。`TODAY` は起動時に固定 |
| 集計 | `questsOf` `patrolsOf` `isOverdue` `nextDue` `realmTone` | 領地カードの枠色などを算出 |
| 描画 | `renderStatus` `renderOtsuge` `realmCard` `renderField` | 本営の画面 |
| ルートマップ | `currentFunnel` `routeGap` `renderRoute` `entryCard` `moduleRow` | モジュール管理の画面 |
| 写す | `copyText` `orderSheet` `cmdPanel` | 命令書の書き出しとクリップボード |
| 配下武将 | `renderGenerals` `generalEditor` `orderPanel` `command` `keepReport` | 武将一覧と下命 |
| 進言の実行 | `execPanel` `runExec` `attachExec` | 軍師の答えを武将に渡す欄 |
| 外部ライブラリ | `loadScript` `loadFirst` `pdfToText` `docxToText` `pptxToText` | 書庫の取り込み（CDNから遅延読み込み） |
| 書庫 | `shelf` `intakeFiles` `shelfContext` | 資料の保持とプロンプトへの同梱 |
| 軍師 | `advisorWindow` `realmContext` `routeContext` `ask` | 相談欄 |
| 任務 | `questRow` `addForm` `create` `setStatus` `complete` `remove` | 任務のCRUD |
| 起動 | `claude.use("db")` `claude.use("sample")` | 購読の開始 |

### 状態の持ち方

```js
var state = {realms, quests, patrols, funnels, entries, modules,
             managers, docs, generals, reports, hero};
var view  = {mode, realmId, tab, funnelId, editModule, editEntry,
             editManager, editGeneral, orderQuest, openReports,
             cmdQuest, editGold};
```

`render()` が全画面を組み直す素朴な作りにしてある。差分更新はしていない。db の `onSnapshot` が発火するたびに `render()` が走る。

**注意**: 再描画で入力途中のテキストが消えないよう、textareaの下書きは `ai[key].draft` などJS側に退避してある。新しい入力欄を足すときは同じ手当てが要る。

---

## 5. データ構造（Artifact の db）

```
realms/<id>     {name, role, type:"統治"|"監察"|"工房", order}
quests/<id>     {realmId, title, kind:"main"|"sub"|"daily",
                 status:"todo"|"doing"|"done", due, difficulty:1-5,
                 parentId, assignee, recurrence, createdAt, completedAt}
patrols/<id>    {realmId, title, date, rule, status}
funnels/<id>    {name, product, order}
entries/<id>    {funnelId, name, status, heldOn, apply, attend, order}
modules/<id>    {funnelId, entryId, stage, title, status:"todo"|"wip"|"live",
                 realmId, url, metricLabel, metricValue, metricAt, order}
managers/<id>   {scope:"realm"|"route", targetId, name, persona}
generals/<id>   {name, skill, prompt, order}
reports/<id>    {questId, realmId, generalName, text, at}
docs/<id>       {scope, targetId, kind:"text"|"path", name, text, path,
                 chars, truncated, on, addedAt}
hero/status     {gold, updatedAt}
```

### 派生値は保存していない

戦勝・制圧・領地の枠色・通過率は**すべて毎回算出**する。保存すると必ずズレるため。

### 現在入っているデータ

- 領地6件、任務約30件（実在の取り組みから投入）、巡察2件
- 軍師7件（全て「諸葛亮」。scope+targetIdで画面ごとに別レコード、役割文が異なる）
- 武将8件（関羽・張飛・趙雲・馬超・黄忠・龐統・馬謖・姜維）
- ファネル1件（GEMAプレミアム会員）、入口1件、モジュール17件

**スキーマを変えるときは既存データの移行が要る。** 移行は `write_db` を持つClaudeのセッションからしかできない。

---

## 6. 外部依存

CSPで許可されているのは cdnjs など限られたホストのみ。**追加するときは必ずバージョンを固定する。**

| 用途 | 読み込み先 | いつ |
|---|---|---|
| フォント | Google Fonts（Shippori Mincho B1 / Noto Serif JP） | 常時 |
| PDF抽出 | cdnjs の pdf.js 3.11.174（失敗時 2.16.105） | PDFを落とした時だけ |
| docx/pptx抽出 | cdnjs の JSZip 3.10.1 | それらを落とした時だけ |

pdf.js は **classic script（UMD）の 3.x 系**を使っている。4.x 以降は `.mjs` になりこの読み込み方では動かない。上げるときは要注意。

---

## 7. 用語と命名の方針

画面名と段の名前は**素直な実務語**、役割と動作は**世界観の語**。世界観は見た目（明朝・墨地・金の罫）が担う。

| 素直な語 | 世界観の語 |
|---|---|
| モジュール管理、武将一覧、書庫、集客、入口、合流 | 軍師、配下武将、監軍、出陣、討取、命じる、進言を請う |

一度「糧道図」と名付けて却下された経緯がある（`docs/design.md` 16章）。凝った命名は画面名には使わない。

UIラベルは漢字中心。ひらがな主体のドラクエ語は v1.0 で廃止済み。

---

## 8. 設計上、崩してはいけない判断

`docs/design.md` に理由まで書いてあるが、要点だけ。

1. **監察領地は統治領地と表示を変える** — 監事の仕事は常時湧かない。攻略率で並べると期日を見落とす
2. **APSIPには「常時」の行がある** — 巡察に紐づかない業務監査・財務監査を持つため。海羽会にはない
3. **モジュール管理の優先度は「本線の欠け＞入口ゼロ＞集客の欠け」** — 本線は1本なので、欠けるとセミナーを何本作っても無駄になる
4. **期日は勝手に入れない** — 実在しない期限を置くと枠色が意味を失う
5. **武将の成果は「報告」として任務に紐づく** — 取り消せる操作しかさせない
6. **書庫は取り出した文字だけを保存する** — ファイル本体は持たない。読めない形式は「読めない」と明示する

---

## 9. 検証の手順

db と sample を使わない範囲なら、ここまで確認できる。

```bash
# <script> の構文チェック
sed -n '/^<script>$/,/^<\/script>$/p' shiryou-no-sho.html | sed '1d;$d' > /tmp/check.js
node --check /tmp/check.js

# 残っているひらがなUIラベルの洗い出し（v1.0以降は漢字中心）
grep -o '"[^"]*[ぁ-ん][^"]*"' shiryou-no-sho.html | sort -u
```

**公開してからでないと確認できないもの**: 保存、軍師、武将、書庫の取り込み、命令書のコピー。

---

## 10. 連絡事項

- 芳川さんの表記は「芳川恒徳（よしかわつねのり）」。盤の本営に表示している
- 金（協会の預金残高）は手入力。自動では動かさない
- 武将と軍師の文章はすべて画面から書き換えられる。コードに埋め込んだデフォルトは初期投入時のものだけで、現在の値は db にある
