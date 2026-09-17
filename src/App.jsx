import React, { useState, useRef } from 'react';
import { FolderOpen, Sparkles, Download, Trash2, RefreshCcw, CheckSquare, Clipboard, Ruler, Palette } from 'lucide-react';

function deepSet(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || current[keys[i]] === null || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return obj;
}

export default function App() {
  const [docs, setDocs] = useState([]);
  const [editorText, setEditorText] = useState('[]');
  const [expanded, setExpanded] = useState(new Set());
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [selected, setSelected] = useState(null);
  const fileRef = useRef(null);
  const editorRef = useRef(null);

  const exampleData = [
    { nome: "Maria Silva", idade: 28, ativo: true, endereco: { cidade: "São Paulo", uf: "SP", coordenadas: { lat: -23.5505, lng: -46.6333 } }, tags: ["dev", "design"] },
    { nome: "João Souza", idade: 34, ativo: false, endereco: { cidade: "Rio de Janeiro", uf: "RJ" }, habilidades: ["JS", "PHP"] }
  ];

  const loadExample = () => { setDocs(exampleData); setEditorText(JSON.stringify(exampleData, null, 2)); setSelected(null); };
  const handleFile = (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const arr = Array.isArray(parsed) ? parsed.filter(o => o && typeof o === 'object') : [parsed].filter(o => o && typeof o === 'object');
        if (arr.length) { setDocs(arr); setEditorText(JSON.stringify(arr, null, 2)); setSelected(null); }
      } catch { setMessage('Erro ao ler arquivo JSON'); }
    };
    reader.readAsText(files[0]);
  };
  const formatEditor = () => { try { setEditorText(JSON.stringify(JSON.parse(editorText), null, 2)); setMessage('JSON formatado'); } catch { setMessage('JSON inválido'); } };
  const validateEditor = () => { try { const parsed = JSON.parse(editorText); const arr = Array.isArray(parsed) ? parsed : [parsed]; setMessage(`Válido: ${arr.length} objeto(s)`); return arr; } catch { setMessage('JSON inválido'); return null; } };
  const syncFromEditor = () => { const arr = validateEditor(); if (arr) setDocs(arr); };
  const exportJson = () => { const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `docs_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const toggleExpand = (path) => { const s = new Set(expanded); s.has(path) ? s.delete(path) : s.add(path); setExpanded(s); };
  const getColHeaders = () => { const cols = new Set(); docs.forEach(d => Object.keys(d).forEach(k => cols.add(k))); return Array.from(cols); };
  const headers = getColHeaders();

  const selectValueRange = (text, keyIdx, key) => {
    const colon = text.indexOf(':', keyIdx + key.length + 2);
    if (colon === -1) return null;
    let i = colon + 1;
    while (i < text.length && /\s/.test(text[i])) i++;
    const vs = i;
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '\\') i += 2;
        else if (text[i] === '"') { i++; break; }
        else i++;
      }
      return [vs, i];
    }
    if (text[i] === '{' || text[i] === '[') {
      const open = text[i];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else {
          if (ch === '"') inStr = true;
          else if (ch === open) depth++;
          else if (ch === close) { depth--; if (depth === 0) { i++; break; } }
        }
      }
      return [vs, i];
    }
    let j = i;
    while (j < text.length && ![',', '\n', '}', ']'].includes(text[j])) j++;
    return [vs, j];
  };

  const highlightInEditor = (docIdx, key, nestedPath) => {
    const ta = editorRef.current;
    if (!ta) return;
    const text = ta.value;
    const targetPath = nestedPath || key;
    const segs = targetPath.split('.');
    const topKey = segs[0];
    let pos = 0;
    let keyIdx = -1;
    for (let d = 0; d <= docIdx; d++) {
      const has = docs[d] && Object.prototype.hasOwnProperty.call(docs[d], topKey);
      const needle = `"${topKey}"`;
      const idx = text.indexOf(needle, pos);
      if (idx === -1) return;
      if (d === docIdx) {
        if (!has) return;
        keyIdx = idx;
      } else if (has) {
        pos = idx + needle.length;
      }
    }
    if (keyIdx === -1) return;
    let range = selectValueRange(text, keyIdx, topKey);
    if (!range) return;
    let rs = range[0];
    let re = range[1];
    for (let s = 1; s < segs.length; s++) {
      const seg = segs[s];
      const needle = `"${seg}"`;
      const idx = text.indexOf(needle, rs);
      if (idx === -1 || idx >= re) return;
      const r2 = selectValueRange(text, idx, seg);
      if (!r2) return;
      rs = r2[0];
      re = r2[1];
    }
    try {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(rs, re);
      const lines = text.slice(0, rs).split('\n').length;
      ta.scrollTop = Math.max(0, lines * 22 - ta.clientHeight / 2);
    } catch { /* noop */ }
  };

  const handleEditorSelect = () => {
    const ta = editorRef.current;
    if (!ta || docs.length === 0) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const value = ta.value;
    let key = null;
    let docIdx = null;
    if (e > s) {
      const sel = value.slice(s, e).trim();
      const mKey = sel.match(/^"([^"]+)"\s*:?$/);
      if (mKey) {
        key = mKey[1];
      } else {
        const unq = sel.replace(/^"|"$/g, '');
        for (let d = 0; d < docs.length && !key; d++) {
          const keys = Object.keys(docs[d]);
          for (let k = 0; k < keys.length; k++) {
            const kk = keys[k];
            const v = docs[d][kk];
            if (String(v) === sel || String(v) === unq || JSON.stringify(v) === sel) { key = kk; docIdx = d; break; }
          }
        }
        if (!key) {
          const deepFind = (node) => {
            if (node && typeof node === 'object') {
              const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node);
              for (let k = 0; k < keys.length; k++) {
                const vv = node[keys[k]];
                if (vv && typeof vv === 'object') {
                  if (JSON.stringify(vv) === sel) return true;
                  if (deepFind(vv)) return true;
                } else if (String(vv) === sel || String(vv) === unq) return true;
              }
            }
            return false;
          };
          for (let d = 0; d < docs.length && !key; d++) {
            const keys = Object.keys(docs[d]);
            for (let k = 0; k < keys.length; k++) {
              if (deepFind(docs[d][keys[k]])) { key = keys[k]; docIdx = d; break; }
            }
          }
        }
        if (!key) {
          const clean = unq.replace(/[:\s]+$/g, '');
          if (docs.some((dd) => Object.prototype.hasOwnProperty.call(dd, clean))) key = clean;
        }
      }
    }
    if (!key) {
      const before = value.slice(0, s);
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = value.indexOf('\n', s);
      const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
      const m = line.match(/"([^"]+)"\s*:/);
      if (m) key = m[1];
      const upto = value.slice(0, s);
      const matches = upto.match(/\n  \{/g);
      docIdx = matches ? matches.length : 0;
      if (docIdx >= docs.length) docIdx = docs.length - 1;
      if (docIdx < 0) docIdx = 0;
    }
    if (!key) return;
    if (!docs.some((dd) => Object.prototype.hasOwnProperty.call(dd, key))) {
      const order = [];
      if (docIdx != null && docIdx >= 0 && docIdx < docs.length) order.push(docIdx);
      for (let d = 0; d < docs.length; d++) if (!order.includes(d)) order.push(d);
      let mapped = null;
      for (let oi = 0; oi < order.length && !mapped; oi++) {
        const d = order[oi];
        const keys = Object.keys(docs[d]);
        for (let k = 0; k < keys.length; k++) {
          const v = docs[d][keys[k]];
          if (v && typeof v === 'object' && JSON.stringify(v).includes(`"${key}"`)) { mapped = { docIdx: d, key: keys[k] }; break; }
        }
      }
      if (!mapped) return;
      docIdx = mapped.docIdx;
      key = mapped.key;
    }
    if (docIdx == null || docIdx < 0 || docIdx >= docs.length || !Object.prototype.hasOwnProperty.call(docs[docIdx] || {}, key)) {
      const f = docs.findIndex((dd) => Object.prototype.hasOwnProperty.call(dd, key));
      docIdx = f === -1 ? 0 : f;
    }
    setSelected((prev) => (prev && prev.docIdx === docIdx && prev.key === key ? prev : { docIdx, key }));
  };

  const startEdit = (path, rowIdx, col, currentVal) => {
    setEditing({ path, rowIdx, col });
    setEditValue(typeof currentVal === 'object' && currentVal !== null ? JSON.stringify(currentVal) : String(currentVal ?? ''));
  };

  const parseEditValue = (val) => {
    const trimmed = val.trim();
    if (trimmed === '') return '';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')) || trimmed === 'null') { try { return JSON.parse(trimmed); } catch (err) { /* mantém string */ } }
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (isNaN(trimmed)) return trimmed;
    return Number(trimmed);
  };

  const commitEdit = () => {
    if (!editing) return;
    const editPath = editing.path;
    const editRow = editing.rowIdx;
    const parsed = parseEditValue(editValue);
    const newDocs = docs.map((doc, i) => {
      if (i !== editRow) return doc;
      const newDoc = { ...doc };
      deepSet(newDoc, editPath, parsed);
      return newDoc;
    });
    setDocs(newDocs);
    setEditorText(JSON.stringify(newDocs, null, 2));
    setEditing(null);
    setEditValue('');
    setTimeout(() => {
      if (editorRef.current) {
        const text = editorRef.current.value;
        const top = editPath.split('.')[0];
        const idx = text.indexOf(`"${top}"`);
        if (idx !== -1) {
          try {
            editorRef.current.focus({ preventScroll: true });
            editorRef.current.setSelectionRange(idx, idx + top.length + 2);
          } catch { /* noop */ }
        }
      }
    }, 100);
  };

  const clearAll = () => { setDocs([]); setEditorText('[]'); setSelected(null); };

  const renderEditInput = () => (
    <input
      autoFocus
      value={editValue}
      onChange={(ev) => setEditValue(ev.target.value)}
      onBlur={commitEdit}
      onKeyDown={(ev) => { if (ev.key === 'Enter') commitEdit(); if (ev.key === 'Escape') setEditing(null); }}
      onClick={(ev) => ev.stopPropagation()}
      onDoubleClick={(ev) => ev.stopPropagation()}
      style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid var(--accent)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
    />
  );

  const formatNested = (val, path, rowIdx, col) => {
    const expKey = `${rowIdx}:${path}`;
    const isEditingHere = editing && editing.path === path && editing.rowIdx === rowIdx;
    if (isEditingHere) return renderEditInput();
    const handleClick = (ev) => {
      ev.stopPropagation();
      setSelected({ docIdx: rowIdx, key: col });
      highlightInEditor(rowIdx, col, path);
    };
    const handleDblClick = (ev) => {
      ev.stopPropagation();
      setSelected({ docIdx: rowIdx, key: col });
      highlightInEditor(rowIdx, col, path);
      startEdit(path, rowIdx, col, val);
    };
    if (val === null) return <span className="text-mut italic" onClick={handleClick} onDoubleClick={handleDblClick}>null</span>;
    if (typeof val === 'boolean') return <span className="text-prim font-600" onClick={handleClick} onDoubleClick={handleDblClick}>{String(val)}</span>;
    if (typeof val === 'number') return <span className="text-accent font-600" onClick={handleClick} onDoubleClick={handleDblClick}>{val}</span>;
    if (typeof val === 'string') return <span onClick={handleClick} onDoubleClick={handleDblClick}>{val}</span>;
    if (Array.isArray(val)) {
      const isExp = expanded.has(expKey);
      return (
        <span onClick={handleClick}>
          <button onClick={(ev) => { ev.stopPropagation(); toggleExpand(expKey); }} className="btn">{isExp ? '▼' : '▶'} [{val.length} itens]</button>
          {isExp && (
            <div className="pl-3 mt-1">
              {val.map((item, i) => {
                const childPath = `${path}.${i}`;
                return (
                  <div key={i} style={{ padding: 4, borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span className="text-accent font-600" style={{ marginRight: 8 }}>[{i}]</span>
                    {formatNested(item, childPath, rowIdx, col)}
                  </div>
                );
              })}
            </div>
          )}
        </span>
      );
    }
    if (val && typeof val === 'object') {
      const isExp = expanded.has(expKey);
      return (
        <span onClick={handleClick}>
          <button onClick={(ev) => { ev.stopPropagation(); toggleExpand(expKey); }} className="btn">{isExp ? '▼' : '▶'} {'{...}'}</button>
          {isExp && (
            <div className="pl-3 mt-1">
              {Object.entries(val).map(([k, v]) => {
                const childPath = `${path}.${k}`;
                return (
                  <div key={k} style={{ padding: 4, borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span className="font-600" style={{ padding: '2px 6px', marginRight: 8 }}>{k}</span>
                    {formatNested(v, childPath, rowIdx, col)}
                  </div>
                );
              })}
            </div>
          )}
        </span>
      );
    }
    return <span onClick={handleClick} onDoubleClick={handleDblClick}>{String(val)}</span>;
  };

  return (
    <div className="c">
      <div className="flex items-center flex-wrap mb-4 bg-card p-4 rounded-lg shadow border gap-1-5">
        <h1 className="font-700 text-xl">📊 GradeJson</h1>
        <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".json" onChange={handleFile} />
        <button className="btn-primary" onClick={() => fileRef.current && fileRef.current.click()}><FolderOpen size={16} /> Carregar arquivo(s)</button>
        <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--success), var(--success-hover))' }} onClick={loadExample}><Sparkles size={16} /> Exemplo</button>
        <span className="bg-card border rounded-sm px-3 py-1 text-sm font-600">📄 {docs.length} documentos</span>
        <div className="f-1" />
        <button className="btn-outline" onClick={() => { const h = document.documentElement; h.setAttribute('data-theme', h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }}><Palette size={16} /> Tema</button>
        <button className="btn-outline" onClick={exportJson}><Download size={16} /> Exportar</button>
        <button className="btn-outline" onClick={clearAll}><Trash2 size={16} /> Limpar</button>
        <button className="btn-outline" onClick={syncFromEditor}><RefreshCcw size={16} /> Aplicar do Editor</button>
      </div>

      <div className="flex gap-6 h-full" style={{ height: 'calc(100vh - 180px)', minHeight: 500 }}>
        <div className="flex-1 flex flex-col bg-card rounded-lg shadow border" style={{ minWidth: 300 }}>
          <div className="p-3 border-b bg-card flex justify-between items-center rounded-lg">
            <h3 className="font-600 text-lg">📝 Editor JSON</h3>
            <div className="flex gap-2">
              <button className="btn" onClick={formatEditor}><RefreshCcw size={16} /> Formatar</button>
              <button className="btn-success" onClick={validateEditor}><CheckSquare size={16} /> Validar</button>
            </div>
          </div>
          <textarea
            ref={editorRef}
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            onSelect={handleEditorSelect}
            onClick={handleEditorSelect}
            onKeyUp={handleEditorSelect}
            className="editor-textarea"
            placeholder="Cole seu JSON aqui..."
          />
          {message && <div className={`msg ${message.includes('invalid') || message.includes('Erro') ? 'msg-invalid' : 'msg-ok'}`}>{message}</div>}
        </div>

        <div className="flex-1 flex flex-col" style={{ minWidth: 300 }}>
          <div className="bg-card rounded-lg shadow border overflow-a" style={{ flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
              <thead>
                <tr className="pos-sticky top-0 z-10 bg-card">
                  {headers.map((col) => (
                    <th key={col} className="border-b text-sec uppercase tracking">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, docIdx) => (
                  <tr key={docIdx} className={selected && selected.docIdx === docIdx ? 'row-active' : ''}>
                    {headers.map((key) => {
                      const val = doc[key];
                      const isEditing = editing && editing.rowIdx === docIdx && editing.path === key;
                      const isColActive = selected && selected.key === key;
                      const isCell = selected && selected.docIdx === docIdx && selected.key === key;
                      return (
                        <td
                          key={key}
                          className={`${isColActive ? 'col-active' : 'border-r'}${isCell ? ' cell-selected' : ''}`}
                          style={{ padding: '14px 18px', verticalAlign: 'middle', wordBreak: 'break-word', cursor: 'pointer' }}
                          onClick={() => { setSelected({ docIdx, key }); highlightInEditor(docIdx, key); }}
                          onDoubleClick={() => startEdit(key, docIdx, key, val)}
                        >
                          {isEditing ? renderEditInput() : (val === undefined ? <span className="text-mut italic" onDoubleClick={() => startEdit(key, docIdx, key, val)}>—</span> : formatNested(val, key, docIdx, key))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {docs.length === 0 && <div className="text-mut italic" style={{ padding: 40, textAlign: 'center' }}>Nenhum documento carregado</div>}
          </div>
          <div className="flex gap-2 p-3 border-t bg-card" style={{ borderRadius: '0 0 16px 16px' }}>
            <button className="btn" onClick={() => { if (docs.length) { navigator.clipboard.writeText(JSON.stringify(docs, null, 2)); setMessage('📋 JSON copiado!'); setTimeout(() => setMessage(''), 2000); } }}><Clipboard size={16} /> Copiar JSON</button>
            <button className="btn" onClick={() => { document.querySelectorAll('tbody tr').forEach((r) => { r.style.height = 'auto'; }); }}><Ruler size={16} /> Ajustar Colunas</button>
          </div>
        </div>
      </div>
    </div>
  );
}
