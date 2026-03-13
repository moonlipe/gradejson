// ========== ESTADO CENTRAL ==========
let documentos = [];
let colunas = [];
let expandedCells = new Set();
let selectedPath = null;

// ========== VARIÁVEIS DE REDIMENSIONAMENTO ==========
let resizing = false;
let currentColumn = null;
let startX = 0;
let startWidth = 0;

// row resize state
let resizingRow = false;
let currentRow = null;
let startY = 0;
let startHeight = 0;
let pendingRow = false;

// ========== ELEMENTOS DOM ==========
const sheetGridEl = document.getElementById('sheetGrid');
const docCounterSpan = document.getElementById('docCounter');
const jsonEditorTextarea = document.getElementById('jsonEditorTextarea');
const fileInput = document.getElementById('fileInput');
const loadFileBtn = document.getElementById('loadFileBtn');
const addSampleBtn = document.getElementById('addSampleBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const formatEditorBtn = document.getElementById('formatEditorBtn');
const validateEditorBtn = document.getElementById('validateEditorBtn');
const syncFromEditorBtn = document.getElementById('syncFromEditorBtn');
const editorValidationMessage = document.getElementById('editorValidationMessage');

// ========== FUNÇÕES UTILITÁRIAS ==========
function escapeHtml(unsafe) {
    return unsafe.replace(/[&<>"]/g, function(m) {
        if(m === '&') return '&amp;'; 
        if(m === '<') return '&lt;'; 
        if(m === '>') return '&gt;'; 
        if(m === '"') return '&quot;';
        return m;
    });
}

function isObject(val) {
    return val && typeof val === 'object' && !Array.isArray(val) && val !== null;
}

function isArray(val) {
    return Array.isArray(val);
}

// ========== FUNÇÕES DE HIGHLIGHT MELHORADAS ==========
function highlightJsonPath(jsonStr, pathParts) {
    if (pathParts.length === 0) return jsonStr;
    
    // Escapa o JSON para HTML
    let escaped = jsonStr.replace(/&/g, '&amp;')
                         .replace(/</g, '&lt;')
                         .replace(/>/g, '&gt;')
                         .replace(/"/g, '&quot;')
                         .replace(/'/g, '&#039;')
                         .replace(/\n/g, '<br>')
                         .replace(/ /g, '&nbsp;');
    
    // Reconstrói o caminho para buscar no JSON
    let searchPath = '';
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!isNaN(part)) {
            // É índice de array
            searchPath += `\\[${part}\\]`;
        } else {
            // É propriedade de objeto
            if (i === 0) {
                searchPath += `"${part}"\\s*:`;
            } else {
                searchPath += `\\s*"${part}"\\s*:`;
            }
        }
    }
    
    // Adiciona o valor após o caminho
    searchPath += '\\s*([^,}\\n]+)';
    
    try {
        const regex = new RegExp(`(${searchPath})`, 'g');
        escaped = escaped.replace(regex, '<span class="json-highlight">$1</span>');
    } catch (e) {
        console.warn('Erro no regex de highlight:', e);
    }
    
    return escaped;
}


// ========== FORMATAÇÃO DE VALORES ==========
function formatValue(val, path) {
    // produce the inner representation according to type
    let inner;
    if (val === null) inner = '<span class="null-value">null</span>';
    else if (typeof val === 'boolean') inner = `<span class="boolean-value">${val}</span>`;
    else if (typeof val === 'number') inner = `<span class="number-value">${val}</span>`;
    else if (typeof val === 'string') inner = escapeHtml(val);
    else inner = escapeHtml(String(val));

    // wrap with a span carrying the path so both top-level and nested
    // primitives are addressable/editable via event delegation
    if (path) {
        return `<span class="primitive" data-path="${path}">${inner}</span>`;
    }
    return inner;
}

function formatNestedValue(val, path, depth = 0) {
    if (isObject(val)) {
        const isExpanded = expandedCells.has(path);
        let html = `<span class="object-cell ${isExpanded ? 'expanded' : ''}" data-path="${path}">`;
        html += '{ ... }';
        html += '</span>';
        
        if (isExpanded) {
            html += '<div class="subgrid-content">';
            Object.keys(val).forEach(key => {
                const childPath = `${path}:${key}`;
                const childVal = val[key];
                
                html += '<div class="subgrid-item">';
                html += `<span class="subgrid-key">${escapeHtml(key)}</span>`;
                html += '<span class="subgrid-value">';
                
                if (isObject(childVal) || isArray(childVal)) {
                    html += formatNestedValue(childVal, childPath, depth + 1);
                } else {
                    html += formatValue(childVal, childPath);
                }
                
                html += '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        return html;
    }
    
    if (isArray(val)) {
        const isExpanded = expandedCells.has(path);
        let html = `<span class="array-cell ${isExpanded ? 'expanded' : ''}" data-path="${path}">`;
        html += `[${val.length} itens]`;
        html += '</span>';
        
        if (isExpanded) {
            html += '<div class="subgrid-content">';
            val.forEach((item, index) => {
                const childPath = `${path}:${index}`;
                
                html += '<div class="subgrid-item">';
                html += `<span class="subgrid-key"><span class="array-marker">[${index}]</span></span>`;
                html += '<span class="subgrid-value">';
                
                if (isObject(item) || isArray(item)) {
                    html += formatNestedValue(item, childPath, depth + 1);
                } else {
                    html += formatValue(item, childPath);
                }
                
                html += '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        return html;
    }
    
    return formatValue(val, path);
}

// ========== RENDERIZAÇÃO DO GRID ==========
function renderGrid({autoResize = true} = {}) {
        // Scroll: ao expandir, centralizar a célula expandida na área visível
        function scrollToExpandedCellCenter() {
            if (!sheetWrapperEl) return;
            const expanded = Array.from(expandedCells);
            if (expanded.length === 0) return;
            const lastExpanded = expanded[expanded.length - 1];
            const cell = sheetGridEl.querySelector(`[data-path="${lastExpanded}"]`);
            if (!cell) return;
            // Centraliza a célula expandida
            const cellRect = cell.getBoundingClientRect();
            const wrapperRect = sheetWrapperEl.getBoundingClientRect();
            const cellCenter = cellRect.left + (cellRect.width / 2);
            const wrapperCenter = wrapperRect.left + (wrapperRect.width / 2);
            const scrollDiff = cellCenter - wrapperCenter;
            sheetWrapperEl.scrollLeft += scrollDiff;
        }
    // Corrigir: preservar scroll do sheetWrapper
    const sheetWrapperEl = document.getElementById('sheetWrapper');
    const prevScrollLeft = sheetWrapperEl ? sheetWrapperEl.scrollLeft : 0;
    const prevScrollTop = sheetWrapperEl ? sheetWrapperEl.scrollTop : 0;

    if (documentos.length === 0) {
        sheetGridEl.innerHTML = '<div class="sheet-header"></div>';
        docCounterSpan.innerHTML = '📄 0 documentos';
        if (sheetWrapperEl) {
            sheetWrapperEl.scrollLeft = prevScrollLeft;
            sheetWrapperEl.scrollTop = prevScrollTop;
        }
        return;
    }
    
    const primeiroObj = documentos[0];
    colunas = [];
    
    if (primeiroObj) {
        Object.keys(primeiroObj).forEach(key => colunas.push(key));
    }
    
    documentos.forEach((doc, idx) => {
        if (idx === 0) return;
        Object.keys(doc).forEach(key => {
            if (!colunas.includes(key)) colunas.push(key);
        });
    });

    let headerHtml = '<div class="sheet-header">';
    colunas.forEach(col => {
        headerHtml += `<div class="sheet-cell">${escapeHtml(col)}</div>`;
    });
    headerHtml += '</div>';

    let linhasHtml = '';
    
    documentos.forEach((doc, rowIdx) => {
        let rowHtml = `<div class="sheet-row" data-rowindex="${rowIdx}">`;
        
        colunas.forEach(col => {
            const valor = doc[col];
            const cellPath = `${rowIdx}:${col}`;
            const isSelected = selectedPath === cellPath;
            
            let cellClass = 'sheet-cell';
            if (isSelected) cellClass += ' selected';
            
            let content = '';
            if (valor === undefined || valor === null) {
                content = '';
            } else if (isObject(valor) || isArray(valor)) {
                content = formatNestedValue(valor, cellPath);
            } else {
                // primitives now wrapped by formatValue itself
                content = formatValue(valor, cellPath);
            }
            
            rowHtml += `<div class="${cellClass}" data-path="${cellPath}" data-col="${col}" data-row="${rowIdx}">`;
            rowHtml += content;
            rowHtml += `<div class="col-resizer" aria-hidden="true"></div>`;
            rowHtml += `</div>`;
        });
        
        rowHtml += '</div>';
        linhasHtml += rowHtml;
    });

    sheetGridEl.innerHTML = headerHtml + linhasHtml;
    // restaurar scroll após atualização do DOM
    if (sheetWrapperEl) {
        sheetWrapperEl.scrollTop = prevScrollTop;
        scrollToExpandedCellCenter();
    }

    const qtd = documentos.length;
    docCounterSpan.innerHTML = `📄 ${qtd} ${qtd === 1 ? 'documento' : 'documentos'}`;

    // nothing special to do here anymore; editing is handled via
    // delegation on sheetGridEl in attachEventListeners()
    
    if (autoResize) {
        setTimeout(() => {
            autoResizeColumns();
            initColumnResize();
            initRowResize();
            adjustRowHeightAfterExpand();
        }, 100);
        // run again later in case nested content expanded after initial layout
        setTimeout(() => {
            autoResizeColumns();
            adjustRowHeightAfterExpand();
        }, 300);
    } else {
        // still need the resize handles when columns are static
        setTimeout(initColumnResize, 100);
        setTimeout(initRowResize, 100);
    }
}

// ========== FUNÇÕES DE INTERAÇÃO ==========
function toggleCellExpansion(path) {
    console.log('Toggle expansion for:', path);
    if (expandedCells.has(path)) {
        expandedCells.delete(path);
    } else {
        expandedCells.add(path);
    }
    // Atualiza apenas a célula expandida
    updateExpandedCell(path);
}

// Atualiza o conteúdo da célula expandida sem rerenderizar o grid inteiro
function updateExpandedCell(path) {
    const cell = document.querySelector(`[data-path="${path}"]`);
    if (!cell) return;
    // Descobre valor
    const parts = path.split(':');
    const rowIdx = parseInt(parts[0], 10);
    const col = parts.slice(1).join(':');
    let valor = documentos[rowIdx];
    let keys = parts.slice(1);
    while (keys.length > 0 && valor) {
        const k = keys.shift();
        valor = valor[k];
    }
    // Renderiza apenas o conteúdo da célula, sem duplicar estrutura
    let html = '';
    if (isObject(valor) || isArray(valor)) {
        // Só atualiza a subgrid dentro da célula, não a célula inteira
        const expanded = expandedCells.has(path);
        // Atualiza apenas a subgrid
        const subgrid = cell.querySelector('.subgrid-content');
        if (subgrid) {
            // Remove subgrid se estiver contraindo
            if (!expanded) {
                subgrid.remove();
                cell.classList.remove('expanded');
            }
        } else if (expanded) {
            // Adiciona subgrid se expandindo
            html = formatNestedValue(valor, path);
            // Extrai apenas o subgrid gerado
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const newSubgrid = tempDiv.querySelector('.subgrid-content');
            if (newSubgrid) {
                cell.appendChild(newSubgrid);
                cell.classList.add('expanded');
            }
        }
    }
    // Reaplica eventos de resize
    setTimeout(initColumnResize, 50);
}

// ========== SELEÇÃO/CROSS-HIGHLIGHT ==========

function clearGridSelectionHighlights() {
    document.querySelectorAll('.sheet-cell.selection-highlight').forEach(c => c.classList.remove('selection-highlight'));
}

function highlightGridForText(text) {
    clearGridSelectionHighlights();
    if (!text) return;
    document.querySelectorAll('.sheet-cell').forEach(c => {
        if (c.innerText.trim() === text) {
            c.classList.add('selection-highlight');
        }
    });
}

function highlightEditorForText(text) {
    if (!text) return;
    const val = jsonEditorTextarea.value;
    const idx = val.indexOf(text);
    if (idx !== -1) {
        jsonEditorTextarea.focus();
        jsonEditorTextarea.setSelectionRange(idx, idx + text.length);
    }
}


function clearSelectionHighlights() {
    clearGridSelectionHighlights();
}

function selectCell(path) {
    if (selectedPath === path) return;
    console.log('Selecting cell:', path);
    // remove previous highlight
    const prev = document.querySelector('.sheet-cell.selected');
    if (prev) prev.classList.remove('selected');

    // highlight new cell if present
    const newCell = document.querySelector(`.sheet-cell[data-path="${path}"]`);
    if (newCell) newCell.classList.add('selected');

    selectedPath = path;

    // clear any arbitrary text selection highlights

    // attempt to put cursor in editor at corresponding value
    try {
        const parts = path.split(':');
        const row = parseInt(parts[0], 10);
        const key = parts[1];
        if (!isNaN(row) && documentos[row] && key) {
            const val = documentos[row][key];
            if (val !== undefined) {
                const txt = JSON.stringify(val, null, 2).replace(/^"|"$/g, '');
                highlightEditorForText(String(txt));
            }
        }
    } catch (e) {
        // ignore
    }
}

function parseValue(valor) {
    if (valor === '') return undefined;
    if (valor === 'null') return null;
    if (valor === 'true') return true;
    if (valor === 'false') return false;
    if (!isNaN(valor) && valor.trim() !== '') return Number(valor);
    return valor;
}

// ========== GERENCIAMENTO DE DADOS ==========
function setDocumentos(novosObjetos, substituir = true) {
    if (!Array.isArray(novosObjetos)) novosObjetos = [];
    const apenasObjetos = novosObjetos.filter(obj => obj && typeof obj === 'object');
    
    if (substituir) {
        documentos = apenasObjetos;
        expandedCells.clear();
        selectedPath = null;
    } else {
        documentos = [...documentos, ...apenasObjetos];
    }
    
    renderGrid();
}

async function onLoadFiles(files) {
    if (!files || files.length === 0) return;
    const objetos = await extrairJsonsDeArquivos(files);
    if (objetos.length > 0) {
        setDocumentos(objetos, true);
        jsonEditorTextarea.value = JSON.stringify(objetos, null, 2);
    } else {
        alert('Nenhum JSON válido encontrado.');
    }
    fileInput.value = '';
}

function carregarExemplo() {
    const exemplo = [
        { 
            nome: "Maria Silva", 
            idade: 28, 
            ativo: true, 
            endereco: { 
                cidade: "São Paulo", 
                uf: "SP",
                coordenadas: {
                    lat: -23.5505,
                    lng: -46.6333,
                    detalhes: {
                        zona: "Sul",
                        subprefeitura: "Sé",
                        local: {
                            tipo: "residencial",
                            bairro: "Centro"
                        }
                    }
                }
            }, 
            contato: {
                email: "maria@email.com",
                telefone: "11999999999"
            },
            tags: ["dev", "design", "ux"]
        },
        { 
            nome: "João Souza", 
            idade: 34, 
            ativo: false, 
            altura: 1.82, 
            endereco: { 
                cidade: "Rio de Janeiro", 
                uf: "RJ" 
            },
            habilidades: ["JavaScript", "PHP"]
        }
    ];
    setDocumentos(exemplo, true);
    jsonEditorTextarea.value = JSON.stringify(exemplo, null, 2);
}

function limparGrid() {
    setDocumentos([], true);
    jsonEditorTextarea.value = '[]';
}

function exportarJson() {
    const dataStr = JSON.stringify(documentos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documentos_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ========== FUNÇÕES DO EDITOR ==========
function mostrarMensagemEditor(mensagem, tipo) {
    editorValidationMessage.textContent = mensagem;
    editorValidationMessage.className = `validation-message ${tipo}`;
    editorValidationMessage.style.display = 'block';
    setTimeout(() => {
        editorValidationMessage.style.display = 'none';
    }, 3000);
}

function formatarEditorJson() {
    try {
        const texto = jsonEditorTextarea.value.trim();
        if (!texto) return;
        const parsed = JSON.parse(texto);
        jsonEditorTextarea.value = JSON.stringify(parsed, null, 2);
        mostrarMensagemEditor('✅ JSON formatado!', 'success');
    } catch (e) {
        mostrarMensagemEditor(`❌ Erro: ${e.message}`, 'error');
    }
}

function validarEditorJson() {
    try {
        const texto = jsonEditorTextarea.value.trim();
        if (!texto) {
            mostrarMensagemEditor('❌ Insira um JSON', 'error');
            return false;
        }
        const parsed = JSON.parse(texto);
        const objetos = Array.isArray(parsed) ? parsed : [parsed];
        mostrarMensagemEditor(`✅ Válido! ${objetos.length} objeto(s)`, 'success');
        return objetos;
    } catch (e) {
        mostrarMensagemEditor(`❌ Erro: ${e.message}`, 'error');
        return false;
    }
}

function sincronizarDoEditor() {
    const resultado = validarEditorJson();
    if (resultado) {
        setDocumentos(resultado, true);
    }
}

function sincronizarParaEditor() {
    jsonEditorTextarea.value = JSON.stringify(documentos, null, 2);
    mostrarMensagemEditor('📋 JSON copiado para o editor', 'success');
}

// ========== FUNÇÕES DE REDIMENSIONAMENTO ==========
function initColumnResize() {
    // attach only to the resizer handles inserted inside each cell
    const handles = document.querySelectorAll('.col-resizer');
    handles.forEach(handle => {
        handle.removeEventListener('mousedown', startResize);
        handle.addEventListener('mousedown', startResize);
    });
}

// flag not needed; we'll begin resizing only when user drags enough

function startResize(e) {
    const cell = e.target.closest('.sheet-cell');
    if (!cell) return;

    currentColumn = cell;
    startX = e.clientX;
    startWidth = cell.offsetWidth;
    resizing = false;
    document.body.style.cursor = 'col-resize';
    console.log('startResize: startX=', startX, 'startWidth=', startWidth);
    e.preventDefault();
}

function resize(e) {
    if (!currentColumn) return;

    // only begin resizing after a substantial drag; ignore pending flag
    const diff = e.clientX - startX;
    if (!resizing) {
        if (Math.abs(diff) > 20) {
            resizing = true;
        } else {
            return;
        }
    }
    
    const newWidth = Math.max(100, startWidth + diff);
    
    currentColumn.style.minWidth = newWidth + 'px';
    currentColumn.style.maxWidth = newWidth + 'px';
    
    const colIndex = Array.from(currentColumn.parentNode.children).indexOf(currentColumn);
    
    document.querySelectorAll('.sheet-row').forEach(row => {
        const cells = row.children;
        if (cells[colIndex]) {
            cells[colIndex].style.minWidth = newWidth + 'px';
            cells[colIndex].style.maxWidth = newWidth + 'px';
        }
    });
}

function stopResize() {
    if (resizing || currentColumn) {
        console.log('stopResize: resetting (resizing=', resizing, ')');
        resizing = false;
        currentColumn = null;
        document.body.style.cursor = '';
    }
}

function autoResizeColumns() {
    if (documentos.length === 0) return;
    
    const headers = document.querySelectorAll('.sheet-header .sheet-cell');
    
    headers.forEach((header, colIndex) => {
        let maxWidth = header.scrollWidth;
        
        document.querySelectorAll('.sheet-row').forEach(row => {
            const cells = row.children;
            if (cells[colIndex]) {
                cells[colIndex].style.whiteSpace = 'nowrap';
                const cellWidth = cells[colIndex].scrollWidth;
                cells[colIndex].style.whiteSpace = 'normal';
                
                maxWidth = Math.max(maxWidth, cellWidth);
            }
        });
        
        // add some padding; no artificial upper limit so wide nested
        // values will expand the column fully
        maxWidth = Math.max(50, maxWidth + 40);
        
        header.style.minWidth = maxWidth + 'px';
        header.style.maxWidth = maxWidth + 'px';
        
        document.querySelectorAll('.sheet-row').forEach(row => {
            const cells = row.children;
            if (cells[colIndex]) {
                cells[colIndex].style.minWidth = maxWidth + 'px';
                cells[colIndex].style.maxWidth = maxWidth + 'px';
            }
        });
    });
}


// ========== GRID EDIT/FIT UTILITIES ==========

function handleCellEdit(e) {
    const leaf = e.target;                        // might be primitive span or sheet-cell
    const cell = leaf.closest('.sheet-cell');     // actual column cell
    if (!cell) return;

    const newValue = leaf.innerText.trim();
    const oldValue = leaf.dataset.originalValue || '';
    // clear stored original to avoid stale data
    delete leaf.dataset.originalValue;
    if (newValue === oldValue) {
        // nothing actually changed, skip sync/resize
        return;
    }
    const path = leaf.dataset.path || cell.dataset.path;
    if (!path) return;
    const parsed = parseValue(newValue);

    const parts = path.split(':');
    const rowIdx = parseInt(parts.shift(), 10);
    if (isNaN(rowIdx) || !documentos[rowIdx]) return;
    let target = documentos[rowIdx];

    // descend through nested keys/indices
    while (parts.length > 1) {
        const key = parts.shift();
        if (!(key in target)) {
            // if path includes numeric index, try treating as number
            const idx = parseInt(key, 10);
            if (!isNaN(idx) && Array.isArray(target) && idx < target.length) {
                target = target[idx];
                continue;
            }
            return; // invalid path
        }
        target = target[key];
    }

    const last = parts.shift();
    if (last === undefined) return;
    // assign value into object/array
    if (Array.isArray(target)) {
        const idx = parseInt(last, 10);
        if (!isNaN(idx)) target[idx] = parsed;
        else target[last] = parsed;
    } else {
        target[last] = parsed;
    }

    sincronizarParaEditor();
    // editing may have changed text width/height but we no longer auto‑resize
    adjustRowHeightAfterExpand();}

function initRowResize() {
    // called after grid render
    // we're already wiring events on sheetGridEl globally so no per-row attachment
}

function adjustRowHeightAfterExpand() {
    // ensure any row whose contents now overflow is enlarged
    document.querySelectorAll('.sheet-row').forEach(row => {
        const scroll = row.scrollHeight;
        if (scroll > row.offsetHeight) {
            row.style.height = scroll + 'px';
        }
    });
}

// ========== FUNÇÕES DE EMBELEZADOR ==========
function beautifyJson(jsonStr) {
    if (!jsonStr || jsonStr.trim() === '') return jsonStr;
    
    try {
        const parsed = JSON.parse(jsonStr);
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        return jsonStr;
    }
}

function beautifyEditorJson() {
    const texto = jsonEditorTextarea.value;
    const beautified = beautifyJson(texto);
    if (beautified !== texto) {
        jsonEditorTextarea.value = beautified;
        mostrarMensagemEditor('✅ JSON embelezado!', 'success');
    } else {
        mostrarMensagemEditor('❌ Não foi possível embelezar (JSON inválido?)', 'error');
    }
}


// ========== FUNÇÕES DE TEMA ==========
let currentTheme = 'system';

function initTheme() {
    console.log('Inicializando tema...');
    
    const savedTheme = localStorage.getItem('gradeJsonTheme');
    
    if (savedTheme) {
        setTheme(savedTheme, false);
    } else {
        setTheme('system', false);
    }
    
    document.querySelectorAll('.theme-dropdown-content a').forEach(link => {
        link.removeEventListener('click', handleThemeClick);
        link.addEventListener('click', handleThemeClick);
    });
    
    setupDropdownBehavior();
}

function handleThemeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const theme = e.currentTarget.dataset.theme;
    setTheme(theme, true);

    // close the menu and reset ARIA state
    const dropdown = document.querySelector('.theme-dropdown-content');
    const themeBtn = document.getElementById('themeBtn');
    if (dropdown) {
        dropdown.style.display = 'none';
        if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
        setTimeout(() => {
            dropdown.style.display = '';
        }, 200);
    }
}

function setTheme(theme, save = true) {
    currentTheme = theme;
    
    document.querySelectorAll('.theme-dropdown-content a').forEach(link => {
        if (link.dataset.theme === theme) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    
    if (save) {
        localStorage.setItem('gradeJsonTheme', theme);
    }
    
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
}

function setupDropdownBehavior() {
    const themeBtn = document.getElementById('themeBtn');
    const dropdown = document.querySelector('.theme-dropdown-content');
    const themeDropdown = document.querySelector('.theme-dropdown');
    
    if (!themeBtn || !dropdown || !themeDropdown) return;

    // helper to place the menu in the viewport and above other elements
    function positionThemeDropdown() {
        const rect = themeBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.right = 'auto';          // ignore previous right/100% values
        // align right edge of menu with button's right edge
        dropdown.style.left = (rect.right - dropdown.offsetWidth) + 'px';
        dropdown.style.top = rect.bottom + 8 + 'px';
    }

    function showDropdown() {
        dropdown.style.display = 'block';
        positionThemeDropdown();
        themeBtn.setAttribute('aria-expanded', 'true');
    }

    function hideDropdown() {
        dropdown.style.display = 'none';
        themeBtn.setAttribute('aria-expanded', 'false');
    }

    // click toggles the menu; mouse interactions are kept for convenience
    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'block') {
            hideDropdown();
        } else {
            showDropdown();
        }
    });

    themeBtn.addEventListener('mouseenter', showDropdown);
    dropdown.addEventListener('mouseenter', showDropdown);

    themeBtn.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (!dropdown.matches(':hover')) {
                hideDropdown();
            }
        }, 200);
    });

    dropdown.addEventListener('mouseleave', hideDropdown);

    document.addEventListener('click', (e) => {
        if (!themeBtn.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });

    // close with escape key for accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    // reposition when the page moves/changes
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') positionThemeDropdown();
    });
    window.addEventListener('scroll', () => {
        if (dropdown.style.display === 'block') positionThemeDropdown();
    }, true);
}

// ========== EVENT LISTENERS ==========
function attachEventListeners() {
    // grid selection interactions
    sheetGridEl.addEventListener('click', function(e) {
        // cancel any text highlights
        clearSelectionHighlights();

        // check if user clicked directly on the expandable indicator span itself
        const expandableSpan = e.target.closest('.object-cell, .array-cell');
        if (expandableSpan && e.target === expandableSpan) {
            e.stopPropagation();
            const spanPath = expandableSpan.dataset.path;
            if (spanPath) {
                toggleCellExpansion(spanPath);
                selectCell(spanPath);
            }
            return;
        }

        // determine primitive target: either the clicked element or a child span
        let prim = e.target.closest('.primitive');
        const cell = e.target.closest('.sheet-cell');
        if (!prim && cell) {
            prim = cell.querySelector('.primitive');
        }
        if (prim && prim.dataset.path) {
            // start editing the primitive value
            selectCell(prim.dataset.path.split(':').slice(0,2).join(':'));
            // remember previous text so we can avoid unnecessary work
            prim.dataset.originalValue = prim.innerText.trim();
            prim.setAttribute('contenteditable', 'true');
            prim.focus();
            return;
        }

        // otherwise behave normally (select the cell)
        if (!cell || cell.parentElement.classList.contains('sheet-header')) return;
        const path = cell.dataset.path;
        if (!path) return;
        selectCell(path);
    });
    
    // editing behavior: start on double-click, commit on blur or Enter
    sheetGridEl.addEventListener('dblclick', e => {
        const prim = e.target.closest('.primitive');
        const cell = e.target.closest('.sheet-cell');
        const target = prim || cell;
        if (!target) return;

        // only edit primitives (not expandable spans)
        const path = target.dataset.path;
        if (!path) return;

        target.dataset.originalValue = target.innerText.trim();
        target.setAttribute('contenteditable', 'true');
        target.focus();
        // select all text for convenience
        document.execCommand('selectAll', false, null);
    });

    sheetGridEl.addEventListener('blur', e => {
        const tgt = e.target.closest('[contenteditable]');
        if (tgt && tgt.dataset.path) {
            handleCellEdit({target: tgt});
            tgt.removeAttribute('contenteditable');
        }
    }, true);

    sheetGridEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.isContentEditable) {
            e.preventDefault();
            e.target.blur();
        }
    });

    sheetGridEl.addEventListener('mousemove', e => {
        const row = e.target.closest('.sheet-row');
        if (row) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom - e.clientY < 6) {
                row.style.cursor = 'row-resize';
            } else {
                row.style.cursor = '';
            }
        }
    });

    // when a nested section finishes expanding via animation, ensure layout adjusts
    sheetGridEl.addEventListener('animationend', e => {
        if (e.animationName === 'expandDown') {
            autoResizeColumns();
            adjustRowHeightAfterExpand();
        }
    });

    // grid text selection should highlight matching editor text
    sheetGridEl.addEventListener('mouseup', () => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const text = sel.toString().trim();
            if (text) {
                highlightGridForText(text);
                highlightEditorForText(text);
            }
        }
    });

    sheetGridEl.addEventListener('keydown', function(e) {
        if (e.target.classList.contains('sheet-cell') && e.target.isContentEditable) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            }
        }
    });
    
    copyJsonBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(documentos, null, 2));
        alert('JSON copiado!');
    });

    // editor selection highlighting
    if (jsonEditorTextarea) {
        jsonEditorTextarea.addEventListener('select', () => {
            const sel = jsonEditorTextarea.value.substring(jsonEditorTextarea.selectionStart, jsonEditorTextarea.selectionEnd).trim();
            if (sel) {
                highlightGridForText(sel);
            } else {
                clearSelectionHighlights();
            }
        });

        jsonEditorTextarea.addEventListener('click', () => {
            // clicking the editor should cancel previous highlights if nothing selected
            setTimeout(() => {
                if (jsonEditorTextarea.selectionStart === jsonEditorTextarea.selectionEnd) {
                    clearSelectionHighlights();
                }
            }, 10);
        });

        // when user leaves editor, attempt to sync its contents to the grid
        // remember last synced value to avoid unnecessary re-renders
        let lastEditorValue = jsonEditorTextarea.value;
        jsonEditorTextarea.addEventListener('blur', () => {
            const current = jsonEditorTextarea.value;
            if (current !== lastEditorValue) {
                const resultado = validarEditorJson();
                if (resultado) {
                    setDocumentos(resultado, true);
                    lastEditorValue = current;
                }
            }
        });
    }

    // any click outside the grid and editor clears text highlights
    document.addEventListener('click', e => {
        if (!sheetGridEl.contains(e.target) && e.target !== jsonEditorTextarea) {
            clearSelectionHighlights();
        }
    });

    // handle grid row resize via mouse events
    sheetGridEl.addEventListener('mousedown', e => {
        // if we're already starting a column resize, skip
        if (resizing) return;
        const row = e.target.closest('.sheet-row');
        if (row) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom - e.clientY < 6) {
                pendingRow = true;
                resizingRow = false;
                currentRow = row;
                startY = e.clientY;
                startHeight = row.offsetHeight;
                e.preventDefault();
            }
        }
    });

    document.addEventListener('mousemove', e => {
        if (pendingRow || resizingRow) {
            if (!resizingRow && pendingRow) {
                const diff = Math.abs(e.clientY - startY);
                if (diff > 3) {
                    resizingRow = true;
                    pendingRow = false;
                    startHeight = startHeight + (e.clientY - startY);
                    startY = e.clientY;
                    document.body.style.cursor = 'row-resize';
                } else {
                    return;
                }
            }
            if (resizingRow && currentRow) {
                const diff = e.clientY - startY;
                const newHeight = Math.max(24, startHeight + diff);
                currentRow.style.height = newHeight + 'px';
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (resizingRow || pendingRow) {
            resizingRow = false;
            pendingRow = false;
            currentRow = null;
            document.body.style.cursor = '';
        }
    });

    // panel splitters
    const verticalSplitter = document.querySelector('.splitter.vertical');
    const editorPanel = document.querySelector('.editor-panel');
    const gridPanel = document.querySelector('.grid-panel');

    if (verticalSplitter && editorPanel) {
        let isDraggingV = false;
        let pendingV = false;
        let startXv = 0;
        let startWidth = 0;
        const THRESHOLD = 12; // px to move before resizing begins

        verticalSplitter.addEventListener('mousedown', e => {
            pendingV = true;
            isDraggingV = false;
            startXv = e.clientX;
            startWidth = editorPanel.offsetWidth;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!pendingV && !isDraggingV) return;
            const diff = e.clientX - startXv;

            if (!isDraggingV && pendingV) {
                if (Math.abs(diff) > THRESHOLD) {
                    // account for movement beyond threshold
                    isDraggingV = true;
                    pendingV = false;
                    // increase startWidth by diff so no jump occurs
                    startWidth = startWidth + diff;
                    startXv = e.clientX;
                    document.body.style.cursor = 'col-resize';
                } else {
                    return;
                }
            }

            if (isDraggingV) {
                const parentW = editorPanel.parentElement.offsetWidth || 0;
                let newWidth = startWidth + (e.clientX - startXv);
                newWidth = Math.max(150, Math.min(parentW - 150, newWidth));
                editorPanel.style.flexBasis = newWidth + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingV || pendingV) {
                isDraggingV = false;
                pendingV = false;
                document.body.style.cursor = '';
            }
        });
    }


    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

// ========== INICIALIZAÇÃO ==========
function init() {
        // Tutorial inicial para novos usuários
        if (!localStorage.getItem('gradeJsonTutorialShown')) {
            showTutorial();
            localStorage.setItem('gradeJsonTutorialShown', '1');
        }
    loadFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => onLoadFiles(e.target.files));
    addSampleBtn.addEventListener('click', carregarExemplo);
    clearAllBtn.addEventListener('click', limparGrid);
    exportJsonBtn.addEventListener('click', exportarJson);
    
    formatEditorBtn.addEventListener('click', formatarEditorJson);
    validateEditorBtn.addEventListener('click', validarEditorJson);
    syncFromEditorBtn.addEventListener('click', sincronizarDoEditor);
    
    const beautifyEditorBtn = document.getElementById('beautifyEditorBtn');
    if (beautifyEditorBtn) {
        beautifyEditorBtn.addEventListener('click', beautifyEditorJson);
    }
    
    
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) {
            await onLoadFiles(e.dataTransfer.files);
        }
    });
    
    initTheme();
    
    const autoResizeBtn = document.getElementById('autoResizeBtn');
    if (autoResizeBtn) {
        autoResizeBtn.addEventListener('click', autoResizeColumns);
    }
    
    carregarExemplo();
    attachEventListeners();
    // Botão tutorial manual
    const tutorialBtn = document.getElementById('tutorialBtn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', showTutorial);
    }
}

