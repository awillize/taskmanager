#!/usr/bin/env node
// 引継ぎ一覧用：kintone「外国人進捗管理」（と「受注管理」）を読み取り専用で取り出す。
// 書き込み・コメント投稿の機能はない（GETのみ）。
//
// 使い方:
//   node handover_kintone.js fields                 … アプリ33のフィールド一覧（初回の設定用）
//   node handover_kintone.js fields 30              … アプリ30のフィールド一覧
//   node handover_kintone.js cases <対象者>         … 対象者の未完了案件をJSONで出す
//       例: node handover_kintone.js cases 井上
//   オプション: --comments 5（1案件あたりのコメント件数。既定5） --progress 3（進捗の記録の件数。既定3）
//               --include-done-days 0（完了後この日数以内のものも含める。既定0）
//
// 設定: 同じフォルダの handover_config.json（handover_config.example.json を写して作る）
// APIトークン: 環境変数（config の tokenEnv で指定。既定 KINTONE_HANDOVER_TOKEN）。
//              アプリ33・30の「レコード閲覧」だけを許可したトークンを使う。複数はカンマ区切り。
//              トークンは共有フォルダに置かない。

'use strict';
const fs = require('fs');
const path = require('path');

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }, null, 2) + '\n');
  process.exit(1);
}

const cfgPath = path.join(__dirname, 'handover_config.json');
if (!fs.existsSync(cfgPath)) fail('handover_config.json がありません。handover_config.example.json を写して作ってください。');
let cfg;
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { fail('handover_config.json を読めません: ' + e.message); }

const domain = process.env.KINTONE_DOMAIN || cfg.domain;
const token = process.env[cfg.tokenEnv || 'KINTONE_HANDOVER_TOKEN'];
if (!domain) fail('kintoneのドメインが設定されていません（config の domain）。');
if (!token) fail('APIトークンの環境変数 ' + (cfg.tokenEnv || 'KINTONE_HANDOVER_TOKEN') + ' が空です。');
const base = (domain.startsWith('http') ? domain : 'https://' + domain).replace(/\/$/, '');

async function get(apiPath, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v)) v.forEach((x, i) => qs.append(`${k}[${i}]`, x));
    else if (v !== undefined && v !== null) qs.append(k, String(v));
  }
  const url = `${base}${apiPath}?${qs.toString()}`;
  const res = await fetch(url, { method: 'GET', headers: { 'X-Cybozu-API-Token': token } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`${apiPath} ${res.status}: ${body.message || body.raw || ''}`);
  return body;
}

// ---- 値の取り出し ----
function val(rec, code) {
  if (!code) return undefined;
  const f = rec[code];
  if (!f) return undefined;
  const v = f.value;
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && v[0] !== null && 'name' in v[0]) return v.map(x => x.name).join('、');
    if (v.length && typeof v[0] === 'object' && v[0] !== null && 'value' in v[0]) return v; // サブテーブル
    return v.join('、');
  }
  if (v && typeof v === 'object' && 'name' in v) return v.name;
  return v === '' ? undefined : v;
}
function vals(rec, codes) {
  return (codes || []).map(c => val(rec, c)).filter(x => x !== undefined && x !== null && x !== '');
}

