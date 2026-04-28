# TODO - AJAX AI Agent Fix & Implement

## Phase 1: Fix Blockers (CRÍTICO)
- [x] Criar TODO.md
- [x] Fix backend/requirements.txt - Remover emergentintegrations
- [x] Update frontend/package.json - Adicionar react-icons, framer-motion
- [x] Fix frontend/public/index.html - Importar JetBrains Mono + IBM Plex Sans
- [x] Fix frontend/tailwind.config.js - Cores customizadas terminal
- [x] Fix frontend/src/index.css - Variáveis CSS tema terminal
- [x] Fix frontend/src/App.css - Remover CSS padrão CRA
- [x] Fix frontend/src/App.js - Corrigir rotas + estrutura base
- [x] Fix frontend/jsconfig.json - Adicionar ignoreDeprecations
- [x] Instalar dependências (yarn install, pip install)


## Phase 2: Componentes Core
- [x] Criar layout 3-painéis no App.js
- [x] Criar interface de chat estilo CLI/Terminal
- [x] Criar cards de integração (Gmail, WA, IG, X) com react-icons
- [x] Criar painel de histórico lateral
- [x] Criar Code Sandbox básico
- [x] Criar Header com status do sistema
- [x] Criar componentes separados em arquivos individuais (refatoração)


## Phase 3: Design Terminal
- [x] Aplicar tema escuro por padrão (class="dark" no html)
- [x] Ajustar cores Tailwind para tema terminal
- [x] Adicionar fontes JetBrains Mono e IBM Plex Sans
- [x] Adicionar data-testid nos componentes principais
- [x] Adicionar animações framer-motion avançadas
- [x] Ajustar componentes shadcn (bordas quadradas)


## Phase 4: Testes
- [x] Atualizar test_result.md
- [x] Rodar backend (uvicorn) - ✅ Rodando na porta 8000
- [x] Rodar frontend (yarn start) - ✅ Compilado com sucesso na porta 3000
- [x] Verificar integração frontend + backend - ✅ CORS OK, /api/health respondendo, fallback in-memory ativo (MongoDB offline)
