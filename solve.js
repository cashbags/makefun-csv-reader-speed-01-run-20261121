// Fast csv-reader 1.0.0 drop-in: same {columns, rows, errors} for every
// input. Clean records are one slice plus split(',').

export function run(input) {
  const text = String(input.text), header = input.header === true;
  const errs = [], rows = [];
  let cols = null, width = -1;
  const n = text.length;
  let pos = 0, line = 1, rl = 1, rr = null;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;
  const err = (code) => { errs.push({ code, line: rl, row: rr }); };

  function pushQ(a, b) {
    if (a >= b) return '';
    const chunk = text.slice(a, b);
    if (chunk.indexOf('\r') === -1) { line += chunk.split('\n').length - 1; return chunk; }
    let out = '';
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (code === 13) { out += '\n'; line++; if (chunk.charCodeAt(i + 1) === 10) i++; }
      else { if (code === 10) line++; out += chunk[i]; }
    }
    return out;
  }

  function unq(value) {
    let v = value;
    while (pos < n) {
      const comma = text.indexOf(',', pos), lf = text.indexOf('\n', pos);
      let end = n, kind = 2;
      if (comma !== -1 && comma < end) { end = comma; kind = 0; }
      if (lf !== -1 && lf < end) { end = lf; kind = 1; }
      const seg = text.slice(pos, end);
      const r = seg.indexOf('\r');
      if (r !== -1) {
        if (r > 0) v += seg.slice(0, r);
        if (text.charCodeAt(pos + r + 1) === 10) { pos += r + 2; line++; return { value: v, ended: 1 }; }
        err('stray_cr');
        pos += r + 1;
        continue;
      }
      v += seg;
      if (kind === 0) { pos = end + 1; return { value: v, ended: 0 }; }
      if (kind === 1) { pos = end + 1; line++; return { value: v, ended: 1 }; }
      pos = n;
      return { value: v, ended: 2 };
    }
    return { value: v, ended: 2 };
  }

  function quo() {
    const open = pos, openLine = line;
    let value = '';
    pos++;
    let closed = false;
    while (pos < n) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) { value += pushQ(pos, q) + '"'; pos = q + 2; continue; }
      value += pushQ(pos, q);
      pos = q + 1; closed = true; break;
    }
    if (!closed) {
      pos = open + 1; line = openLine;
      err('unterminated_quote');
      return unq('"');
    }
    if (pos >= n) return { value, ended: 2 };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos++; return { value, ended: 0 }; }
    if (c === 10) { pos++; line++; return { value, ended: 1 }; }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; return { value, ended: 1 }; }
    const junk = unq(value);
    if (junk.value.length > value.length) err('quote_junk');
    return junk;
  }

  function finish(fields) {
    if (width < 0) width = fields.length;
    if (header && cols === null) { cols = fields; return; }
    if (fields.length < width) {
      errs.push({ code: 'short_row', line: rl, row: rr, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errs.push({ code: 'long_row', line: rl, row: rr, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos++; line++; }
      else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; }
      else break;
    }
    if (pos >= n) break;
    rl = line;
    rr = header && cols === null ? null : rows.length;
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const segEnd = nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    if (segEnd > pos) {
      const segment = text.slice(pos, segEnd);
      if (segment.indexOf('"') === -1 && segment.indexOf('\r') === -1) {
        finish(segment.split(','));
        pos = nl === -1 ? n : nl + 1;
        line++;
        continue;
      }
    }
    const fields = [];
    let field, quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? quo() : unq('');
      fields.push(field.value);
    } while (field.ended === 0);
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    finish(fields);
  }
  return { columns: header ? (cols ?? []) : null, rows, errors: errs };
}
