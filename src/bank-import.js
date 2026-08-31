// ==================================================================
//  题库导入引擎（零依赖 · 纯前端）
//  --------------------------------------------------------------
//  为什么要自己写：油猴脚本不能 require 第三方库，@require SheetJS 会
//  受 CSP / 离线 / 版本变动影响。这里内置：
//    · ZIP 解压（store + deflate）→ 自研 inflate（raw DEFLATE）
//    · XLSX：workbook.xml + sharedStrings.xml + worksheets/*.xml
//    · CSV / TSV / TXT：自动识别分隔符与编码（UTF-8 / GBK / UTF-8 BOM）
//    · JSON：脚本导出格式 {"指纹":{"a":"A"}}、对象数组、二维数组
//    · 自动匹配表格：表头关键词识别；无表头时按「内容统计」推断列角色
//  --------------------------------------------------------------
//  注意：本文件内禁止出现 '\n' '\r' '\t' 字面量（混淆器 stringArray 会把
//  它们展开成真实换行，破坏字符串常量）——一律用 NL / CR / TAB 常量。
// ==================================================================
var BankImport = (function () {
  'use strict';

  var NL = String.fromCharCode(10);
  var CR = String.fromCharCode(13);
  var TAB = String.fromCharCode(9);
  var BOM = String.fromCharCode(65279);

  // ============================================================
  //  0. 基础工具
  // ============================================================
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function up(s) { return String(s == null ? '' : s).toUpperCase(); }

  function cleanCell(v) {
    var s = String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
    if (s === '-' || s === '—' || s === '无' || s === 'null' || s === 'undefined') return '';
    return s;
  }
  // 单元格内换行统一（Excel 合并选项列常用 Alt+Enter）
  function flat(s) { return String(s == null ? '' : s).replace(/\r\n/g, NL).replace(/\r/g, NL); }

  // 与 engine.normalize 保持一致的题干指纹（延迟取用，保证与落盘 key 完全相同）
  function norm(s) {
    try {
      if (typeof engine !== 'undefined' && engine && engine.normalize) return engine.normalize(s);
    } catch (e) {}
    return String(s == null ? '' : s)
      .replace(/[\s\u3000]/g, '')
      .replace(/[\?\uff1f\u3002.\uff01!\uff0c,\uff1b;\uff1a:\u3001()\uff08\uff09\[\]\u3010\u3011"'“”‘’\u300a\u300b<>\u007e`]/g, '')
      .toLowerCase()
      .trim();
  }

  // ---------- 编码 ----------
  function utf8Decode(b, s, e) {
    s = s || 0;
    if (e == null) e = b.length;
    var out = '', i = s;
    while (i < e) {
      var c = b[i++];
      if (c < 0x80) { out += String.fromCharCode(c); continue; }
      var b1 = b[i++] || 0;
      if (c >= 0xc0 && c < 0xe0) { out += String.fromCharCode(((c & 0x1f) << 6) | (b1 & 0x3f)); continue; }
      var b2 = b[i++] || 0;
      if (c >= 0xe0 && c < 0xf0) { out += String.fromCharCode(((c & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f)); continue; }
      var b3 = b[i++] || 0;
      var cp = ((c & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
    return out;
  }

  // 严格 UTF-8 校验（用于判断是否为 GBK：中文 GBK 字节序列基本都是非法 UTF-8）
  function isUtf8(b) {
    var i = 0, n = b.length;
    while (i < n) {
      var c = b[i];
      if (c < 0x80) { i++; continue; }
      var need = 0, cp = 0;
      if (c >= 0xc2 && c <= 0xdf) { need = 1; cp = c & 0x1f; }
      else if (c >= 0xe0 && c <= 0xef) { need = 2; cp = c & 0x0f; }
      else if (c >= 0xf0 && c <= 0xf4) { need = 3; cp = c & 0x07; }
      else return false;
      if (i + need >= n) return false;
      for (var k = 1; k <= need; k++) {
        var cc = b[i + k];
        if ((cc & 0xc0) !== 0x80) return false;
        cp = (cp << 6) | (cc & 0x3f);
      }
      if (need === 1 && cp < 0x80) return false;
      if (need === 2 && cp < 0x800) return false;
      if (need === 3 && cp < 0x10000) return false;
      i += need + 1;
    }
    return true;
  }

  // 字节 → 文本：UTF-8 优先，非法则回退 GBK（Excel 另存 CSV 默认 GBK）
  function decodeBytes(b) {
    var enc = 'utf-8';
    if (!isUtf8(b)) {
      if (typeof TextDecoder !== 'undefined') {
        try { return { text: new TextDecoder('gbk').decode(b), enc: 'gbk' }; } catch (e) {}
        try { return { text: new TextDecoder('gb18030').decode(b), enc: 'gb18030' }; } catch (e2) {}
      }
    }
    var t = utf8Decode(b, 0, b.length);
    if (t.charAt(0) === BOM) t = t.slice(1);
    return { text: t, enc: enc };
  }

  // ============================================================
  //  1. inflate（raw DEFLATE，ZIP 用的是无 zlib 头的裸流）
  // ============================================================
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildTree(lens) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var i;
    for (i = 0; i < lens.length; i++) counts[lens[i]]++;
    counts[0] = 0;
    var offs = [0];
    var sum = 0;
    for (i = 1; i <= 15; i++) { offs[i] = sum; sum += counts[i]; }
    var syms = new Array(lens.length);
    for (i = 0; i < lens.length; i++) if (lens[i]) syms[offs[lens[i]]++] = i;
    return { c: counts, s: syms };
  }

  var FIXED_LIT = null, FIXED_DIST = null;
  function fixedLit() {
    if (FIXED_LIT) return FIXED_LIT;
    var l = new Array(288), i;
    for (i = 0; i < 144; i++) l[i] = 8;
    for (; i < 256; i++) l[i] = 9;
    for (; i < 280; i++) l[i] = 7;
    for (; i < 288; i++) l[i] = 8;
    FIXED_LIT = buildTree(l);
    return FIXED_LIT;
  }
  function fixedDist() {
    if (FIXED_DIST) return FIXED_DIST;
    var d = new Array(30), i;
    for (i = 0; i < 30; i++) d[i] = 5;
    FIXED_DIST = buildTree(d);
    return FIXED_DIST;
  }

  function inflateRaw(src, expect) {
    var pos = 0, bitBuf = 0, bitCnt = 0;
    var out = new Uint8Array(Math.max(256, (expect || 0) + 64));
    var olen = 0;
    var slen = src.length;

    function bits(n) {
      while (bitCnt < n) {
        if (pos >= slen) throw new Error('eof');
        bitBuf |= src[pos++] << bitCnt;
        bitCnt += 8;
      }
      var v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCnt -= n;
      return v;
    }
    function put(b) {
      if (olen >= out.length) {
        var n = new Uint8Array(out.length * 2);
        n.set(out);
        out = n;
      }
      out[olen++] = b;
    }
    function decodeSym(tr) {
      var code = 0, first = 0, index = 0, len;
      for (len = 1; len <= 15; len++) {
        code |= bits(1);
        var cnt = tr.c[len];
        if (code - first < cnt) return tr.s[index + (code - first)];
        index += cnt;
        first = (first + cnt) << 1;
        code <<= 1;
      }
      return -1;
    }

    try {
      var last = 0;
      do {
        last = bits(1);
        var type = bits(2);
        if (type === 0) {
          // 存储块：先回到字节边界
          pos -= (bitCnt >> 3);
          bitBuf = 0; bitCnt = 0;
          if (pos + 4 > slen) throw new Error('eof');
          var len = src[pos] | (src[pos + 1] << 8);
          pos += 4;
          if (pos + len > slen) throw new Error('eof');
          for (var i = 0; i < len; i++) put(src[pos++]);
        } else if (type === 1 || type === 2) {
          var lt, dt;
          if (type === 1) { lt = fixedLit(); dt = fixedDist(); }
          else {
            var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
            var cl = new Array(19), j;
            for (j = 0; j < 19; j++) cl[j] = 0;
            for (j = 0; j < hclen; j++) cl[CLORDER[j]] = bits(3);
            var clt = buildTree(cl);
            var lens = [];
            while (lens.length < hlit + hdist) {
              var sym = decodeSym(clt);
              if (sym < 0) throw new Error('bad');
              if (sym < 16) lens.push(sym);
              else if (sym === 16) {
                var prev = lens.length ? lens[lens.length - 1] : 0;
                var r1 = 3 + bits(2);
                while (r1-- > 0) lens.push(prev);
              } else if (sym === 17) { var r2 = 3 + bits(3); while (r2-- > 0) lens.push(0); }
              else { var r3 = 11 + bits(7); while (r3-- > 0) lens.push(0); }
            }
            lt = buildTree(lens.slice(0, hlit));
            dt = buildTree(lens.slice(hlit));
          }
          for (;;) {
            var s = decodeSym(lt);
            if (s < 0) throw new Error('bad');
            if (s === 256) break;
            if (s < 256) { put(s); continue; }
            s -= 257;
            if (s >= 29) throw new Error('bad');
            var L = LEN_BASE[s] + bits(LEN_EXTRA[s]);
            var ds = decodeSym(dt);
            if (ds < 0) throw new Error('bad');
            var D = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
            var from = olen - D;
            if (from < 0) throw new Error('bad');
            for (var k = 0; k < L; k++) put(out[from + k]);
          }
        } else throw new Error('bad');
      } while (!last);
    } catch (e) {
      return null;
    }
    return out.subarray ? out.subarray(0, olen) : out.slice(0, olen);
  }

  // ============================================================
  //  2. ZIP 读取（只要 central directory，够用且稳）
  // ============================================================
  function unzip(bytes) {
    var res = {};
    var n = bytes.length;
    if (n < 22) return null;
    var eocd = -1;
    var min = Math.max(0, n - 66000);
    for (var i = n - 22; i >= min; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff <= 0 || cdOff >= n) return null;
    var p = cdOff;
    for (var c = 0; c < count; c++) {
      if (p + 46 > n) break;
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var usize = dv.getUint32(p + 24, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var cmtLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = utf8Decode(bytes, p + 46, p + 46 + nameLen);
      if (lho + 30 <= n && dv.getUint32(lho, true) === 0x04034b50) {
        var lnl = dv.getUint16(lho + 26, true);
        var lel = dv.getUint16(lho + 28, true);
        var ds = lho + 30 + lnl + lel;
        var raw = bytes.subarray(ds, Math.min(n, ds + csize));
        var data = null;
        if (method === 0) data = raw;
        else if (method === 8) data = inflateRaw(raw, usize);
        if (data) res[name] = data;
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return res;
  }

  // ============================================================
  //  3. XLSX
  // ============================================================
  function xmlDoc(bytes) {
    try {
      var D = (typeof DOMParser !== 'undefined') ? new DOMParser() : null;
      if (!D) return null;
      var txt = utf8Decode(bytes, 0, bytes.length);
      return D.parseFromString(txt, 'application/xml');
    } catch (e) { return null; }
  }
  function childByLocal(el, name) {
    if (!el) return null;
    var kids = el.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k && k.nodeType === 1) {
        var nn = String(k.nodeName || '');
        if (nn === name || nn.length > name.length && nn.slice(nn.length - name.length - 1) === ':' + name) return k;
      }
    }
    return null;
  }
  function kidsByLocal(el, name) {
    var out = [];
    if (!el) return out;
    var kids = el.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k && k.nodeType === 1) {
        var nn = String(k.nodeName || '');
        if (nn === name || nn.length > name.length && nn.slice(nn.length - name.length - 1) === ':' + name) out.push(k);
      }
    }
    return out;
  }
  function allText(el) {
    var s = '', kids = el.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (!k) continue;
      if (k.nodeType === 3 || k.nodeType === 4) s += String(k.nodeValue || '');
      else if (k.nodeType === 1) s += allText(k);
    }
    return s;
  }
  function attrOf(el, name) {
    if (!el || !el.getAttribute) return '';
    var v = el.getAttribute(name);
    if (v != null && v !== '') return v;
    var as = el.attributes || [];
    for (var i = 0; i < as.length; i++) {
      var qn = String(as[i].name || '');
      if (qn === name || (qn.length > name.length && qn.slice(qn.length - name.length - 1) === ':' + name)) return String(as[i].value || '');
    }
    return '';
  }
  // "AB12" → 27（0 基列号）
  function colIdxOf(ref) {
    var m = String(ref || '').match(/^([A-Za-z]+)/);
    if (!m) return -1;
    var s = up(m[1]), v = 0;
    for (var i = 0; i < s.length; i++) v = v * 26 + (s.charCodeAt(i) - 64);
    return v - 1;
  }

  function parseShared(doc) {
    var out = [];
    if (!doc) return out;
    var sis = doc.getElementsByTagName ? doc.getElementsByTagName('si') : [];
    for (var i = 0; i < sis.length; i++) {
      var si = sis[i];
      // 富文本：跳过 <rPh> 注音，其余 <t> 全部拼接
      var ts = si.getElementsByTagName ? si.getElementsByTagName('t') : [];
      var s = '';
      for (var j = 0; j < ts.length; j++) {
        var t = ts[j];
        var p = t.parentNode ? String(t.parentNode.nodeName || '') : '';
        if (p.indexOf('rPh') >= 0) continue;
        s += allText(t);
      }
      if (!s) s = allText(si);
      out.push(s);
    }
    return out;
  }

  function sheetRows(doc, shared) {
    var rows = [];
    if (!doc) return rows;
    var res = doc.getElementsByTagName ? doc.getElementsByTagName('row') : [];
    for (var i = 0; i < res.length; i++) {
      var re = res[i];
      var cells = re.getElementsByTagName ? re.getElementsByTagName('c') : [];
      var arr = [];
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var ci = colIdxOf(attrOf(c, 'r'));
        if (ci < 0) ci = j;
        var t = attrOf(c, 't');
        var v = '';
        if (t === 'inlineStr') {
          var isEl = childByLocal(c, 'is');
          v = isEl ? allText(isEl) : allText(c);
        } else {
          var vEl = childByLocal(c, 'v');
          var raw = vEl ? allText(vEl) : allText(c);
          if (t === 's') {
            var idx = parseInt(raw, 10);
            v = (shared && shared[idx] != null) ? shared[idx] : '';
          } else if (t === 'b') v = (raw === '1') ? 'TRUE' : 'FALSE';
          else if (t === 'e') v = '';
          else v = raw;
        }
        arr[ci] = flat(v).trim();
      }
      rows.push(arr);
    }
    return rows;
  }

  function parseXlsx(bytes) {
    var z = unzip(bytes);
    if (!z) return { sheets: [], error: '不是有效的 xlsx 文件（ZIP 结构读取失败）' };
    var keys = [];
    for (var k in z) if (Object.prototype.hasOwnProperty.call(z, k)) keys.push(k);
    var wbKey = '';
    for (var i = 0; i < keys.length; i++) if (/workbook\.xml$/i.test(keys[i]) && keys[i].indexOf('_rels') < 0) { wbKey = keys[i]; break; }
    var wb = wbKey ? xmlDoc(z[wbKey]) : null;
    // 关系映射：rId → 工作表路径
    var relMap = {};
    var relKey = '';
    for (i = 0; i < keys.length; i++) if (/workbook\.xml\.rels$/i.test(keys[i])) { relKey = keys[i]; break; }
    if (relKey) {
      var rd = xmlDoc(z[relKey]);
      var rels = rd && rd.getElementsByTagName ? rd.getElementsByTagName('Relationship') : [];
      for (i = 0; i < rels.length; i++) {
        var id = attrOf(rels[i], 'Id');
        var tg = attrOf(rels[i], 'Target');
        if (!id || !tg) continue;
        if (tg.charAt(0) === '/') tg = tg.slice(1);
        else tg = 'xl/' + tg.replace(/^\.\//, '');
        relMap[id] = tg;
      }
    }
    function sharedOf() {
      var sKey = '';
      for (var m = 0; m < keys.length; m++) if (/sharedStrings\.xml$/i.test(keys[m])) { sKey = keys[m]; break; }
      return sKey ? parseShared(xmlDoc(z[sKey])) : [];
    }
    var shared = sharedOf();
    var sheets = [];
    var shes = wb && wb.getElementsByTagName ? wb.getElementsByTagName('sheet') : [];
    if (shes.length) {
      for (i = 0; i < shes.length; i++) {
        var nm = attrOf(shes[i], 'name') || ('Sheet' + (i + 1));
        var rid = attrOf(shes[i], 'id');
        var path = relMap[rid] || ('xl/worksheets/sheet' + (i + 1) + '.xml');
        if (!z[path]) {
          // 关系没对上：按序号兜底
          for (var j = 0; j < keys.length; j++) {
            if (keys[j].indexOf('worksheets/sheet' + (i + 1) + '.xml') >= 0) { path = keys[j]; break; }
          }
        }
        if (z[path]) sheets.push({ name: nm, rows: sheetRows(xmlDoc(z[path]), shared) });
      }
    }
    if (!sheets.length) {
      // workbook 解析失败：退化为按序号扫描 worksheets
      var sk = [];
      for (i = 0; i < keys.length; i++) if (/^xl\/worksheets\/[^\/]+\.xml$/i.test(keys[i])) sk.push(keys[i]);
      sk.sort();
      for (i = 0; i < sk.length; i++) sheets.push({ name: 'Sheet' + (i + 1), rows: sheetRows(xmlDoc(z[sk[i]]), shared) });
    }
    if (!sheets.length) return { sheets: [], error: 'xlsx 里没有找到工作表' };
    return { sheets: sheets, error: '' };
  }

  // ============================================================
  //  4. 文本表格（CSV / TSV / 自定义分隔符）
  // ============================================================
  function parseDelim(text, d) {
    var rows = [], row = [], cur = '', i = 0, inQ = false;
    var len = text.length;
    while (i < len) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"' && cur === '') { inQ = true; i++; continue; }
      if (ch === d) { row.push(cur); cur = ''; i++; continue; }
      if (ch === CR || ch === NL) {
        row.push(cur); cur = '';
        rows.push(row); row = [];
        i += (ch === CR && text.charAt(i + 1) === NL) ? 2 : 1;
        continue;
      }
      cur += ch; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    // 去掉尾部空行
    while (rows.length && rows[rows.length - 1].join('').replace(/[\s\u3000]/g, '') === '') rows.pop();
    return rows;
  }

  // 自动识别分隔符：取前 8 行，选"每行出现次数最稳定且非 0"的那个
  function detectDelim(text) {
    var lines = text.split(NL).slice(0, 12);
    var cands = [',', TAB, ';', '|', '\uFF0C'];
    var best = ',', bestScore = -1;
    for (var i = 0; i < cands.length; i++) {
      var d = cands[i];
      if (!d) continue;
      var counts = [], tot = 0;
      for (var j = 0; j < lines.length; j++) {
        var L = lines[j];
        if (!L.replace(/[\s\u3000]/g, '')) continue;
        var c = 0, inQ = false;
        for (var k = 0; k < L.length; k++) {
          var ch = L.charAt(k);
          if (ch === '"') { if (inQ && L.charAt(k + 1) === '"') { k++; continue; } inQ = !inQ; continue; }
          if (!inQ && ch === d) c++;
        }
        counts.push(c); tot += c;
      }
      if (!counts.length || tot === 0) continue;
      var first = counts[0];
      var stable = 0;
      for (var m = 0; m < counts.length; m++) if (counts[m] === first) stable++;
      var score = stable * 10 + Math.min(first, 12) + (d === TAB ? 5 : 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function parseTextTable(bytes) {
    var dec = decodeBytes(bytes);
    var text = dec.text;
    var d = detectDelim(text);
    var rows = parseDelim(text, d);
    return { sheets: [{ name: 'Sheet1', rows: rows }], enc: dec.enc, delim: d, error: '' };
  }

  // ============================================================
  //  5. JSON
  // ============================================================
  function parseJson(bytes) {
    var dec = decodeBytes(bytes);
    var data = null;
    try { data = JSON.parse(dec.text); } catch (e) { return { kind: 'json', error: 'JSON 解析失败：' + e.message, items: [] }; }
    var items = [], rows = null;
    if (data && !isArr(data) && typeof data === 'object') {
      // 脚本导出格式：{ "指纹": {a:"A", s:"..."} } 或 { "题干": "A" }
      for (var k in data) {
        if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
        var v = data[k];
        var ans = (v && typeof v === 'object') ? v.a : v;
        if (ans == null || ans === '') continue;
        items.push({ stem: k, ans: String(ans), opts: (v && v.o) || [], type: (v && v.q) || '' });
      }
      if (items.length) return { kind: 'json', items: items, enc: dec.enc, error: '' };
    }
    if (isArr(data) && data.length) {
      if (isArr(data[0])) { rows = data; }
      else if (data[0] && typeof data[0] === 'object') {
        var head = [];
        for (var kk in data[0]) if (Object.prototype.hasOwnProperty.call(data[0], kk)) head.push(kk);
        rows = [head];
        for (var i = 0; i < data.length; i++) {
          var r = [];
          for (var j = 0; j < head.length; j++) r.push(data[i] ? data[i][head[j]] : '');
          rows.push(r);
        }
      }
    }
    if (rows) return { kind: 'json', sheets: [{ name: 'Sheet1', rows: rows }], enc: dec.enc, error: '' };
    return { kind: 'json', error: 'JSON 结构不支持（需要 对象 / 数组）', items: [] };
  }

  // ============================================================
  //  6. 表格 → 题目：自动匹配列
  // ============================================================
  var K_STEM = ['题目', '题干', '问题', '试题', '题目内容', '题干内容', '问题内容', '问题名称', 'question', 'questions', 'title', 'stem', 'content', 'ques', 'qtext', '题目名称'];
  var K_ANS = ['答案', '正确答案', '参考答案', '标准答案', '正确选项', '答案选项', '答案内容', 'answer', 'answers', 'key', 'result', 'ans', 'daan', 'rightanswer', 'correct'];
  var K_TYPE = ['题型', '类型', '题目类型', 'type', 'qtype', 'questiontype', 'qtypeid'];
  var K_OPT = ['选项', '选项内容', '备选答案', '备选', '候选答案', 'options', 'option', 'choices', 'choice'];
  var K_PARSE = ['解析', '解释', '详解', '答案解析', '分析', 'explain', 'analysis', 'remark', 'note'];
  var K_ID = ['序号', '编号', '题号', 'id', 'no', 'num', 'number', 'index'];

  function keyOf(cell) {
    return String(cell == null ? '' : cell)
      .replace(/[\s\u3000:：（）()\[\]\u3010\u3011.。、,，*#\-_]/g, '')
      .toLowerCase();
  }
  function roleOf(cell) {
    var k = keyOf(cell);
    if (!k) return '';
    if (K_ANS.indexOf(k) >= 0) return 'answer';
    if (K_STEM.indexOf(k) >= 0) return 'stem';
    if (K_TYPE.indexOf(k) >= 0) return 'type';
    if (K_OPT.indexOf(k) >= 0) return 'option';
    if (K_PARSE.indexOf(k) >= 0) return 'parse';
    if (K_ID.indexOf(k) >= 0) return 'id';
    // A / B / 选项A / (A) / A选项
    if (/^[a-h]$/.test(k)) return 'opt';
    if (/^(选项|option|opt|choice|项)?[a-h](选项|项)?$/.test(k)) return 'opt';
    return '';
  }

  // 找表头行：前 6 行打分，要求"短文本 + 有答案列或 ≥2 个选项列"
  function detectHeaderRow(rows) {
    var best = -1, bestScore = 0;
    var maxR = Math.min(rows.length, 6);
    for (var r = 0; r < maxR; r++) {
      var row = rows[r] || [];
      var score = 0, opt = 0, hasAns = false, lenSum = 0, filled = 0;
      for (var c = 0; c < row.length; c++) {
        var v = cleanCell(row[c]);
        if (!v) continue;
        filled++;
        lenSum += v.length;
        var role = roleOf(v);
        if (role === 'answer') { score += 5; hasAns = true; }
        else if (role === 'stem') score += 5;
        else if (role === 'type') score += 3;
        else if (role === 'opt') { score += 2; opt++; }
        else if (role === 'option') score += 2;
        else if (role === 'parse' || role === 'id') score += 1;
      }
      if (!filled) continue;
      var avg = lenSum / filled;
      if (avg > 14) continue;                       // 表头不该是长句
      if (!(hasAns || opt >= 2)) continue;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore >= 8 ? best : -1;
  }

  function mapFromHeader(row) {
    var map = { stem: -1, answer: -1, type: -1, optCol: -1, optCols: [], headerRow: 0, layout: 'wide', heads: [] };
    for (var c = 0; c < row.length; c++) {
      var v = cleanCell(row[c]);
      map.heads.push(v);
      var role = roleOf(v);
      if (role === 'answer' && map.answer < 0) map.answer = c;
      else if (role === 'stem' && map.stem < 0) map.stem = c;
      else if (role === 'type' && map.type < 0) map.type = c;
      else if (role === 'opt') map.optCols.push(c);
      else if (role === 'option' && map.optCol < 0) map.optCol = c;
    }
    if (map.stem < 0 && map.optCols.length) map.stem = 0;
    if (!map.optCols.length && map.optCol < 0) {
      // 没有明确选项列：把题干与答案之间的列当作选项
      var a = Math.min(map.stem, map.answer), b = Math.max(map.stem, map.answer);
      for (var i = a + 1; i < b; i++) if (i !== map.type) map.optCols.push(i);
    }
    map.layout = map.optCols.length ? 'wide' : (map.optCol >= 0 ? 'merged' : 'simple');
    return map;
  }

  var RE_ANSLIKE = /^[A-Ha-h]{1,8}$|^[1-9]$|^(正确|错误|对|错|\u221a|\u00d7|是|否)$|^(true|false|t|f|yes|no|y|n)$/i;
  function isAnsLike(v) { return v.length <= 8 && RE_ANSLIKE.test(v.replace(/[\s,，、;；]/g, '')); }

  function colStat(rows, ci) {
    var n = 0, sum = 0, ans = 0, mx = 0;
    for (var r = 0; r < rows.length && n < 60; r++) {
      var v = cleanCell(rows[r] && rows[r][ci]);
      if (!v) continue;
      n++; sum += v.length;
      if (v.length > mx) mx = v.length;
      if (isAnsLike(v)) ans++;
    }
    return { n: n, avg: n ? sum / n : 0, ans: n ? ans / n : 0, max: mx };
  }

  // 无表头：按内容统计推断（最长的列=题干，短且规律的列=答案，两者之间=选项）
  function inferMap(rows) {
    var ncol = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].length > ncol) ncol = rows[i].length;
    var st = [];
    for (var c = 0; c < ncol; c++) st.push(colStat(rows, c));
    var ansC = -1, bestA = 0;
    for (c = 0; c < ncol; c++) {
      if (st[c].n < 1) continue;
      if (st[c].ans >= 0.6 && st[c].avg <= 8 && st[c].ans >= bestA) { bestA = st[c].ans; ansC = c; }
    }
    var stemC = -1, bestL = 0;
    for (c = 0; c < ncol; c++) {
      if (c === ansC || st[c].n < 1) continue;
      if (st[c].avg > bestL) { bestL = st[c].avg; stemC = c; }
    }
    var map = { stem: stemC, answer: ansC, type: -1, optCol: -1, optCols: [], headerRow: -1, layout: 'simple', heads: [] };
    if (stemC < 0 || ansC < 0) return map;
    var a = Math.min(stemC, ansC), b = Math.max(stemC, ansC);
    for (c = a + 1; c < b; c++) if (st[c].n >= 1 && st[c].avg <= 80) map.optCols.push(c);
    if (!map.optCols.length) {
      for (c = 0; c < ncol; c++) {
        if (c === stemC || c === ansC || st[c].n < 1) continue;
        if (st[c].max > 12) { map.optCol = c; break; }
      }
    }
    map.layout = map.optCols.length ? 'wide' : (map.optCol >= 0 ? 'merged' : 'simple');
    return map;
  }

  // ---------- 选项切分 ----------
  // 选项标记：A. / A、 / A: / （A） / (A) 后跟内容（括号内无标点也算，如 "(A) 北京"）
  var RE_OPTMARK = /(?:[\uff08(]?([A-Ha-h])[\uff09)]?\s*[\.\u3001\uff0e:\uff1a]\s*)|(?:[\uff08(]\s*([A-Ha-h])\s*[\uff09)]\s*)/g;
  function cleanOpt(s) {
    return String(s == null ? '' : s)
      .replace(/^[\s\uff08(]*[A-Ha-h][\uff09)]?\s*[\.\u3001\uff0e:\uff1a]\s*/, '')
      .replace(/^[\s\uff08(]*[A-Ha-h][\uff09)]\s*/, '')
      .replace(/[\s\u3000]+$/, '');
  }
  function splitOptions(text) {
    var t = flat(text);
    if (!t.trim()) return [];
    var lines = t.split(NL);
    var i;
    if (lines.length > 1) {
      var marked = 0, got = [];
      for (i = 0; i < lines.length; i++) {
        var L = cleanOpt(lines[i]);
        if (!L) continue;
        if (/^[\s\uff08(]?[A-Ha-h][\uff09)]?[\.\u3001\uff0e:\uff1a]/.test(lines[i].trim())) marked++;
        got.push(L);
      }
      if (got.length >= 2) return got;
    }
    // 单行：按 A. B. C. 标记切
    var marks = [], m;
    RE_OPTMARK.lastIndex = 0;
    while ((m = RE_OPTMARK.exec(t))) {
      if (!(m[1] || m[2])) continue;
      var at = m.index;
      if (at !== 0 && !/[\s;；|,\uff0c]/.test(t.charAt(at - 1))) continue;
      marks.push({ s: at, e: at + m[0].length });
    }
    if (marks.length < 2) return [];
    var out = [];
    for (i = 0; i < marks.length; i++) {
      var from = marks[i].e;
      var to = (i + 1 < marks.length) ? marks[i + 1].s : t.length;
      var seg = t.slice(from, to).replace(/[\s;；|,\uff0c]+$/, '').trim();
      if (seg) out.push(cleanOpt(seg));
    }
    return out.length >= 2 ? out : [];
  }

  function collectOptions(row, map) {
    var i, out = [];
    if (map.optCols && map.optCols.length) {
      for (i = 0; i < map.optCols.length; i++) {
        var v = cleanCell(row[map.optCols[i]]);
        if (v) out.push(cleanOpt(v));
      }
      if (out.length >= 2) return out;
    }
    if (map.optCol >= 0) {
      var mg = splitOptions(row[map.optCol]);
      if (mg.length >= 2) return mg;
    }
    return out;
  }

  // ---------- 答案归一 ----------
  function judgeWord(a) {
    var s = String(a || '').replace(/[\s,，、;；]/g, '').toLowerCase();
    if (!s) return '';
    if (/^(正确|\u5bf9|\u221a|\u662f|true|t|yes|y|1)$/.test(s)) return '正确';
    if (/^(错误|\u9519|\u00d7|\u5426|false|f|no|n|0)$/.test(s)) return '错误';
    if (s.length === 1 && s.charCodeAt(0) >= 0x4e00) {
      if (s === '对') return '正确';
      if (s === '错') return '错误';
    }
    return '';
  }
  function typeWord(v) {
    var s = String(v || '').replace(/[\s\uff1a:]/g, '');
    if (/多选|多项|multiple/i.test(s)) return 'multi';
    if (/单选|单项|single/i.test(s)) return 'single';
    if (/判断|是非|对错|judge|truefalse/i.test(s)) return 'judge';
    if (/填空|完形|blank|fill/i.test(s)) return 'blank';
    if (/简答|问答|论述|名词解释/i.test(s)) return 'blank';
    return '';
  }
  function optTextHit(optText, ansText) {
    var A = String(optText || '').replace(/\s/g, '').toLowerCase();
    var B = String(ansText || '').replace(/\s/g, '').toLowerCase();
    if (!A || !B) return false;
    if (A === B) return true;
    return A.indexOf(B) >= 0 || B.indexOf(A) >= 0;
  }
  function normalizeAnswer(raw, opts, type) {
    var a = String(raw == null ? '' : raw).trim();
    if (!a) return '';
    if (type === 'blank') return a.replace(/^答案[\uff1a:]?\s*/, '');
    var stripped = a.replace(/[\s,，、;；.。:：\uff08\uff09()]/g, '');
    // ① 纯字母（A / A,C / ABD）—— 'false' 之流不会被误判，因为含非 A-H 字母
    if (stripped && /^[A-Ha-h]+$/i.test(stripped)) {
      var letters = up(stripped).split('');
      var valid = letters.filter(function (L) { return (L.charCodeAt(0) - 65) < opts.length; });
      return (valid.length ? valid : letters).join('');
    }
    // ② 数字序号（1 / 1,3）—— 仅在有选项时按索引换算
    if (opts && opts.length && /^\d+(\s*[,，、]\s*\d+)*$/.test(a)) {
      var nums = a.match(/\d+/g) || [];
      var ls = [];
      for (var i = 0; i < nums.length; i++) {
        var idx = parseInt(nums[i], 10) - 1;
        if (idx >= 0 && idx < opts.length) ls.push(String.fromCharCode(65 + idx));
      }
      if (ls.length) return ls.join('');
    }
    // ③ 判断词
    var jw = judgeWord(a);
    if (jw) return jw;
    // ④ 选项原文（很多题库直接写"北京"）
    if (opts && opts.length) {
      var hits = [];
      for (var j = 0; j < opts.length; j++) if (optTextHit(opts[j], a)) hits.push(String.fromCharCode(65 + j));
      if (hits.length) return hits.join('');
    }
    return a.replace(/^答案[\uff1a:]?\s*/, '');
  }

  function guessType(opts, rawAns, stem) {
    if (!opts || !opts.length) {
      if (judgeWord(rawAns)) return 'judge';
      if (/^[A-Ha-h]{1,8}$/.test(String(rawAns || '').trim())) return 'single';
      return 'blank';
    }
    if (opts.length === 2) {
      var j0 = judgeWord(opts[0]), j1 = judgeWord(opts[1]);
      if (j0 && j1 && j0 !== j1) return 'judge';
    }
    var s = String(rawAns || '').replace(/[\s,，、;；]/g, '');
    if (/^[A-Ha-h]+$/i.test(s) && s.length > 1) return 'multi';
    if (judgeWord(rawAns)) return 'judge';
    return 'single';
  }

  function cleanStem(s) {
    return String(s == null ? '' : s)
      .replace(/^[\s\uff08(]*\d{1,4}[\s\uff09).、\uff0e:：]*/, '')
      .replace(/^第\d{1,4}题[\s\.、:：]*/, '')
      .trim();
  }

  function rowsToItems(rows, map) {
    var items = [], skipped = 0, samples = [];
    var start = map && map.headerRow >= 0 ? map.headerRow + 1 : 0;
    for (var r = start; r < rows.length; r++) {
      var row = rows[r] || [];
      var stem = cleanStem(cleanCell(row[map.stem]));
      var rawAns = cleanCell(row[map.answer]);
      if (!stem || stem.length < 2 || !rawAns) { if (stem || rawAns) skipped++; continue; }
      var type = map.type >= 0 ? typeWord(cleanCell(row[map.type])) : '';
      var opts = collectOptions(row, map);
      if (!type) type = guessType(opts, rawAns, stem);
      var ans = normalizeAnswer(rawAns, opts, type);
      if (!ans) { skipped++; continue; }
      items.push({ stem: stem, type: type, opts: opts, ans: ans });
      if (samples.length < 3) samples.push({ stem: stem, ans: ans, opts: opts.length });
    }
    return { items: items, skipped: skipped, samples: samples };
  }

  /**
   * 分析一张表：自动匹配列 → 解析成题目
   * @param rows 二维数组
   * @param override 可选手工指定 {stem, answer, optCol, headerRow}
   */
  function analyze(rows, override) {
    rows = rows || [];
    var headerRow = detectHeaderRow(rows);
    var map;
    if (override && (override.stem >= 0 || override.answer >= 0)) {
      map = {
        stem: override.stem >= 0 ? override.stem : 0,
        answer: override.answer >= 0 ? override.answer : 1,
        type: -1,
        optCol: (override.optCol == null ? -1 : override.optCol),
        optCols: [],
        headerRow: (override.headerRow == null ? headerRow : override.headerRow),
        layout: 'manual', heads: [],
      };
      var a = Math.min(map.stem, map.answer), b = Math.max(map.stem, map.answer);
      for (var c = a + 1; c < b; c++) map.optCols.push(c);
      if (map.optCol >= 0 && map.optCols.indexOf(map.optCol) >= 0) {
        map.optCols = map.optCols.filter(function (x) { return x !== map.optCol; });
      }
      map.manual = true;
      map.layout = map.optCol >= 0 ? 'merged' : (map.optCols.length ? 'wide' : 'simple');
    } else if (headerRow >= 0) {
      map = mapFromHeader(rows[headerRow]);
    } else {
      map = inferMap(rows);
    }
    if (map.stem < 0 || map.answer < 0) {
      return { ok: false, error: '没认出「题干」和「答案」列，请在下方手动选择', map: map, headerRow: headerRow, items: [], skipped: 0, samples: [], heads: map.heads || [] };
    }
    var res = rowsToItems(rows, map);
    return {
      ok: res.items.length > 0,
      error: res.items.length ? '' : '没有解析到任何题目（请检查列选择或表头行）',
      map: map, headerRow: map.headerRow, heads: map.heads || [],
      items: res.items, skipped: res.skipped, samples: res.samples, rowCount: rows.length,
    };
  }

  // ============================================================
  //  7. 统一入口
  // ============================================================
  function detectKind(name, bytes) {
    var ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (bytes && bytes.length > 4) {
      if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return (ext === 'zip') ? 'xlsx' : 'xlsx';
      if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return 'xls';
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'text';
    }
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xltx') return 'xlsx';
    if (ext === 'xls') return 'xls';
    if (ext === 'json') return 'json';
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'text' || ext === 'tab') return 'text';
    return bytes && bytes.length ? 'text' : 'unknown';
  }

  /**
   * 解析任意支持的题库文件
   * @returns {kind, sheets, items, enc, delim, error}
   */
  function parseFile(bytes, name) {
    var kind = detectKind(name, bytes);
    if (kind === 'xls') return { kind: kind, error: '旧版 .xls（BIFF）不支持：请用 Excel/WPS 打开后「另存为 .xlsx」或「另存为 CSV」再导入', sheets: [], items: [] };
    if (kind === 'unknown') return { kind: kind, error: '无法识别的文件格式', sheets: [], items: [] };
    if (kind === 'json') {
      var j = parseJson(bytes);
      return { kind: 'json', sheets: j.sheets || [], items: j.items || [], enc: j.enc, error: j.error || '' };
    }
    if (kind === 'xlsx') {
      var x = parseXlsx(bytes);
      return { kind: 'xlsx', sheets: x.sheets || [], items: [], enc: 'utf-8', error: x.error || '' };
    }
    var t = parseTextTable(bytes);
    return { kind: 'text', sheets: t.sheets || [], items: [], enc: t.enc, delim: t.delim, error: t.error || '' };
  }

  // ============================================================
  //  8. 题干模糊匹配（导入的题库与页面题干常有一字之差）
  // ============================================================
  function bigrams(s) {
    var m = {}, i;
    for (i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); m[g] = (m[g] || 0) + 1; }
    return m;
  }
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.98;
    var la = a.length, lb = b.length;
    if (Math.min(la, lb) / Math.max(la, lb) < 0.5) return 0;
    var A = bigrams(a), B = bigrams(b), inter = 0;
    for (var g in A) if (B[g]) inter += Math.min(A[g], B[g]);
    return (2 * inter) / ((la - 1) + (lb - 1));
  }

  /**
   * 在题库键集合里找最匹配的一条
   * @param keys 题库指纹数组
   * @param q   页面题干指纹
   * @param opt {ratio:0.86, fuzzy:true, maxScan:8000, minLen:8}
   */
  function matchKey(keys, q, opt) {
    opt = opt || {};
    var ratio = opt.ratio || 0.86;
    var minLen = opt.minLen || 8;
    var maxScan = opt.maxScan || 8000;
    if (!q || q.length < minLen || !keys || !keys.length) return null;
    var i, k;
    // ① 60 字指纹（历史数据只存了前 60 字）
    var short = q.slice(0, 60);
    if (short !== q) { for (i = 0; i < keys.length; i++) if (keys[i] === short) return keys[i]; }
    // ② 包含关系（页面题干更长 / 题库题干更长）
    var best = null, bestLen = 0;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k.length < minLen) continue;
      if (k.length > bestLen && k.indexOf(q) >= 0) { best = k; bestLen = k.length; }
    }
    if (best) return best;
    best = null; bestLen = 0;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k.length < minLen) continue;
      if (k.length > bestLen && q.indexOf(k) >= 0) { best = k; bestLen = k.length; }
    }
    if (best) return best;
    // ③ 相似度兜底（长度差过大直接跳过，控制开销）
    if (opt.fuzzy === false || keys.length > maxScan) return null;
    var bs = 0, bk = null;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k.length < minLen) continue;
      var diff = Math.abs(k.length - q.length);
      if (diff > 12 && diff > q.length * 0.5) continue;
      var s = dice(q, k);
      if (s > bs) { bs = s; bk = k; }
    }
    return (bk && bs >= ratio) ? bk : null;
  }

  // ============================================================
  //  9. CSV 模板（给用户照着填）
  // ============================================================
  function templateCsv() {
    var rows = [
      ['题目', '选项A', '选项B', '选项C', '选项D', '答案', '题型'],
      ['中国的首都是哪里？', '北京', '上海', '广州', '深圳', 'A', '单选'],
      ['下列哪些属于哺乳动物？', '鲸鱼', '蝙蝠', '鲨鱼', '鸭嘴兽', 'A,B,D', '多选'],
      ['地球是圆的。', '正确', '错误', '', '', '正确', '判断'],
      ['水的化学式是____。', '', '', '', '', 'H2O', '填空'],
    ];
    return rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join(NL);
  }

  return {
    NL: NL,
    norm: norm,
    decodeBytes: decodeBytes,
    inflateRaw: inflateRaw,
    unzip: unzip,
    parseXlsx: parseXlsx,
    parseTextTable: parseTextTable,
    parseJson: parseJson,
    detectKind: detectKind,
    parseFile: parseFile,
    detectHeaderRow: detectHeaderRow,
    mapFromHeader: mapFromHeader,
    inferMap: inferMap,
    analyze: analyze,
    rowsToItems: rowsToItems,
    splitOptions: splitOptions,
    cleanOpt: cleanOpt,
    cleanStem: cleanStem,
    normalizeAnswer: normalizeAnswer,
    judgeWord: judgeWord,
    typeWord: typeWord,
    matchKey: matchKey,
    dice: dice,
    templateCsv: templateCsv,
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = BankImport; }
if (typeof window !== 'undefined') { window.BankImport = BankImport; }
