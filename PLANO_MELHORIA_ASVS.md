# Plano de Melhoria — Kuryos ERP
## Análise completa + Auditoria ASVS 5.0

> Gerado em 2026-07-01. Cobre backend (FastAPI + Motor/MongoDB), frontend (React) e infraestrutura.

---

## Índice

1. [Auditoria de Segurança ASVS 5.0](#1-auditoria-de-segurança-asvs-50)
2. [Lacunas de Regra de Negócio por Módulo](#2-lacunas-de-regra-de-negócio-por-módulo)
3. [Problemas de Performance](#3-problemas-de-performance)
4. [Qualidade de Código e Manutenibilidade](#4-qualidade-de-código-e-manutenibilidade)
5. [Roadmap Priorizado](#5-roadmap-priorizado)

---

## 1. Auditoria de Segurança ASVS 5.0

Legenda de severidade: 🔴 **CRÍTICO** | 🟠 **ALTO** | 🟡 **MÉDIO** | 🟢 **BAIXO/INFO**

### V2 — Autenticação

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-01 | 🔴 | V2.1.1 L1 | `server.py:1883` | `ADMIN_PASSWORD` padrão é `"admin123"` e `ROLE_USERS_PASSWORD` padrão é `"kuryos123"`. Qualquer deploy sem essas env vars sobe com senhas trivialmente adivináveis para TODOS os usuários seed. | Remover os defaults: `os.environ["ADMIN_PASSWORD"]` (KeyError força a definição) ou gerar senha aleatória forte na primeira execução e imprimir UMA vez no log. |
| S-02 | 🔴 | V2.1.1 L1 | `server.py:1225` | Senha de usuário comum tem mínimo de 6 caracteres sem regra de complexidade. | Impor mínimo 12 caracteres + pelo menos 1 número + 1 símbolo em `ChangePasswordInput`. |
| S-03 | 🔴 | V2.2.1 L1 | `server.py:382` | `/auth/login` não tem rate limiting. Um atacante pode testar milhões de senhas sem bloqueio. | Adicionar `slowapi` (ou middleware próprio) com limite de 10 tentativas / 60 s por IP. Após 5 falhas consecutivas para o mesmo e-mail, bloquear a conta por 15 min e enviar e-mail de alerta. |
| S-04 | 🟠 | V2.1.7 L1 | `server.py` | Não há verificação se a senha escolhida pelo usuário aparece em listas de vazamentos conhecidos. | Integrar com a API HaveIBeenPwned (k-anonymity) no momento da troca de senha. |
| S-05 | 🟠 | V2.2.2 L1 | `server.py` | Sem suporte a MFA (TOTP/FIDO2). | Adicionar endpoint `/auth/totp/setup` e `/auth/totp/verify`; flag `mfa_enabled` no usuário. |
| S-06 | 🟡 | V2.1.9 L1 | `server.py:1170` | Senha temporária gerada como `f"Kuryos{uuid.uuid4().hex[:6]}!"` — apenas ~16 milhões de combinações. | Usar `secrets.token_urlsafe(16)` que gera ~85 bits de entropia. |

### V3 — Gerenciamento de Sessão

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-07 | 🔴 | V3.2.2 L1 | `server.py:420` | `/auth/refresh` define o cookie `access_token` com `secure=False` e `samesite="lax"` **hardcoded**, ignorando se o ambiente é produção. O cookie de acesso trafega em texto claro sobre HTTP. | Usar a mesma função `set_auth_cookies()` que já lê `IS_PRODUCTION`. Nunca setar `secure=False` fora de desenvolvimento local. |
| S-08 | 🟠 | V3.4.2 L1 | `server.py:407-425` | O refresh token antigo **não é invalidado** após a emissão de um novo access token. Um token comprometido continua válido pelos 7 dias inteiros. | Implementar token family rotation: guardar `refresh_token_id` no DB, invalidar o anterior a cada uso. Detectar reuso de token revogado como possível session hijack. |
| S-09 | 🟠 | V3.5.2 L1 | `server.py` | Sem blacklist de tokens. Logout apenas deleta o cookie no cliente, mas o token continua matematicamente válido até expirar. | Manter uma coleção `revoked_tokens` com TTL index = expiração do token. Verificar na `get_current_user`. |
| S-10 | 🟡 | V3.4.3 L2 | `server.py` | Cookie de refresh não tem atributo `Path=/api/auth/refresh` — é enviado para todas as rotas `/api/*`, aumentando superfície de ataque. | Definir `path="/api/auth/refresh"` no refresh cookie. |

### V4 — Controle de Acesso

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-11 | 🔴 | V4.1.2 L1 | `server.py:~WebSocket` | WebSocket `ws/{tenant_id}` aceita conexões sem verificar token JWT. Qualquer pessoa que conheça um `tenant_id` válido pode escutar eventos em tempo real. | Exigir query param `?token=<access_jwt>` na abertura do WebSocket; verificar e validar antes de adicionar ao grupo. |
| S-12 | 🟡 | V4.2.1 L1 | `server.py:442` | `get_board` busca stages com `{"pipeline_id": pipeline_id}` sem filtro `tenant_id`. Um pipeline_id de outro tenant retornaria stages corretos mas cards vazios — exposição parcial de metadados. | Adicionar `"tenant_id": user["tenant_id"]` em todas as queries de stages/fields. |

### V5 — Validação e Sanitização de Input

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-13 | 🟠 | V5.1.3 L1 | `validation_utils.py:48` | `clean_text` só faz `.strip()`. Campos como `nome_cliente`, `descricao`, `observacoes` são salvos no MongoDB e renderizados no frontend sem sanitização de HTML/script. | Usar `bleach.clean(text, tags=[], strip=True)` para campos de texto puro. Para campos que admitem formatação limitada, whitelist de tags seguras. |
| S-14 | 🟠 | V5.2.3 L1 | `server.py:1560-1575` | Exportação Excel escreve dados do usuário diretamente em células sem escape. Campos como `nome_cliente` podem conter fórmulas (`=CMD("...")`), causando CSV/Excel injection. | Prefixar células com `'` quando o valor começa com `=`, `+`, `-`, `@`. Use `openpyxl` com tipo `datatype="s"` explícito. |
| S-15 | 🟡 | V5.3.3 L1 | `server.py:1525` | Nome do arquivo PDF gerado como `proposta_{card['nome_cliente'].replace(' ','_')}.pdf`. Se `nome_cliente` contiver `"` ou `\n`, o header `Content-Disposition` pode ser injetado. | Sanitizar com regex `re.sub(r'[^a-zA-Z0-9_\-]', '', nome)` antes de usar no header. |
| S-16 | 🟡 | V5.3.3 L1 | `server.py:1478-1481` | PDF usa `Paragraph(f"<b>Nome:</b> {card['nome_cliente']}", ...)`. ReportLab processa XML/markup, então um `nome_cliente` como `<font color="red">` altera o PDF. | Escapar com `from xml.sax.saxutils import escape` antes de interpolar em strings de Paragraph. |

### V6 — Criptografia

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-17 | 🔴 | V6.4.1 L1 | `server.py:102` | `JWT_SECRET` tem fallback `"dev-only-change-me"`. Um deploy sem a env var assina todos os tokens com uma chave pública conhecida — qualquer pessoa pode forjar tokens. | Remover o default completamente: `JWT_SECRET = os.environ["JWT_SECRET"]` — a aplicação não deve subir sem essa chave. Acrescentar validação de tamanho mínimo (≥ 32 bytes). |
| S-18 | 🟡 | V6.2.2 L2 | `server.py:105` | Algoritmo HS256 (simétrico). Para multi-tenant com possível separação de chaves por tenant no futuro, RS256/ES256 seria mais flexível. | Baixa prioridade agora, mas documentar para considerar na v2. |

### V7 — Tratamento de Erros e Logging

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-19 | 🔴 | V7.1.2 L1 | `server.py:1194` | `logger.info(f"User invited: {email} with temp password: {temp_password}")` — senha em texto claro nos logs. Logs geralmente são indexados, retidos por meses, e acessados por mais pessoas que o código. | Remover o password do log. Logar apenas `f"User invited: {email}"`. |
| S-20 | 🔴 | V7.2.1 L1 | `server.py:1195` | `"temp_password": temp_password` retornado na resposta da API. Qualquer interceptação HTTP (proxy, CDN log) captura a senha. | Enviar a senha temporária apenas por e-mail transacional (fora de banda). O endpoint retorna apenas `{"message": "Convite enviado para {email}"}`. |
| S-21 | 🟡 | V7.4.1 L1 | `server.py` | FastAPI por padrão retorna stack traces em `422 Unprocessable Entity` com detalhes de validação que podem expor estrutura interna. | Adicionar handler global para filtrar detalhes em produção: `@app.exception_handler(RequestValidationError)`. |

### V8 — Proteção de Dados

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-22 | 🟠 | V8.3.4 L2 | `server.py:1940-1948` | Credenciais de todos os usuários seed são escritas em arquivo Markdown em `backend/memory/credentials.md` em texto claro. | Remover essa funcionalidade de persistência de credenciais. Em ambiente de desenvolvimento, usar apenas o `.env` ou imprimir uma única vez no console. Nunca no filesystem. |
| S-23 | 🟡 | V8.2.1 L1 | `server.py` | Sem política explícita de retenção de dados. Audit logs crescem indefinidamente. | Adicionar TTL index no MongoDB para `audit_logs` (ex: 1 ano) e documentar política. |

### V9 — Comunicações

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-24 | 🟠 | V9.1.1 L1 | `server.py:420` | Cookies sem `Secure=True` em produção permitem sessão via HTTP. Já parcialmente coberto por S-07 mas vale repetir: `set_auth_cookies` precisa garantir `secure=IS_PRODUCTION`. | Corrigir `set_auth_cookies` para sempre usar `secure=True` quando `IS_PRODUCTION=true`. |

### V14 — HTTP Security

| # | Severidade | Controle ASVS | Arquivo / Linha | Problema | Correção |
|---|-----------|---------------|-----------------|----------|----------|
| S-25 | 🔴 | V14.4.4 L1 | `server.py` | **Sem proteção CSRF**. A auth por cookie (sem CSRF token) torna todos os endpoints mutantes vulneráveis a Cross-Site Request Forgery. Um `<form action="https://api.kuryos.com/api/auth/...">` num site malicioso enviaria cookies automaticamente. | Implementar Double Submit Cookie Pattern ou usar `SameSite=Strict` em todos os cookies (implica ajuste de CORS). Alternativa: exigir header `X-Requested-With: XMLHttpRequest` e validar origin. |
| S-26 | 🟠 | V14.4.6 L1 | `server.py` | Sem security headers na resposta: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. | Adicionar middleware de security headers. Em FastAPI: usar `starlette-security-headers` ou implementar manualmente no middleware HTTP. |
| S-27 | 🔴 | V14.6.1 L1 | `server.py` | **Sem rate limiting em nenhum endpoint.** Além do login (S-03), endpoints de convite de usuário, reset de senha, upload de arquivo e exportação de Excel são vulneráveis a abuso. | Adicionar `slowapi` com limites distintos por rota: auth = 10/min, API normal = 200/min, exportação = 5/min. |

---

## 2. Lacunas de Regra de Negócio por Módulo

### 2.1 — P&D (pd_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-01 | 🟠 | PD / Estabilidade | A gate de D48h (adicionada no fix recente) só verifica ao mover para `WAITING_APPROVAL`. Se o usuário inserir uma leitura de estabilidade e depois deletar, a gate não revalida. Também não há gate para D30 antes de `APPROVED`. | Considerar gate D30 antes de `APPROVED`. Verificar também se a leitura de D48h deletada invalida o status. |
| B-02 | 🟡 | PD / Fórmula | Após `APPROVED`, a fórmula vinculada ao pd_request ainda pode ser editada. Não há lock de versão. | Ao entrar em `APPROVED`, salvar snapshot `formula_snapshot` dentro do pd_request. Impedir edições na fórmula se pd_request estiver em APPROVED/COMPLETED. |
| B-03 | 🟡 | PD / Lotes | `SampleBatchEditor` não valida quantidade máxima de variantes por lote (pode gerar dezenas). | Limitar a 10 variantes por lote no frontend e validar no backend no endpoint `POST /pd/requests/{id}/sample-batches`. |
| B-04 | 🟡 | PD / Catálogo | Catálogo PD não tem controle de versão de ingredientes. Se um ingrediente tem sua composição alterada, fórmulas antigas apontam para o novo estado sem histórico. | Adicionar campo `version` no catálogo e manter histórico de versões com `effective_from`. |
| B-05 | 🟢 | PD / Kanban | `transition_status` move o card no kanban, mas se o card for movido manualmente no kanban, `pd_request.status` não é sincronizado. Os dois podem divergir. | Ao mover card manualmente no kanban, chamar `PATCH /pd/requests/{id}/status` automaticamente, ou adicionar aviso visual de divergência. |

### 2.2 — CRM (crm_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-06 | 🟠 | CRM / PD Card | `_create_pd_card_for_variacao` cria pd_card sem `pd_request_id`. O pd_request é criado lazily via `_ensure_pd_request_for_card` quando o card é acessado pela primeira vez. Se o card nunca for aberto pelo usuário (ex: visualização somente em lista), o pd_request nunca é criado e o pipeline P&D não é iniciado. | Criar o pd_request no momento de criação do card, não lazily. Ou exibir badge de alerta visual no card quando `pd_request_id` está ausente. |
| B-07 | 🟡 | CRM / Stages | Stages da query `get_board` (linha 442) não filtram por `tenant_id`. Embora isolados por `pipeline_id` (que pertence ao tenant), é uma dependência frágil. | Adicionar `"tenant_id": user["tenant_id"]` como segunda condição em todas queries de stages. |
| B-08 | 🟡 | CRM / Excel | Exportação Excel `GET /reports/excel` carrega até 5.000 cards e 10.000 produtos em memória antes de gerar o arquivo. Sem paginação ou streaming. | Usar `openpyxl` em modo write-only com streaming, ou gerar o arquivo em background task e notificar via WebSocket. |
| B-09 | 🟢 | CRM / Pipeline | Não há histórico de movimentação de stage para cards do pipeline CRM (diferente de pd_cards que têm audit). | Usar `workflow_engine.audit_log` ao mover cards entre stages. |

### 2.3 — Compras (compras_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-10 | 🟠 | Compras / MRP | MRP gera sugestões de compra mas não há geração automática de PO a partir dessas sugestões. Usuário precisa criar a PO manualmente baseado no MRP. | Adicionar botão "Gerar PO a partir do MRP" que converte sugestões selecionadas em rascunho de PO. |
| B-11 | 🟡 | Compras / Recebimento | Ao receber mercadoria, não há validação se a quantidade recebida excede a quantidade da PO original. Over-delivery não é detectado. | Comparar `quantidade_recebida` com `quantidade_pedida` na PO; bloquear ou alertar se ultrapassar 5% de tolerância. |
| B-12 | 🟡 | Compras / Homologação | Fornecedor pode ser desvincuado de um item no catálogo P&D sem verificar se há POs abertas para esse par fornecedor-item. | Verificar POs abertas antes de permitir a remoção do fornecedor do catálogo. |
| B-13 | 🟢 | Compras / Cotação | Sem fluxo de aprovação de cotação. Cotação aprovada por quem criou (sem segregação de função). | Adicionar step de aprovação separado por usuário com role `compras` ou `admin`. |

### 2.4 — Qualidade (cq_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-14 | 🟠 | CQ / RNC | RNC sem prazo de tratamento definido. Pode ficar em "aberta" indefinidamente sem notificação. | Adicionar `data_limite_resolucao` obrigatória ao criar RNC; cron ou workflow task que move para "em_atraso" se vencer. |
| B-15 | 🟡 | CQ / Checklist | Checklist preenchido não bloqueia progressão de OP se reprovado. Não há integração CQ → PCP. | Integrar resultado de checklist com status da OP: reprovação gera RNC automaticamente e bloqueia avanço da OP. |
| B-16 | 🟡 | CQ / Retenção | Retenção não tem alerta de vencimento de prazo de guarda. | Workflow task automática D-7 antes do vencimento. |

### 2.5 — PCP / Ordens de Produção (pcp_routes.py / orders_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-17 | 🟠 | PCP | Não há verificação de disponibilidade de estoque ao criar OP. OP pode ser criada mesmo sem MP disponível. | Ao criar OP, verificar `estoque_atual >= quantidade_necessaria` para cada MP da fórmula; alertar ou bloquear. |
| B-18 | 🟡 | PCP | Sem cálculo de capacidade produtiva. Múltiplas OPs podem ser agendadas para o mesmo período sem validação de capacidade. | Adicionar calendário de capacidade por linha de produção. |
| B-19 | 🟡 | Pedidos | Pedido aprovado não reserva automaticamente estoque ou dispara OP. Fluxo pedido → OP é manual. | Ao aprovar pedido, criar rascunho de OP ou pelo menos notificar PCP via workflow task. |

### 2.6 — Faturamento / Expedição

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-20 | 🟠 | Faturamento | Duplicatas não têm atualização automática de status para "vencida". A query do dashboard conta vencidas pelo campo `status`, mas alguém precisa chamar um endpoint de atualização. Se ninguém chamar, o status fica desatualizado. | Adicionar um campo `data_vencimento` indexado e calcular status on-the-fly na query, ou criar um cron (APScheduler) que atualiza status de duplicatas vencidas diariamente. |
| B-21 | 🟡 | Expedição | Expedição não bloqueia envio se NF não foi emitida. | Verificar existência de NF aprovada antes de permitir registro de expedição. |

### 2.7 — Kickoff (kickoff_routes.py)

| # | Severidade | Módulo | Problema | Correção |
|---|-----------|--------|----------|----------|
| B-22 | 🟡 | Kickoff | Kickoff aprovado não dispara automaticamente a criação do pd_card no pipeline P&D. Conexão é manual. | Ao aprovar kickoff, criar pd_card automaticamente via `_create_pd_card_for_variacao` se ainda não existir. |

---

## 3. Problemas de Performance

| # | Severidade | Arquivo / Linha | Problema | Correção |
|---|-----------|-----------------|----------|----------|
| P-01 | 🔴 | `server.py:1627-1635` | Dashboard carrega todos os IDs de cards em memória (`to_list(5000)`), depois faz query `$in` separada para histórico e produtos. N+1 latente. | Usar aggregation pipeline com `$lookup` para juntar em uma query só. |
| P-02 | 🟠 | `server.py:1565` | Excel export faz `db.cards.find(...).to_list(5000)` + `db.card_products.find(...).to_list(10000)` — carrega tudo em RAM. Em produção com dados reais isso pode consumir centenas de MB. | Usar cursor iterator em vez de `to_list`, gerar Excel em stream (openpyxl write-only mode). |
| P-03 | 🟠 | MongoDB (geral) | Não há índices explícitos criados para as coleções principais. Queries como `find({"tenant_id": tid, "status": "X"})` fazem full collection scan. | Criar índice composto `(tenant_id, status)` para as coleções: `pd_requests`, `pd_cards`, `orders`, `compras_pos`, `cq_rncs`, `cards`, `audit_logs`. |
| P-04 | 🟡 | `workflow_engine.py:138` | `next_sequence` usa `find_one_and_update` com `upsert=True` — correto para atomicidade, mas não há índice em `_id` extra (MongoDB garante isso por padrão). OK por ora. | Nenhuma ação imediata, mas documentar o uso de `counters` collection. |
| P-05 | 🟡 | `server.py:1669` | `erp_overview` faz 35+ queries paralelas com `asyncio.gather`. Se o banco estiver sob carga, pode saturar o pool de conexões. | Verificar `Motor connection pool size` (padrão 100) e ajustar `maxPoolSize` no URI do MongoDB. |

---

## 4. Qualidade de Código e Manutenibilidade

| # | Arquivo | Problema | Correção |
|---|---------|----------|----------|
| Q-01 | `server.py:1149-1151` | Código morto: `return message` seguido de `await db.messages.insert_one(...)` e segundo `return {...}` nunca executados. | Remover as linhas mortas. |
| Q-02 | `server.py` | `seed_admin` recria senha admin se env var mudar (`verify_password(admin_password, ...)`). Em produção isso significa que toda reinicialização pode sobrescrever senha do admin. | Remover a lógica de "atualizar senha se mudou" no seed. Seed só cria se não existir. |
| Q-03 | `server.py:1940` | Credenciais em arquivo Markdown — já coberto em S-22, mas também é problema de manutenibilidade (o arquivo pode ser commitado por engano). | Adicionar `backend/memory/` ao `.gitignore`. |
| Q-04 | `pd_routes.py` | Arquivo com ~6200 linhas. Monolito que dificulta review e teste. | Refatorar em sub-roteadores: `pd_formulas.py`, `pd_catalog.py`, `pd_stability.py`, `pd_samples.py`, `pd_kanban.py`. |
| Q-05 | `crm_routes.py` | Similar ao Q-04. | Dividir em `crm_clients.py`, `crm_projects.py`, `crm_samples.py`, `crm_pipeline.py`. |
| Q-06 | `workflow_engine.py:56` | `TASK_CATEGORY_ROLES` mapeia categorias para `"gestor"` que foi renomeado para `"lider_pd"` (rbac.py usa `LEGACY_ALIASES`). O alias funciona, mas o código de configuração usa o nome antigo. | Atualizar para `"lider_pd"` diretamente. |
| Q-07 | Frontend | `PDDetail.js` tem ~7000 linhas. Impossível de testar e manter. | Extrair componentes: `SampleBatchEditor`, `StabilityStudyPanel`, `FormulaEditor`, `KanbanCard`, `PDRequestHeader` em arquivos separados. |
| Q-08 | Frontend | Não há testes unitários no frontend. | Adicionar Vitest + React Testing Library para componentes críticos (SampleBatchEditor, RoleGuard). |
| Q-09 | Backend | Cobertura de testes parcial. `test_e2e_10clients_senior.py` e `test_erp_v3_workflow.py` cobrem fluxos principais, mas CQ, Compras e Faturamento não têm testes. | Adicionar testes para os módulos descobertos. |

---

## 5. Roadmap Priorizado

### Sprint 1 — Segurança Crítica (fazer antes do próximo acesso de cliente real)

1. **S-17** — Remover fallback de JWT_SECRET. Aplicação não sobe sem a env var.
2. **S-01** — Remover defaults de ADMIN_PASSWORD e ROLE_USERS_PASSWORD.
3. **S-19 + S-20** — Remover senha do log e da resposta da API de convite.
4. **S-07** — Corrigir `set_auth_cookies` para usar `secure=IS_PRODUCTION`.
5. **S-25** — CSRF: adicionar `SameSite=Strict` nos cookies e/ou Double Submit Cookie.
6. **S-11** — WebSocket: exigir token JWT na conexão.
7. **S-27** — Rate limiting com `slowapi` em `/auth/login`, `/auth/register`, `/users/invite`.

### Sprint 2 — Segurança Alta + Performance Base

8. **S-03** — Account lockout após 5 tentativas de login.
9. **S-22** — Remover escrita de credenciais em arquivo; adicionar `backend/memory/` ao `.gitignore`.
10. **S-26** — Security headers (CSP, X-Frame-Options, X-Content-Type-Options).
11. **S-13** — Sanitizar campos de texto livre com `bleach`.
12. **S-14** — Proteção contra Excel injection na exportação.
13. **P-03** — Criar índices MongoDB para coleções principais.
14. **P-01** — Refatorar query do dashboard para usar aggregation pipeline.

### Sprint 3 — Regras de Negócio Críticas

15. **B-01** — Gate D30 antes de `APPROVED` no pipeline P&D.
16. **B-02** — Lock de fórmula após `APPROVED`.
17. **B-06** — Criar pd_request junto com pd_card (não lazy).
18. **B-17** — Verificar estoque disponível ao criar OP.
19. **B-20** — Atualização automática de status de duplicatas vencidas (cron ou computed field).
20. **B-14** — Prazo obrigatório para RNC + notificação automática.

### Sprint 4 — Manutenibilidade e Features

21. **Q-01** — Remover código morto em `server.py`.
22. **Q-04 + Q-05** — Começar refatoração de `pd_routes.py` e `crm_routes.py` em sub-módulos.
23. **Q-07** — Extrair componentes do `PDDetail.js`.
24. **B-10** — Geração de PO a partir de sugestões do MRP.
25. **B-15** — Integração CQ checklist → bloqueio de OP.
26. **B-22** — Kickoff aprovado → criação automática de pd_card.
27. **S-08** — Refresh token rotation com revogação automática.
28. **S-05** — MFA (TOTP) — pré-requisito para clientes enterprise.

---

*Total: 27 itens de segurança (ASVS V2-V14) + 22 lacunas de negócio + 5 problemas de performance + 9 de qualidade.*
*Itens marcados 🔴 devem ser resolvidos antes de qualquer cliente em produção.*