// パスワード・ログイン情報らしき部分を伏せる（分析レポート6-1の指摘への対応）
// パスワード系は区切り（:＝や空白）の後の値を、ID系は「:」「＝」がある場合だけ伏せる
// （「技能者IDがない場合」のような普通の文を伏せないため）
const SECRET_RES = [
  /((?:パスワード|ﾊﾟｽﾜｰﾄﾞ|password|passwd|PW|ＰＷ)\s*(?:[:：=＝]\s*|\s+))([^\s、。,，\n]{3,})/gi,
  /((?:ログインID|ログインＩＤ|ユーザーID|ユーザーＩＤ|ID|ＩＤ|アカウント|account|user)\s*[:：=＝]\s*)([^\s、。,，\n]{3,})/gi,
];
function mask(s) {
  if (typeof s !== 'string') return s;
  return SECRET_RES.reduce((t, re) => t.replace(re, (m, label) => label + '＊＊＊（伏せ字）'), s);
}
function short(s, n) {
  if (typeof s !== 'string') return s;
  const t = mask(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

async function fields(appArg) {
  const app = Number(appArg || cfg.apps.progress);
  const r = await get('/k/v1/app/form/fields.json', { app });
  const out = [];
  for (const [code, p] of Object.entries(r.properties)) {
    const item = { code, label: p.label, type: p.type };
    if (p.type === 'SUBTABLE') item.fields = Object.entries(p.fields).map(([c, q]) => ({ code: c, label: q.label, type: q.type }));
    out.push(item);
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  process.stdout.write(JSON.stringify({ app, fields: out }, null, 2) + '\n');
}

async function fetchAll(app, query, fieldCodes) {
  const all = [];
  for (let offset = 0; offset <= 9500; offset += 500) {
    const r = await get('/k/v1/records.json', {
      app,
      query: `${query} order by $id asc limit 500 offset ${offset}`,
      fields: fieldCodes,
    });
    all.push(...r.records);
    if (r.records.length < 500) break;
  }
  return all;
}

async function comments(app, recordId, limit) {
  if (!limit) return [];
  const r = await get('/k/v1/record/comments.json', { app, record: recordId, order: 'desc', limit });
  return r.comments.map(c => ({
    at: c.createdAt,
    by: c.creator && c.creator.name,
    to: (c.mentions || []).map(m => m.code).join('、') || undefined,
    text: short(c.text, 400),
  }));
}

async function cases(who, opts) {
  const person = cfg.people[who];
  if (!person) fail(`対象者「${who}」が config の people にありません。使える名前: ${Object.keys(cfg.people).join('・')}`);
  const F = cfg.fields;
  const app = cfg.apps.progress;
  const today = new Date();

  // 担当者で絞る。完了の判定は取得後に行う（完了の表し方がアプリによって違うため）
  const query = `${F.assignee} in ("${person}")`;
  const codes = ['$id', '更新日時', ...new Set([
    F.assignee, F.company, F.title, F.applicant, F.applicationType, F.visa, F.field,
    ...(F.status || []), F.ball, F.expiry, F.completedDate, ...(F.applyDates || []),
    ...(F.receiptNos || []), F.nextContact, F.supporter, F.progressTable, F.memo,
  ].filter(Boolean))];

  let recs;
  try { recs = await fetchAll(app, query, codes); } catch (e) { fail('kintone取得エラー: ' + e.message); }

  const out = [];
  for (const rec of recs) {
    const done = val(rec, F.completedDate);
    if (done) {
      const keepDays = Number(opts['include-done-days'] || 0);
      if (!keepDays || daysBetween(new Date(done), today) > keepDays) continue;
    }
    const id = val(rec, '$id');
    const updated = val(rec, '更新日時');
    let progress = [];
    const table = val(rec, F.progressTable);
    if (Array.isArray(table)) {
      progress = table.map(row => ({
        date: row.value[F.progressDate] && row.value[F.progressDate].value,
        staff: row.value[F.progressStaff] && (() => { const v = row.value[F.progressStaff].value; return Array.isArray(v) ? v.map(x => x.name || x).join('、') : (v && v.name) || v; })(),
        text: short(row.value[F.progressText] && row.value[F.progressText].value, 300),
      })).filter(r => r.date || r.text)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, Number(opts.progress || 3));
    }
    let cm = [];
    try { cm = await comments(app, id, Number(opts.comments || 5)); } catch (e) { cm = [{ error: e.message }]; }

    const expiry = val(rec, F.expiry);
    const lastMove = [updated, progress[0] && progress[0].date, cm[0] && cm[0].at].filter(Boolean).sort().pop();
    out.push({
      record: Number(id),
      url: `${base}/k/${app}/show#record=${id}`,
      company: val(rec, F.company),
      title: val(rec, F.title),
      applicant: val(rec, F.applicant),
      applicationType: val(rec, F.applicationType),
      visa: val(rec, F.visa),
      field: val(rec, F.field),
      status: vals(rec, F.status).join(' / ') || undefined,
      ball: val(rec, F.ball),
      expiry,
      daysToExpiry: expiry ? daysBetween(today, new Date(expiry)) : undefined,
      applyDates: vals(rec, F.applyDates),
      receiptNos: vals(rec, F.receiptNos).map(mask),
      nextContact: val(rec, F.nextContact),
      supporter: val(rec, F.supporter),
      assignees: val(rec, F.assignee),
      memo: short(val(rec, F.memo), 400),
      completedDate: done,
      lastMove,
      daysSinceLastMove: lastMove ? daysBetween(new Date(lastMove), today) : undefined,
      progress,
      comments: cm,
    });
  }
  out.sort((a, b) => (a.daysToExpiry ?? 99999) - (b.daysToExpiry ?? 99999));

  // 受注管理（任意）：請求・入金の状況
  let orders;
  if (cfg.apps.orders && cfg.orderFields && cfg.orderFields.assignee) {
    const O = cfg.orderFields;
    const oq = `${O.assignee} in ("${person}")` + (O.openQuery ? ` and ${O.openQuery}` : '');
    try {
      const orec = await fetchAll(cfg.apps.orders, oq, ['$id', ...[O.title, O.customer, O.status, O.amount, O.invoice, O.payment, O.orderDate].filter(Boolean)]);
      orders = orec.map(r => ({
        record: Number(val(r, '$id')),
        url: `${base}/k/${cfg.apps.orders}/show#record=${val(r, '$id')}`,
        title: val(r, O.title), customer: val(r, O.customer), status: val(r, O.status),
        amount: val(r, O.amount), invoice: val(r, O.invoice), payment: val(r, O.payment), orderDate: val(r, O.orderDate),
      }));
    } catch (e) { orders = { error: '受注管理の取得エラー: ' + e.message }; }
  }

  process.stdout.write(JSON.stringify({
    target: who, user: person, fetchedAt: today.toISOString(), app, count: out.length, cases: out, orders,
  }, null, 2) + '\n');
}

(async () => {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) if (rest[i].startsWith('--')) opts[rest[i].slice(2)] = rest[i + 1];
  try {
    if (cmd === 'fields') await fields(arg);
    else if (cmd === 'cases' && arg) await cases(arg, opts);
    else fail('使い方: node handover_kintone.js fields [アプリ番号] | cases <対象者> [--comments 5] [--progress 3] [--include-done-days 0]');
  } catch (e) { fail(e.message); }
})();
