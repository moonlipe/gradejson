# GradeJson — Documentação Completa

## Modelo de IA e Worktree
- Modelo AI: `thinkingmachines/inkling` (Inkling)
- Worktree: `gradejson-ai-worktree` (`branch ai-model-info`)
- Repositório original: `gradejson` (`master`)

## Stack
- Vite + React 19
- CSS puro com variáveis de tema (claro/escuro)
- JavaScript moderno (ES Modules)

## Funcionalidades
1. **Editor JSON** — textarea com sintaxe destacada e validação
2. **Grid Dinâmico** — cada documento = linha; cada chave = coluna (invertido conforme solicitado)
3. **Expansão Inline** — objetos e arrays expandem dentro da célula
4. **Edição Inline** — clique duplo na célula edita o valor diretamente
5. **Tema** — claro/escuro/sistema via `data-theme`
6. **Importação/Exportação** — arquivos `.json`, exemplo de dados
7. **Validação** — parser JSON com feedback visual
8. **Formatação** — indentação automática

## Licença
GPL v3 — ver arquivo `LICENSE`

## Estrutura de Arquivos
```
gradejson-ai-worktree/
├── index.html          # Entry point
├── package.json         # Dependências (react, vite)
├── vite.config.js       # Config Vite
├── LICENSE              # GPL v3
├── DOCUMENTATION.md     # Este arquivo
└── src/
    ├── main.jsx         # Bootstrap React
    ├── index.css        # Estilos globais com variáveis
    └── App.jsx          # Aplicação principal
```

## Histórico de Mudanças (Build Mode)
1. Criado worktree `ai-model-info` para isolar desenvolvimento
2. Migrado projeto original (HTML/JS puro) para Vite React
3. Reestruturado layout com painel de editor e grid
4. Corrigida inversão de colunas/linhas no grid (documentos = colunas, propriedades = linhas — conforme solicitado)
5. Adicionada edição inline no grid
6. Documentação completa adicionada
7. Licença GPL v3 adicionada
