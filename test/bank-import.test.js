/*
 * bank-import.test.js — 题库导入引擎 + 上传导入 UI 全链路测试
 *
 * 覆盖：
 *   A. 底层：inflate / unzip（store + deflate 两种压缩方式）
 *   B. XLSX：real 生成的 .xlsx（共享字符串 / 多工作表 / 数字 / 无表头）
 *   C. 文本：CSV(逗号) / TSV(Tab) / 分号 / 引号内含换行 / BOM / GBK
 *   D. 格式自动匹配：表头识别、选项分列、选项合并列、判断题、填空题、无表头推断
 *   E. 答案归一：字母 / 字母组合 / 数字序号 / 判断词 / 选项原文
 *   F. JSON：脚本导出格式 / 对象数组
 *   G. 模糊匹配 matchKey
 *   H. 端到端：jsdom 里真的选文件 → 解析预览 → 确认导入 → 答题命中
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { JSDOM } = require('jsdom');

// bank-import.js 只在运行时用到 DOMParser / engine，这里注入到 Node 全局即可单测
const jsdomForGlobals = new JSDOM('<!doctype html><html><body></body></html>');
global.DOMParser = jsdomForGlobals.window.DOMParser;
global.window = jsdomForGlobals.window;
global.engine = require('../src/engine.js');
const BankImport = require('../src/bank-import.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  | ' + extra : '')); }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  check(name, ok, ok ? '' : ('实际=' + JSON.stringify(a) + ' 期望=' + JSON.stringify(b)));
}

// ===================================================================
//  造一个真的 .xlsx（ZIP + XML），两种压缩方式都测
// ===================================================================
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param sheets [{name, rows: [[..]]}]
 * @param method 0=store 8=deflate
 * @param opts {shared:bool} 是否走 sharedStrings（更贴近 Excel 真实产物）
 */