// Exibe tutorial inicial
function showTutorial() {
    const steps = [
        {
            selector: '#loadFileBtn',
            text: 'Carregue um arquivo JSON clicando aqui.'
        },
        {
            selector: '#formatEditorBtn',
            text: 'Formate o JSON para melhor leitura.'
        },
        {
            selector: '#exportJsonBtn',
            text: 'Exporte o JSON editado para seu computador.'
        },
        {
            selector: '#copyJsonBtn',
            text: 'Copie o JSON para a área de transferência.'
        }
    ];
    let current = 0;
    let toast, blockOverlay;
    function showStep(idx) {
        // Remove elementos anteriores
        if (toast) toast.remove();
        if (blockOverlay) blockOverlay.remove();
        const step = steps[idx];
        const el = document.querySelector(step.selector);
        if (!el) return;
        // Overlay transparente para bloquear interação
        blockOverlay = document.createElement('div');
        blockOverlay.className = 'tutorial-block-overlay';
        document.body.appendChild(blockOverlay);
        // Toast explicativo
        const rect = el.getBoundingClientRect();
        toast = document.createElement('div');
        toast.className = 'tutorial-toast';
        // Posiciona o toast próximo ao elemento
        let toastTop = rect.bottom + 24;
        let toastLeft = rect.left;
        let arrowHtml = '<div class="tutorial-toast-arrow"></div>';
        // Para o botão copiar json, seta para baixo
        let arrowClass = '';
        if (step.selector === '#copyJsonBtn') {
            toastTop = rect.top - 120;
            arrowClass = ' tutorial-toast-arrow-down';
        } else if (toastTop + 120 > window.innerHeight) {
            toastTop = rect.top - 120;
        }
        if (toastLeft + 340 > window.innerWidth) toastLeft = window.innerWidth - 360;
        toast.style.top = toastTop + 'px';
        toast.style.left = toastLeft + 'px';
        toast.innerHTML = `<div class="tutorial-toast-arrow${arrowClass}"></div>${step.text}`;
        document.body.appendChild(toast);
        // Avança ao clicar em qualquer lugar
        blockOverlay.onclick = toast.onclick = () => {
            if (current < steps.length - 1) {
                current++;
                showStep(current);
            } else {
                toast.remove();
                blockOverlay.remove();
            }
        };
    }
    showStep(current);
}

document.addEventListener('DOMContentLoaded', init);