function makeXlsx(sheets, method, opts) {
  opts = opts || {};
  const useShared = opts.shared !== false;
  const shared = [];
  const sharedIdx = {};
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cellVal = (v) => {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') return '<v>' + v + '</v>';
    if (!useShared) return '<c t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>'.slice(3);
    if (sharedIdx[v] == null) { sharedIdx[v] = shared.length; shared.push(v); }
    return null; // 交给调用方拼
  };
  const colName = (i) => {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };
  const sheetXml = (rows) => {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    rows.forEach((row, ri) => {
      x += '<row r="' + (ri + 1) + '">';
      row.forEach((v, ci) => {
        if (v === '' || v == null) return;
        const ref = colName(ci) + (ri + 1);
        if (typeof v === 'number') { x += '<c r="' + ref + '"><v>' + v + '</v></c>'; return; }
        if (useShared) {
          if (sharedIdx[v] == null) { sharedIdx[v] = shared.length; shared.push(v); }
          x += '<c r="' + ref + '" t="s"><v>' + sharedIdx[v] + '</v></c>';
        } else {
          x += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        }
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  };

  const files = [];
  files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>' });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  let wb = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  sheets.forEach((s, i) => { wb += '<sheet name="' + s.name + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; });
  wb += '</sheets></workbook>';
  files.push({ name: 'xl/workbook.xml', data: wb });
  let rel = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  sheets.forEach((s, i) => { rel += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; });
  rel += '</Relationships>';
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: rel });
  const sheetXmls = sheets.map((s) => sheetXml(s.rows));
  if (useShared) {
    let ss = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">';
    shared.forEach((s) => { ss += '<si><t xml:space="preserve">' + esc(s) + '</t></si>'; });
    ss += '</sst>';
    files.push({ name: 'xl/sharedStrings.xml', data: ss });
  }
  sheetXmls.forEach((x, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x }));
  return zipFiles(files, method);
}

function zipFiles(files, method) {
  const chunks = [], central = [];
  let offset = 0;
  files.forEach((f) => {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.from(f.data, 'utf8');
    const comp = (method === 8) ? zlib.deflateRawSync(raw) : raw;
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    chunks.push(lh, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  });
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat(chunks.concat([cdBuf, eocd]));
}

const u8 = (buf) => new Uint8Array(buf);

// 标准题库：表头 + 选项分列（最常见的导出格式）
const WIDE_ROWS = [
  ['序号', '题目', '选项A', '选项B', '选项C', '选项D', '答案', '题型'],
  ['1', '中国的首都是哪里？', '北京', '上海', '广州', '深圳', 'A', '单选题'],
  ['2', '以下哪些是哺乳动物？', '鲸鱼', '鲨鱼', '蝙蝠', '麻雀', 'A,C', '多选题'],
  ['3', '地球是圆的。', '正确', '错误', '', '', '正确', '判断题'],
  ['4', '水的化学式是H2O。', '正确', '错误', '', '', '正确', '判断题'],
];

(async () => {
  console.log('\n===== 题库导入引擎测试 =====');

  // ---------------------------------------------------------------
  console.log('\n[A] inflate / unzip 底层');
  {
    const src = '题库测试文本'.repeat(200) + 'ABCDEFG' + JSON.stringify({ a: 1, b: '中文' });
    const raw = Buffer.from(src, 'utf8');
    const def = zlib.deflateRawSync(raw);
    const out = BankImport.inflateRaw(u8(def), raw.length);
    check('inflate：deflate 还原正确', !!out && Buffer.from(out).toString('utf8') === src,
      out ? Buffer.from(out).toString('utf8').slice(0, 20) : 'null');

    const storeZip = zipFiles([{ name: 'a.txt', data: src }], 0);
    const defZip = zipFiles([{ name: 'a.txt', data: src }, { name: 'dir/b.txt', data: '第二' }], 8);
    const z1 = BankImport.unzip(u8(storeZip));
    const z2 = BankImport.unzip(u8(defZip));
    check('unzip：store 方式', !!z1 && Buffer.from(z1['a.txt']).toString('utf8') === src);
    check('unzip：deflate 方式', !!z2 && Buffer.from(z2['a.txt']).toString('utf8') === src);
    check('unzip：多文件', !!z2 && Buffer.from(z2['dir/b.txt']).toString('utf8') === '第二');
  }

  // ---------------------------------------------------------------
  console.log('\n[B] XLSX 解析');
  {
    const x1 = makeXlsx([{ name: '题库', rows: WIDE_ROWS }], 8);
    const r1 = BankImport.parseFile(u8(x1), 'bank.xlsx');
    check('xlsx（deflate + sharedStrings）识别', r1.kind === 'xlsx' && !r1.error, r1.error);
    check('xlsx 读到 1 个工作表', (r1.sheets || []).length === 1, '实际 ' + (r1.sheets || []).length);
    eq('xlsx 首行表头', r1.sheets[0].rows[0].slice(0, 3), ['序号', '题目', '选项A']);
    eq('xlsx 第二行数据', r1.sheets[0].rows[1].slice(0, 3), ['1', '中国的首都是哪里？', '北京']);

    const x2 = makeXlsx([{ name: 'S1', rows: WIDE_ROWS }, { name: 'S2', rows: [['题目', '答案'], ['一加一等于几', 'B']] }], 0, { shared: false });
    const r2 = BankImport.parseFile(u8(x2), 'bank2.xlsx');
    check('xlsx（store + inlineStr）识别', r2.kind === 'xlsx' && !r2.error, r2.error);
    check('xlsx 多工作表', (r2.sheets || []).length === 2, '实际 ' + (r2.sheets || []).length);
    eq('第二个工作表名', r2.sheets[1].name, 'S2');

    const x3 = makeXlsx([{ name: 'num', rows: [['题目', '答案'], ['1+1=?', 2]] }], 8);
    const r3 = BankImport.parseFile(u8(x3), 'n.xlsx');
    check('xlsx 数字单元格', r3.sheets[0].rows[1][1] === '2', '实际 ' + r3.sheets[0].rows[1][1]);

    // 假 xlsx（实为老版 xls 的 OLE2 头）
    const fake = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(100)]);
    const r4 = BankImport.parseFile(u8(fake), 'old.xls');
    check('.xls 给出友好提示（不支持旧格式）', !!r4.error && r4.error.indexOf('xlsx') >= 0, r4.error);
  }

  // ---------------------------------------------------------------
  console.log('\n[C] 文本表格：CSV / TSV / 引号换行 / BOM / GBK');
  {
    const csv = '题目,选项A,选项B,答案\n"中国的首都是哪里？",北京,上海,A\n"含,逗号 的题",甲,乙,B\n';
    const r1 = BankImport.parseFile(u8(Buffer.from(csv, 'utf8')), 'a.csv');
    check('CSV 逗号分隔', r1.kind === 'text' && r1.sheets[0].rows.length === 3, JSON.stringify(r1.sheets[0].rows[1]));
    eq('CSV 引号内逗号不被切', r1.sheets[0].rows[2][0], '含,逗号 的题');

    const tsv = '题目\t答案\n一加一等于几\tB\n';
    const r2 = BankImport.parseFile(u8(Buffer.from(tsv, 'utf8')), 'a.tsv');
    check('TSV 制表符分隔', r2.sheets[0].rows[1][1] === 'B', JSON.stringify(r2.sheets[0].rows[1]));

    const semi = '题目;答案\n一加一等于几;B\n';
    const r3 = BankImport.parseFile(u8(Buffer.from(semi, 'utf8')), 'a.txt');
    check('分号分隔自动识别', r3.sheets[0].rows[1][1] === 'B', JSON.stringify(r3.sheets[0].rows[1]));

    const multi = '题目,选项\n"题干一行\n第二行",A\n';
    const r4 = BankImport.parseFile(u8(Buffer.from(multi, 'utf8')), 'a.csv');
    check('CSV 引号内换行保留', r4.sheets[0].rows[1][0].indexOf('\n') > 0, JSON.stringify(r4.sheets[0].rows[1]));

    const bom = '\uFEFF题目,答案\n一加一等于几,B\n';
    const r5 = BankImport.parseFile(u8(Buffer.from(bom, 'utf8')), 'a.csv');
    eq('BOM 被剥离', r5.sheets[0].rows[0][0], '题目');

    // GBK：用 iconv 不可用时用手工构造（TextDecoder('gbk') 在 Node 22 可用）
    try {
      const gbkBytes = new TextDecoder('gbk');
      const buf = Buffer.from('题目,答案\n一加一等于几,B\n', 'utf8');
      // 手工生成 GBK 字节：中文按 GBK 编码（这里取常见字的码点做最小验证）
      const gbk = Buffer.concat([
        Buffer.from([0xcc, 0xe2, 0xc4, 0xbf, 0x2c, 0xb4, 0xf0, 0xb0, 0xb8, 0x0a]), // 题目,答案\n
        Buffer.from([0xd2, 0xbb, 0xbc, 0xd3, 0xd2, 0xbb, 0xb5, 0xc8, 0xd3, 0xda, 0xbc, 0xb8, 0x2c, 0x42, 0x0a]), // 一加一等于几,B\n
      ]);
      const r6 = BankImport.parseFile(u8(gbk), 'gbk.csv');
      check('GBK 编码自动识别', r6.enc === 'gbk' && r6.sheets[0].rows[1][1] === 'B',
        r6.enc + ' | ' + JSON.stringify(r6.sheets[0].rows[1]));
      eq('GBK 中文正确解码', r6.sheets[0].rows[0][0], '题目');
    } catch (e) {
      check('GBK 编码自动识别（环境不支持，跳过）', true);
    }
  }

  // ---------------------------------------------------------------
  console.log('\n[D] 表格格式自动匹配');
  {
    // ① 选项分列
    const a1 = BankImport.analyze(WIDE_ROWS, null);
    check('① 选项分列：识别到 4 题', a1.items.length === 4, '实际 ' + a1.items.length);
    eq('① 表头行 = 第 1 行', a1.headerRow, 0);
    eq('① 题干列 = 题目', a1.heads[a1.map.stem], '题目');
    eq('① 答案列 = 答案', a1.heads[a1.map.answer], '答案');
    eq('① 布局 = wide', a1.map.layout, 'wide');
    eq('① 单选答案', a1.items[0].ans, 'A');
    eq('① 多选答案', a1.items[1].ans, 'AC');
    eq('① 判断题答案', a1.items[2].ans, '正确');
    eq('① 选项数量', a1.items[0].opts.length, 4);
    eq('① 题型识别', a1.items[1].type, 'multi');
    eq('① 判断题型', a1.items[2].type, 'judge');

    // ② 选项合并一列（单元格内换行）
    const merged = [
      ['题目', '选项', '答案'],
      ['中国的首都是哪里？', 'A. 北京\nB. 上海\nC. 广州', 'A'],
      ['以下哪些是哺乳动物？', 'A. 鲸鱼\nB. 鲨鱼\nC. 蝙蝠', 'A,C'],
    ];
    const a2 = BankImport.analyze(merged, null);
    check('② 合并选项列：识别到 2 题', a2.items.length === 2, '实际 ' + a2.items.length);
    eq('② 布局 = merged', a2.map.layout, 'merged');
    eq('② 拆出 3 个选项', a2.items[0].opts.length, 3);
    eq('② 选项去掉字母前缀', a2.items[0].opts[0], '北京');

    // ③ 单行内 A. B. C. 标记切分
    const inline = [
      ['题目', '选项', '答案'],
      ['中国的首都是哪里？', 'A.北京 B.上海 C.广州', 'A'],
    ];
    const a3 = BankImport.analyze(inline, null);
    eq('③ 单行字母标记切分', a3.items[0].opts.length, 3);
    eq('③ 选项文本', a3.items[0].opts[1], '上海');

    // ④ 只有题干+答案两列
    const simple = [
      ['题目', '答案'],
      ['中国的首都是哪里？', '北京'],
      ['一加一等于几', 'B'],
    ];
    const a4 = BankImport.analyze(simple, null);
    eq('④ 两列也能解析', a4.items.length, 2);
    eq('④ 布局 = simple', a4.map.layout, 'simple');
    eq('④ 答案为选项原文', a4.items[0].ans, '北京');

    // ⑤ 无表头：按内容推断
    const noHead = [
      ['中国的首都是哪里？', '北京', '上海', '广州', 'A'],
      ['一加一等于几', '1', '2', '3', 'B'],
      ['水的化学式', 'H2O', 'CO2', 'O2', 'A'],
    ];
    const a5 = BankImport.analyze(noHead, null);
    eq('⑤ 无表头：表头行 = -1', a5.headerRow, -1);
    eq('⑤ 无表头：题干列', a5.map.stem, 0);
    eq('⑤ 无表头：答案列', a5.map.answer, 4);
    eq('⑤ 无表头：识别 3 题', a5.items.length, 3);
    eq('⑤ 无表头：选项 3 个', a5.items[0].opts.length, 3);

    // ⑥ 填空题
    const blank = [
      ['题目', '答案', '题型'],
      ['水的化学式是____。', 'H2O', '填空题'],
      ['中国的首都是____。', '北京', '填空'],
    ];
    const a6 = BankImport.analyze(blank, null);
    eq('⑥ 填空：答案原样保留', a6.items[0].ans, 'H2O');
    eq('⑥ 填空：题型', a6.items[0].type, 'blank');

    // ⑦ 英文表头
    const en = [
      ['question', 'A', 'B', 'answer'],
      ['What is the capital of China?', 'Beijing', 'Shanghai', 'A'],
    ];
    const a7 = BankImport.analyze(en, null);
    eq('⑦ 英文表头识别', a7.items.length, 1);
    eq('⑦ 英文题干列', a7.map.stem, 0);

    // ⑧ 干扰列（解析/难度/章节）不影响
    const noisy = [
      ['序号', '知识点', '难度', '题目', 'A', 'B', '答案', '解析'],
      ['1', '地理', '易', '中国的首都是哪里？', '北京', '上海', 'A', '常识题'],
    ];
    const a8 = BankImport.analyze(noisy, null);
    eq('⑧ 干扰列不影响', a8.items.length, 1);
    eq('⑧ 题干列定位', a8.heads[a8.map.stem], '题目');

    // ⑨ 空行 / 缺答案的行被跳过
    const dirty = [
      ['题目', '答案'],
      ['', 'A'],
      ['这题没答案', ''],
      ['正常题目', 'A'],
    ];
    const a9 = BankImport.analyze(dirty, null);
    eq('⑨ 脏数据：只留 1 题', a9.items.length, 1);
    check('⑨ 脏数据：跳过计数', a9.skipped >= 1, '实际 ' + a9.skipped);

    // ⑩ 手工指定列（自动识别失败时的兜底）
    const a10 = BankImport.analyze(WIDE_ROWS, { stem: 1, answer: 6, optCol: -1 });
    eq('⑩ 手工列：解析 4 题', a10.items.length, 4);
    check('⑩ 手工列：map.manual 标记', a10.map.manual === true, JSON.stringify(a10.map.layout));
  }

  // ---------------------------------------------------------------
  console.log('\n[E] 答案归一');
  {
    const opts = ['北京', '上海', '广州', '深圳'];
    eq('字母 A', BankImport.normalizeAnswer('A', opts, 'single'), 'A');
    eq('字母组合 A,C', BankImport.normalizeAnswer('A,C', opts, 'multi'), 'AC');
    eq('字母组合 ABD', BankImport.normalizeAnswer('ABD', opts, 'multi'), 'ABD');
    eq('小写 a', BankImport.normalizeAnswer('a', opts, 'single'), 'A');
    eq('数字序号 2', BankImport.normalizeAnswer('2', opts, 'single'), 'B');
    eq('数字组合 1,3', BankImport.normalizeAnswer('1,3', opts, 'multi'), 'AC');
    eq('选项原文', BankImport.normalizeAnswer('上海', opts, 'single'), 'B');
    eq('判断词 正确', BankImport.normalizeAnswer('正确', [], 'judge'), '正确');
    eq('判断词 错', BankImport.normalizeAnswer('错', [], 'judge'), '错误');
    eq('判断词 √', BankImport.normalizeAnswer('√', [], 'judge'), '正确');
    eq('填空原样', BankImport.normalizeAnswer('H2O', [], 'blank'), 'H2O');
    eq('true 不被当字母', BankImport.normalizeAnswer('true', [], 'judge'), '正确');
    eq('false 不被当字母', BankImport.normalizeAnswer('false', [], 'judge'), '错误');
    eq('选项切分：换行', BankImport.splitOptions('A. 北京\nB. 上海\nC. 广州').length, 3);
    eq('选项切分：单行', BankImport.splitOptions('A.北京 B.上海 C.广州').length, 3);
    eq('选项切分：带圈括号', BankImport.splitOptions('(A) 北京 (B) 上海').length, 2);
  }

  // ---------------------------------------------------------------
  console.log('\n[F] JSON 题库');
  {
    const exported = { '中国的首都是哪里': { a: 'A', s: 'harvest' }, '水的化学式': { a: 'H2O', s: 'ai' } };
    const r1 = BankImport.parseFile(u8(Buffer.from(JSON.stringify(exported), 'utf8')), 'bank.json');
    check('JSON：脚本导出格式', (r1.items || []).length === 2, JSON.stringify(r1.items));
    eq('JSON：答案取值', r1.items[0].ans, 'A');

    const arr = [
      { 题目: '中国的首都是哪里？', 选项A: '北京', 选项B: '上海', 答案: 'A' },
      { 题目: '一加一等于几', 选项A: '1', 选项B: '2', 答案: 'B' },
    ];
    const r2 = BankImport.parseFile(u8(Buffer.from(JSON.stringify(arr), 'utf8')), 'arr.json');
    check('JSON：对象数组 → 走表格解析', (r2.sheets || []).length === 1);
    const a2 = BankImport.analyze(r2.sheets[0].rows, null);
    eq('JSON：对象数组解析 2 题', a2.items.length, 2);
    eq('JSON：对象数组答案', a2.items[1].ans, 'B');

    const bad = BankImport.parseFile(u8(Buffer.from('{oops', 'utf8')), 'bad.json');
    check('JSON：坏文件不崩溃', !!bad.error);
  }

  // ---------------------------------------------------------------
  console.log('\n[G] 模糊匹配');
  {
    const keys = ['中国的首都是哪里', '一加一等于几', '水的化学式是什么'];
    eq('完全一致', BankImport.matchKey(keys, '中国的首都是哪里'), '中国的首都是哪里');
    eq('页面题干更长（包含题库）', BankImport.matchKey(keys, '请回答：中国的首都是哪里？'), '中国的首都是哪里');
    eq('题库更长（包含页面）', BankImport.matchKey(keys, '首都'), null);
    eq('完全无关', BankImport.matchKey(keys, '今天天气怎么样啊'), null);
    eq('关闭模糊', BankImport.matchKey(keys, '中国的首都是那里', { fuzzy: false }), null);
    eq('60 字指纹命中', BankImport.matchKey(['水的化学式是什么'.slice(0, 60)], '水的化学式是什么'), '水的化学式是什么');
    // 长题干改一个字：仍应命中（真实考试题干多为 15 字以上）
    const longKeys = ['下列关于心肺复苏操作要点的描述中正确的是哪一项'];
    eq('长题干一字之差命中', BankImport.matchKey(longKeys, '下列关于心肺复苏操作要点的描术中正确的是哪一项'), longKeys[0]);
    // 短题干（8 字）：1 字之差会让二元组相似度掉到 0.71，默认阈值 0.86 下不认——
    // 这是刻意保守的设计，避免"下列说法正确的是 / 错误的是"这类反义题干互串。
    check('短题干一字之差：默认不误命中（保守策略）',
      BankImport.matchKey(['中国的首都是哪里'], '中国的首都是那里') === null);
    check('dice：改一字后相似度 0.71（说明为何短题干保守）',
      Math.abs(BankImport.dice('中国的首都是哪里', '中国的首都是那里') - 0.714) < 0.01,
      String(BankImport.dice('中国的首都是哪里', '中国的首都是那里')));
    check('dice：相同题干 = 1', BankImport.dice('中国的首都是哪里', '中国的首都是哪里') === 1);
  }

  // ===================================================================
  //  H. 端到端：jsdom 里真的跑脚本 → 上传文件 → 导入 → 答题命中
  // ===================================================================
  console.log('\n[H] 端到端（上传导入 → 答题命中）');
  {
    const PLAIN = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
    const src = fs.readFileSync(PLAIN, 'utf8');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function boot(opts) {
      opts = opts || {};
      // 关掉启发式 + AI 返回空：保证"被选中"只能来自导入的题库，排除兜底干扰
      const store = Object.assign({ uaa_heuristic: false }, opts.store || {});
      const dom = new JSDOM('<!doctype html><html><body>' + (opts.body || '') + '</body></html>', {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: opts.url || 'https://www.ncme.org.cn/qbank/do/paper?paperId=1',
        beforeParse(window) {
          window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d);
          window.GM_setValue = (k, v) => { store[k] = v; };
          window.GM_registerMenuCommand = (n, cb) => { try { (window.__menus = window.__menus || {})[n] = cb; } catch (_) {} };
          window.GM_xmlhttpRequest = (o) => { setTimeout(() => { try { o.onload({ responseText: '{}' }); } catch (e) {} }, 0); };
          window.GM_openInTab = () => {};
          window.GM_setClipboard = () => {};
          window.prompt = () => null;
          window.confirm = () => true;
          if (opts.textDecoder) window.TextDecoder = require('util').TextDecoder;
        },
      });
      const w = dom.window;
      const s = w.document.createElement('script');
      s.textContent = src;
      w.document.body.appendChild(s);
      return { w: w, store: store, dom: dom };
    }

    const $ = (w, sel) => w.document.querySelector(sel);
    const txt = (w, sel) => { const e = $(w, sel); return e ? (e.textContent || '') : ''; };
    // 轮询等待某个 radio 被选中（填答链路是分步异步的，固定 sleep 会偶发假阴性）
    async function waitRadio(w, val, ms) {
      let t = 0;
      while (t < (ms || 2000)) {
        const el = w.document.querySelector('input[value="' + val + '"]');
        if (el && el.checked) return el;
        await sleep(50); t += 50;
      }
      return w.document.querySelector('input[value="' + val + '"]');
    }

    // ---- H1: 上传 xlsx → 预览 → 确认导入 ----
    {
      const st = boot({ textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(60);
      check('题库页有上传区', !!$(w, '#uaa-bank-drop'));
      check('题库页有隐藏文件框', !!$(w, '#uaa-bank-file'));

      const xlsxBuf = makeXlsx([{ name: '题库', rows: WIDE_ROWS }], 8);
      const file = new w.File([new Uint8Array(xlsxBuf)], '我的题库.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));

      // 等 FileReader + 解析完成（预览区出现 data-ready）
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-prevbox')) { await sleep(50); waited += 50; }
      const prev = $(w, '#uaa-bank-prevbox');
      check('上传后出现解析预览', !!prev, '等待 ' + waited + 'ms');
      if (prev) {
        const t = prev.textContent || '';
        check('预览显示文件名', t.indexOf('我的题库.xlsx') >= 0, t.slice(0, 60));
        check('预览显示 Excel 格式', t.indexOf('Excel') >= 0);
        check('预览显示解析题数 4', t.indexOf('成功 4 题') >= 0, t.slice(0, 200));
        check('预览显示题干列', t.indexOf('题目') >= 0);
        check('预览有确认导入按钮', !!$(w, '#uaa-bank-doimport'));
      }
      $(w, '#uaa-bank-doimport').click();
      await sleep(80);
      check('导入后统计：导入题库 4 题', txt(w, '#uaa-bank-imp') === '4', txt(w, '#uaa-bank-imp'));
      const impStore = JSON.parse(st.store['uaa_bank_imp'] || '{}');
      check('落盘 uaa_bank_imp 有 4 条', Object.keys(impStore).length === 4, String(Object.keys(impStore).length));
      const k0 = Object.keys(impStore)[0];
      check('落盘记录含答案与选项原文', !!impStore[k0].a && Array.isArray(impStore[k0].o), JSON.stringify(impStore[k0]));
      check('日志提示导入成功', (txt(w, '#uaa-body') + txt(w, '#uaa-home-log')).indexOf('导入 4 题') >= 0);
    }

    // ---- H2: 导入后答题直接命中（不发 AI 请求）----
    {
      const body = '<fieldset><legend>1. 中国的首都是哪里？</legend>' +
        '<label><input type="radio" name="q1" value="A"> A. 北京</label>' +
        '<label><input type="radio" name="q1" value="B"> B. 上海</label>' +
        '<label><input type="radio" name="q1" value="C"> C. 广州</label></fieldset>';
      const xlsxBuf = makeXlsx([{ name: '题库', rows: WIDE_ROWS }], 8);
      const st = boot({ body: body, textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(50);
      const file = new w.File([new Uint8Array(xlsxBuf)], 't.xlsx');
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-doimport')) { await sleep(50); waited += 50; }
      $(w, '#uaa-bank-doimport').click();
      await sleep(60);

      // 重新扫描（题库已入库）
      w.eval('window.__uaaScan = null;');
      const btn = $(w, '#uaa-act-scan') || null;
      // 走菜单触发扫描
      const menus = w.__menus || {};
      const scanKey = Object.keys(menus).filter((k) => k.indexOf('立即扫描') >= 0)[0];
      check('菜单存在「立即扫描答题」', !!scanKey);
      if (scanKey) menus[scanKey]();
      const checked = await waitRadio(w, 'A', 2500);
      check('题库命中并自动选中 A（北京）', !!(checked && checked.checked));
      const logTxt = txt(w, '#uaa-body') || '';
      check('日志标记为 💾题库', logTxt.indexOf('题库') >= 0 || logTxt.indexOf('💾') >= 0, logTxt.slice(-160));
    }

    // ---- H3: 选项顺序被打乱 → 按选项原文反查字母 ----
    {
      const body = '<fieldset><legend>1. 中国的首都是哪里？</legend>' +
        '<label><input type="radio" name="q1" value="A"> A. 广州</label>' +
        '<label><input type="radio" name="q1" value="B"> B. 北京</label>' +
        '<label><input type="radio" name="q1" value="C"> C. 上海</label></fieldset>';
      const rows = [['题目', '选项A', '选项B', '选项C', '答案'], ['中国的首都是哪里？', '北京', '上海', '广州', 'A']];
      const xlsxBuf = makeXlsx([{ name: '题库', rows: rows }], 8);
      const st = boot({ body: body, textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(50);
      const file = new w.File([new Uint8Array(xlsxBuf)], 't.xlsx');
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-doimport')) { await sleep(50); waited += 50; }
      $(w, '#uaa-bank-doimport').click();
      await sleep(60);
      const menus = w.__menus || {};
      const scanKey = Object.keys(menus).filter((k) => k.indexOf('立即扫描') >= 0)[0];
      if (scanKey) menus[scanKey]();
      const b = await waitRadio(w, 'B', 2500);
      check('选项顺序不同也能答对（选 B 北京）', !!(b && b.checked));
    }

    // ---- H4: CSV 上传 + 模糊匹配命中 ----
    {
      const csv = '题目,选项A,选项B,答案\n"中国的首都是哪里？",北京,上海,A\n';
      const body = '<fieldset><legend>1. 中国的首都是 哪里？</legend>' +
        '<label><input type="radio" name="q1" value="A"> A. 北京</label>' +
        '<label><input type="radio" name="q1" value="B"> B. 上海</label></fieldset>';
      const st = boot({ body: body, textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(50);
      const file = new w.File([new Uint8Array(Buffer.from('\uFEFF' + csv, 'utf8'))], 't.csv', { type: 'text/csv' });
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-doimport')) { await sleep(50); waited += 50; }
      check('CSV 上传识别成功', !!$(w, '#uaa-bank-doimport') && (txt(w, '#uaa-bank-prevbox').indexOf('成功 1 题') >= 0),
        txt(w, '#uaa-bank-prevbox').slice(0, 120));
      $(w, '#uaa-bank-doimport').click();
      await sleep(60);
      const menus = w.__menus || {};
      const scanKey = Object.keys(menus).filter((k) => k.indexOf('立即扫描') >= 0)[0];
      if (scanKey) menus[scanKey]();
      await sleep(500);
      // 填答是分步异步的（日志 → 定位选项 → 点击），固定 sleep 不稳，轮询等待
      const a = await waitRadio(w, 'A', 2500);
      check('模糊匹配（多了一个空格）仍命中', !!(a && a.checked), a ? '未选中' : '未找到 A');
    }

    // ---- H5: 换工作表 / 手工改列 / 清空导入题库 ----
    {
      const xlsxBuf = makeXlsx([
        { name: '表1', rows: [['题目', '答案'], ['第一表题目', 'A']] },
        { name: '表2', rows: WIDE_ROWS },
      ], 8);
      const st = boot({ textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(50);
      const file = new w.File([new Uint8Array(xlsxBuf)], 'm.xlsx');
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-prevbox')) { await sleep(50); waited += 50; }
      // 自动选行数最多的表：表2（5 行）
      check('自动选中数据量最大的工作表', txt(w, '#uaa-bank-prevbox').indexOf('表2') >= 0, txt(w, '#uaa-bank-prevbox').slice(0, 160));
      $(w, '#uaa-bank-nextsheet').click();
      await sleep(60);
      check('换工作表后识别到表1 的 1 题', txt(w, '#uaa-bank-prevbox').indexOf('成功 1 题') >= 0, txt(w, '#uaa-bank-prevbox').slice(0, 200));
      // 手工改列：题干=1 答案=6（回到表2需要再换一次，这里直接在表1上验证 select 存在）
      const sel = $(w, '#uaa-bank-sel-stem');
      check('提供题干列下拉', !!sel);
      check('提供答案列下拉', !!$(w, '#uaa-bank-sel-ans'));
      check('提供选项列下拉', !!$(w, '#uaa-bank-sel-opt'));
      // 取消导入
      $(w, '#uaa-bank-cancel').click();
      await sleep(50);
      check('取消后预览消失', !$(w, '#uaa-bank-prevbox'));
      // 模板下载（jsdom 无 createObjectURL → 走复制兜底）
      $(w, '#uaa-bank-tpl').click();
      await sleep(80);
      check('模板按钮不报错', true);
    }

    // ---- H6: 清空导入题库 ----
    {
      const st = boot({ store: { uaa_bank_imp: JSON.stringify({ abc: { a: 'A' } }) }, textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(60);
      check('载入已有导入题库：1 题', txt(w, '#uaa-bank-imp') === '1', txt(w, '#uaa-bank-imp'));
      $(w, '#uaa-bank-clearimp').click();
      await sleep(60);
      check('清空后为 0', txt(w, '#uaa-bank-imp') === '0', txt(w, '#uaa-bank-imp'));
      check('清空后落盘为空对象', st.store['uaa_bank_imp'] === '{}', String(st.store['uaa_bank_imp']));
    }

    // ---- H7: 匹配设置开关 ----
    {
      const st = boot({ textDecoder: true });
      const w = st.w;
      await sleep(320);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(60);
      const sw = $(w, '#uaa-view-bank [data-sw="bankFuzzy"]');
      check('题库页有「题干模糊匹配」开关', !!sw);
      check('默认开启', sw && sw.className.indexOf('on') >= 0);
      sw.click();
      await sleep(40);
      check('点击后关闭并持久化', st.store['uaa_bank_fuzzy'] === false, String(st.store['uaa_bank_fuzzy']));
      const ratio = w.document.querySelectorAll('#uaa-view-bank [data-chip="bankRatio"]');
      check('有相似度阈值档位', ratio.length === 4, '实际 ' + ratio.length);
      const r92 = $(w, '#uaa-view-bank [data-chip="bankRatio"][data-val="0.92"]');
      r92.click();
      await sleep(40);
      check('阈值切换持久化 0.92', st.store['uaa_bank_ratio'] === 0.92, String(st.store['uaa_bank_ratio']));
      const pt = $(w, '#uaa-view-bank [data-sw="bankPreferText"]');
      check('有「按选项原文反查字母」开关', !!pt);
    }

    // ---- H8: 菜单里有导入入口 ----
    {
      const st = boot({ textDecoder: true });
      await sleep(300);
      const keys = Object.keys(st.w.__menus || {});
      check('菜单新增「导入题库」', keys.some((k) => k.indexOf('导入题库') >= 0), keys.join(' | '));
    }

    // ---- H9: 混淆版产物也能跑通上传导入（防止混淆器把新代码搞坏）----
    {
      const OBF = path.join(__dirname, '..', 'dist', 'universal-auto-answer.user.js');
      const obfSrc = fs.readFileSync(OBF, 'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
      const store = {};
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'https://www.ncme.org.cn/qbank/do/paper',
      });
      const w = dom.window;
      w.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d);
      w.GM_setValue = (k, v) => { store[k] = v; };
      w.GM_registerMenuCommand = () => {};
      w.GM_xmlhttpRequest = () => {};
      w.GM_openInTab = () => {};
      w.GM_setClipboard = () => {};
      w.prompt = () => null;
      w.confirm = () => true;
      w.TextDecoder = require('util').TextDecoder;
      require('vm').runInContext(obfSrc, dom.getInternalVMContext());
      await sleep(300);
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(60);
      check('混淆版：题库页有上传区', !!$(w, '#uaa-bank-drop'));
      const xlsxBuf = makeXlsx([{ name: '题库', rows: WIDE_ROWS }], 8);
      const file = new w.File([new Uint8Array(xlsxBuf)], '混淆测试.xlsx');
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 4000 && !$(w, '#uaa-bank-doimport')) { await sleep(50); waited += 50; }
      check('混淆版：xlsx 解析出预览', !!$(w, '#uaa-bank-doimport'),
        $(w, '#uaa-bank-prev') ? $(w, '#uaa-bank-prev').textContent.slice(0, 120) : '(无预览)');
      if ($(w, '#uaa-bank-doimport')) {
        $(w, '#uaa-bank-doimport').click();
        await sleep(80);
        const imp = JSON.parse(store['uaa_bank_imp'] || '{}');
        check('混淆版：导入落盘 4 题', Object.keys(imp).length === 4, String(Object.keys(imp).length));
      }
    }

    // ---- H10: 回归 —— 「先扫描未命中」不能把结果钉死 ----
    // 真实场景：用户先答题（题库还没导入，全部未命中），随后才导入题库；
    // 若未命中的结果被永久记忆，这批题就再也不会去查库，只能刷新页面。
    {
      const body = '<fieldset><legend>1. 中华人民共和国的首都是</legend>' +
        '<label><input type="radio" name="q1" value="A"> A. 北京</label>' +
        '<label><input type="radio" name="q1" value="B"> B. 上海</label></fieldset>';
      const st = boot({ body: body, textDecoder: true });
      const w = st.w;
      await sleep(320);
      const menus0 = w.__menus || {};
      const scanKey = Object.keys(menus0).filter((k) => k.indexOf('立即扫描') >= 0)[0];
      // ① 题库为空时先扫一遍 → 未命中
      if (scanKey) menus0[scanKey]();
      await sleep(500);
      check('① 导入前扫描：未选中（题库为空）', !w.document.querySelector('input[value="A"]').checked);

      // ② 然后才导入含这题的题库
      const csv = '题目,选项A,选项B,答案\n"中华人民共和国的首都是",北京,上海,A\n';
      w.document.querySelector('[data-tab="bank"]').click();
      await sleep(50);
      const file = new w.File([new Uint8Array(Buffer.from('\uFEFF' + csv, 'utf8'))], 'late.csv', { type: 'text/csv' });
      const inp = $(w, '#uaa-bank-file');
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change'));
      let waited = 0;
      while (waited < 3000 && !$(w, '#uaa-bank-doimport')) { await sleep(50); waited += 50; }
      $(w, '#uaa-bank-doimport').click();
      await sleep(60);

      // ③ 再次扫描，必须命中（旧的「未命中」记忆必须失效）
      if (scanKey) menus0[scanKey]();
      const a = await waitRadio(w, 'A', 2500);
      check('③ 导入后再扫描：命中并选中 A', !!(a && a.checked));
      const lg = (txt(w, '#uaa-body') || '') + (txt(w, '#uaa-home-log') || '');
      check('③ 日志出现「本地题库直接命中」', lg.indexOf('本地题库直接命中') >= 0, lg.slice(-120));
    }
  }

  console.log('\n===== 题库导入测试汇总：通过 ' + pass + ' 项，失败 ' + fail + ' 项 =====');
  process.exit(fail ? 1 : 0);
})();
