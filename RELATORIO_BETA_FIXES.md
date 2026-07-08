# Relatório — Hotfix Beta Kuryos

Auditoria e correção dos 26 apontamentos do cliente, feitas em 16 commits atômicos (`fix(beta): ...` / `feat(beta): ...`) sobre o branch `master`, a partir do commit `803d1a7` (`soluçõesgustavo`). Cada item abaixo documenta: estado encontrado no código antes de qualquer mudança, o que foi feito, arquivos tocados e como validar manualmente em produção.

**Limitação de ambiente:** este trabalho foi feito sem acesso a um servidor/MongoDB rodando localmente nem às credenciais de um ambiente de staging — não foi possível executar `pytest backend/tests/` de ponta a ponta (os testes existentes são de integração, batem num servidor real via `REACT_APP_BACKEND_URL` e alguns dependem de dados fixos de uma sessão manual anterior). Validações feitas nesta sessão: `python -m py_compile` em todos os arquivos Python tocados (sem erro), checagem de balanceamento de chaves/parênteses em todos os arquivos JS tocados (sem erro), coleta via `pytest --collect-only` do novo arquivo de teste (`test_formula_import.py`, coleta OK). **Recomendação:** rodar `pytest backend/tests/` contra um ambiente de staging antes do deploy em produção, especialmente `test_orders.py`, `test_pd_card_lazy_request.py` e os dois arquivos de teste novos.

## Correções pós-auditoria (2 bugs críticos)

Depois da entrega inicial, foi feita uma auditoria multi-agente (8 ângulos de revisão independentes) sobre todo o diff da sessão. Dois bugs críticos foram encontrados e corrigidos em commits separados:

1. **Gate D48h (B7/B8) nunca encontrava o estudo de estabilidade.** `assert_d48h_stability_ok()` buscava `pd_stability_studies` pelo id real de `pd_cards`, mas o estudo que a aba Testes/Estabilidades realmente cria (`GET /pd/requests/{req_id}/stability-study`) grava `pd_card_id` igual ao **id da requisição**, não ao id do card. Na prática, o gate bloqueava "Entregar ao Comercial" mesmo com leitura D48h registrada, para qualquer requisição vinda de amostra CRM (o caso comum) — regredindo o comportamento que `update_sample` já tinha antes desta rodada de correções. Corrigido buscando diretamente pela chave real (`pd_card_id == pd_request_id`). Arquivo: `backend/pd_routes.py`.
2. **Pedido Direto (A12) ignorava a moeda do SKU.** `create_direct_order` nunca lia `preco_unitario_currency` do SKU nem recebia moeda do front — um produto precificado em US$ virava um item de pedido em R$ com o mesmo valor numérico. Corrigido: `DirectOrderCreate` ganhou `valor_unitario_currency` (com fallback pra moeda do SKU, depois BRL), e o front (`DirectOrderModal.js`) passou a pré-preencher e enviar essa moeda. Arquivos: `backend/orders_routes.py`, `frontend/src/components/DirectOrderModal.js`.

**Validar item 1:** registrar uma leitura D48h numa requisição vinda de amostra CRM, depois tentar "Entregar ao Comercial" (pelo botão da requisição, pelo botão da amostra, ou arrastando o card no board) — deve permitir a entrega, não bloquear com "Estudo de estabilidade não iniciado".
**Validar item 2:** criar um Pedido Direto para um SKU cadastrado com preço em USD — o item do pedido deve ficar registrado em USD, não convertido/tratado como BRL.

Os outros 8 achados da auditoria (severidade menor — banner de qualificação desatualizado após salvar, fallback de categoria removido, `origem` do pedido duplicado como string solta, etc.) não foram corrigidos nesta rodada; ficam para avaliação/priorização.

---

## BLOCO A — Comercial

### A1. CNPJ opcional no cadastro inicial
**Status anterior:** já resolvido. Backend nunca exigiu CNPJ (`_validate_client_payload`/`require_required_fields` em `backend/crm_routes.py` nunca incluiu `cnpj` na lista de campos obrigatórios; `is_valid_cnpj` é importado mas nunca chamado). Front já mostrava "(opcional)" e não tinha `required`.
**Mudança:** nenhuma — apenas confirmado.
**Arquivos:** nenhum.
**Validar:** criar cliente novo deixando CNPJ vazio — deve salvar sem erro.

### A2. Lead de prospecção — só nome da empresa obrigatório na criação
**Status anterior:** parcial. Criação exigia `contato_principal.nome/whatsapp` + `canal_origem` + `categoria_interesse` + `temperatura_lead` + `responsavel_comercial` + `segmento`. O "mecanismo de tarefa bloqueante" citado no briefing não existe no código — era só uma seção de formulário condicionalmente visível, sem qualquer sinalização de pendência.
**Mudança:** criação agora exige só `nome_empresa` (`crm_routes.py`, bloco `require_required_fields`). Os demais 7 campos passam a ser cobrados na transição para "qualificado" (`_validate_client_transition_requirements`, que antes só cobria 4 deles). Nova função `get_missing_qualification_fields()` é a fonte única da regra, exposta via campo `missing_qualification_fields` em `GET /crm/clients` e `GET /crm/clients/{id}`. Front (`CRM1Page.js`): `isNewClientValid` reduzido a só `nome_empresa`; labels dos campos que deixaram de bloquear viram "(para qualificar)" em vez de "*"; badge de aviso no card do Kanban e banner com a lista de campos faltantes dentro do `ClientDetailSheet`.
**Arquivos:** `backend/crm_routes.py`, `frontend/src/pages/CRM1Page.js`.
**Validar:** criar lead só com nome da empresa → deve salvar. Tentar arrastar o card para "Qualificado" sem os demais campos → deve bloquear com mensagem listando o que falta. Preencher os campos e tentar de novo → deve avançar.

### A3. Sigla CLI4 (SKU novo) exposta no front
**Status anterior:** não resolvido — o front só tinha o campo legado CLI3 (3 letras, SKU antigo `CAT2-CLI3-SEQ`). O backend já tinha toda a infraestrutura do SKU novo (`CAT3-CLI4-SEQ`) pronta havia tempo (campo `cli4`, endpoint `GET /clients/suggest-cli4`, congelamento após 1º SKU, detecção de conflito — tudo R23), mas nada no front usava isso.
**Mudança:** novo componente `Cli4Field` (criação e edição de cliente): máscara de 4 letras maiúsculas, botão "Sugerir" que consulta o endpoint existente e mostra candidatos com disponibilidade, estado "congelado" (somente leitura, com cadeado) quando `cli4_congelado=true`.
**Arquivos:** `frontend/src/components/Cli4Field.js` (novo), `frontend/src/pages/CRM1Page.js`.
**Achado fora de escopo (documentado, não implementado):** o cadastro de categorias CAT3 (`db.categorias`, com fluxo de aprovação solicitação→admin) **não tem nenhuma tela no front** — só pode ser criado hoje via migration/DB direto. Recomendo tratar como ticket próprio, do tamanho de A12/B13.
**Validar:** abrir um cliente existente sem CLI4 → campo aparece vazio, digitar 4 letras ou clicar "Sugerir" → escolher uma sugestão disponível → salvar. Tentar usar um CLI4 já usado por outro cliente → deve mostrar erro de conflito do backend. Em um cliente que já tem SKU gerado, o campo deve aparecer travado com cadeado.

### A4/A5. Categoria de projeto/amostra e tipo de serviço — fonte única
**Status anterior:** parcial. `categoria_interesse` do cliente já vinha de `/crm/constants` (com fallback hardcoded de 7 itens quando as constants não carregavam). `tipo_servico` já era Select vindo de constants na edição do projeto (CRM2Page), mas **categoria de projeto era texto 100% livre** (CRM2Page e SampleBatchModal, sem select nenhum, nem hardcoded) e **tipo de serviço também era texto livre na criação** (SampleBatchModal) — duas UIs divergentes para o mesmo campo.
**Mudança:** categoria de projeto/amostra e tipo de serviço na criação agora usam Select alimentado por `/crm/constants` (`categoria_interesse` / `project_tipo_servico`), mesma fonte já usada pelo cliente. Removido o fallback hardcoded `CATEGORIA_OPTIONS` do CRM1Page (lista vazia enquanto constants carregam, em vez de uma lista incompleta/desatualizada).
**Arquivos:** `frontend/src/pages/CRM1Page.js`, `frontend/src/pages/CRM2Page.js`, `frontend/src/components/SampleBatchModal.js`.
**Não alterado:** cadastro de categorias CAT3 (`db.categorias`) — sistema separado, ver nota do A3.
**Validar:** editar categoria de um projeto existente → deve ser um select com a mesma lista do cliente. Criar amostra em lote → campos "Categoria" e "Tipo de serviço" do bloco de projeto devem ser selects, não texto livre.

### A6/A7. Máscara pt-BR de moeda e milhar
**Status anterior:** parcial. CRM1Page já tinha a máscara pt-BR (`fmtPriceDisplay`/`fmtVolumeDisplay`, do commit `d5b486d`) só no seu próprio formulário de criação de projeto. CRM2Page (edição de projeto) e SampleBatchModal (criação) usavam `<Input type="number">` cru, sem separador decimal/milhar.
**Mudança:** utilitário extraído para `frontend/src/lib/masks.js` (CRM1Page passou a importar de lá também, eliminando a duplicação) e aplicado nos dois pontos que faltavam: `faixa_preco_venda` (moeda, vírgula + 2 casas) e `volume_estimado_pedido` (milhar) em CRM2Page e SampleBatchModal.
**Arquivos:** `frontend/src/lib/masks.js` (novo), `frontend/src/pages/CRM1Page.js`, `frontend/src/pages/CRM2Page.js`, `frontend/src/components/SampleBatchModal.js`.
**Avaliado e não alterado:** `KickoffPage.js:355` (`volume_estimado_mes`) — tela pós-fechamento fora do pipeline comercial testado neste beta; todos os ~10 campos numéricos da mesma tela usam o mesmo padrão sem máscara, mudar só um criaria inconsistência local.
**Validar:** editar faixa de preço de um projeto digitando "1500" e saindo do campo → deve virar "1.500,00". Mesmo teste para volume estimado → "15000" vira "15.000".

### A8. Qualificação ANVISA "apaga" após salvar / projeto criado sem mover card
**Status anterior:** já resolvido antes desta sessão. O commit `d5b486d` (anterior ao `soluçõesgustavo`) já corrigiu exatamente esse bug — mensagem do commit: *"Qualificação ANVISA: dados não sumiam mais após salvar (merge de editing → data após PUT)"*. Código atual em `ClientDetailSheet.handleSave` já faz `setData(prev => ({...prev, ...updates}))` após o PUT. Confirmado também que criação de projeto é sempre ação explícita (botão "Novo Projeto"/drag para "projeto_em_discussao"), nunca acoplada ao save de ANVISA.
**Mudança:** nenhuma nova — apenas confirmado via leitura de código e `git log`.
**Arquivos:** nenhum.
**Se o cliente ainda observar o bug em produção:** é sinal de que o deploy está defasado em relação ao `master` — verificar se o commit `d5b486d` está no ar em Render/Vercel.
**Validar:** editar "Tem ANVISA?" de um cliente qualificado, salvar, fechar e reabrir o card → valor deve persistir.

### A9. Remover Quantidade/Unidade por Variação da criação de amostras
**Status anterior:** não resolvido. Campos ativos em `SampleBatchModal.js`, obrigatórios só quando havia `parametro_variacao`. Backend derivava o `volume` do card de P&D a partir deles.
**Mudança:** campos removidos da UI e da validação de submissão (front). Backend mantém os campos `Optional`/nullable (dados legados) e o derivador de volume do card P&D (`_ensure_pd_request_for_card`) agora cai num placeholder `"A definir"` em vez de string vazia quando a amostra não tem `quantidade_por_variacao` — evita card de P&D com campo de volume vazio.
**Arquivos:** `backend/crm_routes.py`, `frontend/src/pages/CRM2Page.js`, `frontend/src/components/SampleBatchModal.js`, `backend/tests/test_pd_card_lazy_request.py` (comentários atualizados; as asserções em si continuam válidas).
**Validar:** criar amostra em lote → não deve haver campos de "Quantidade por variação"/"Unidade" na tela, mesmo selecionando um parâmetro de variação. Card de P&D criado a partir dessa amostra deve mostrar "A definir" como volume (não vazio/quebrado).

### A10. Sequência de variações quebra após Z
**Status anterior:** bug confirmado. `CRM2Page.js:277` usava `String.fromCharCode(65+index)`, que gera caracteres não alfabéticos a partir da 26ª variação.
**Mudança:** utilitário compartilhado `frontend/src/lib/letters.js` (`indexToLetters`, base-26 estilo coluna de planilha — A..Z, AA..AZ, BA..) usado em `CRM2Page.js`, no `intToLetters` duplicado do `CRM3Page.js`, e também em `PDDetail.js` (mesmo bug de fases da Ficha Técnica, corrigido junto no B10). Testes unitários para os índices 0, 25, 26, 27, 51, 52, 701, 702.
**Arquivos:** `frontend/src/lib/letters.js` (novo), `frontend/src/lib/letters.test.js` (novo), `frontend/src/pages/CRM2Page.js`, `frontend/src/pages/CRM3Page.js`, `frontend/src/pages/PDDetail.js`.
**Validar:** criar uma amostra com 27+ variações (ou usar o console para simular) → o "Códigos previstos" deve mostrar `AA`, `AB`... em vez de caracteres estranhos.

### A11. Custo da fragrância em dólar na criação de amostra
**Status anterior:** não resolvido. Backend já suportava `custo_fragrancia_currency` (default BRL). Tela de criação (`SampleBatchModal`) só tinha `<Input type="number">` sem seletor de moeda — o campo nunca era enviado no payload de criação. A edição pós-criação (`CRM3Page`) já usava o componente `CurrencyInput` com toggle BRL/USD.
**Mudança:** criação agora usa o mesmo `CurrencyInput`, então o valor digitado em dólar chega com a moeda certa desde o primeiro registro.
**Arquivos:** `frontend/src/pages/CRM2Page.js`, `frontend/src/components/SampleBatchModal.js`.
**Validar:** criar amostra com uma variação, alternar o custo de fragrância para US$, preencher, salvar → abrir a amostra depois e confirmar que a moeda salva é USD.

### A12. Pedido Direto (cliente + SKU já existentes)
**Status anterior:** não existe. O único "atalho" (`handleReorder` navegando pra `/orders/new`) estava quebrado — sem rota nem componente correspondente.
**Mudança:** nova feature completa. Backend: `_create_order_document()` extraída do corpo de `create_order` (POST `/orders`) e reaproveitada por `POST /orders/direct`, que valida cliente (`crm_clients`) e SKU (`skus`, precisa `status=="ativo"` e pertencer ao cliente) e entra no **mesmo ciclo de vida** dos demais pedidos (checklist de insumos, cálculo de totais, alçada de aprovação comercial, CGI, imutabilidade pós-confirmação). Pedido marcado com `origem: "direto"`; os outros dois caminhos de criação (auto-criado na aprovação do P&D, "reproduzir" pedido) ganharam `origem: "pipeline"`/`"reproducao"` para consistência. Frontend: `DirectOrderModal.js` (busca de cliente, busca de SKU ativo escopada ao cliente, quantidade com máscara de milhar, valor unitário com `CurrencyInput` pré-preenchido do preço do SKU) + botão "Novo Pedido Direto" em `OrdersPage.js` + badge no card do pedido.
**Arquivos:** `backend/orders_routes.py`, `backend/tests/test_orders.py` (testes novos), `frontend/src/pages/OrdersPage.js`, `frontend/src/components/DirectOrderModal.js` (novo).
**Não incluído:** criação manual de SKU — continua exigindo que o produto já exista via pipeline normal, como pedido pelo item.
**Validar:** em Pedidos, clicar "Novo Pedido Direto" → buscar um cliente existente → buscar um SKU ativo desse cliente → preencher quantidade e valor → criar. Deve navegar para o pedido criado, com badge "Pedido Direto", e seguir o fluxo normal (CGI, aprovação etc.) a partir daí. Tentar criar para um SKU descontinuado → deve bloquear com mensagem clara.

---

## BLOCO B — P&D

### B1. Só 5 condições de estabilidade
**Status anterior:** já resolvido no backend (`STABILITY_CONDITIONS` em `pd_routes.py` só emite as 5 exigidas: Ambiente, Estufa 45°C, Freezer -5°C, Ciclo Freeze/Thaw, Exposição à Luz). O front tinha 4 entradas a mais em `CONDITION_ICONS`/`CONDITION_COLORS` — **investigação mostrou que essas 4 condições existiram de fato no backend antes do commit `b145deb`**, que as removeu; estudos de estabilidade criados antes dele ainda têm esses códigos gravados em `pd_stability_studies`. Removê-las quebraria a exibição do histórico legado.
**Mudança:** nenhuma funcional — mantidas como estavam, só com comentário explicando o motivo (evitar remoção equivocada no futuro; cheguei a remover e reverti ao perceber o risco).
**Arquivos:** `frontend/src/pages/PDDetail.js` (comentário apenas).
**Validar:** abrir um estudo de estabilidade antigo (se existir, criado antes de ~27/06) e confirmar que todas as condições aparecem com ícone/cor próprios, não um ícone genérico.

### B2. Prazos D24h/D48h/D7/D30/D60/D90, sem D0
**Status anterior:** já resolvido no backend (`STABILITY_CHECKPOINTS = [1,2,7,30,60,90]`, freeze/thaw `[1,2,7,15]`). Confirmado que `fmtDay` no front já trata `d===0` corretamente (cai no fallback `"D${d}"` = `"D0"`), então leituras D0 legadas (checkpoints antigos eram `[0,7,15,30,45,60,90]`) continuam aparecendo no histórico sem quebrar. "Registros Complementares" → "Características Padrão": renome 100% completo, zero ocorrências do texto antigo.
**Mudança:** nenhuma.
**Arquivos:** nenhum.
**Validar:** em um estudo antigo com leitura D0, confirmar que ela aparece no histórico (read-only) em vez de sumir ou quebrar a tela.

### B3. Amostras em lote não funcional
**Status anterior:** parcial. Fluxo principal funcionava e já tinha toast de erro com o `detail` do backend (não falha silenciosa). Gap real: a validação "referência de fórmula obrigatória em adaptação de fórmula" existia no endpoint antigo `/samples/batch` mas **não** no `/samples/batch/v2`, que é o que o modal realmente usa — amostra de adaptação podia ser criada sem a referência que o P&D precisa.
**Mudança:** validação portada para o v2 (backend) + validação equivalente no filtro de submissão do front (toast identificando a amostra) + destaque visual (asterisco + borda vermelha) no campo do `SampleBatchModal` quando o tipo é adaptação de fórmula.
**Arquivos:** `backend/crm_routes.py`, `frontend/src/pages/CRM2Page.js`, `frontend/src/components/SampleBatchModal.js`.
**Validar:** criar amostra do tipo "Adaptação de Fórmula" sem preencher referência → deve bloquear com mensagem clara antes mesmo de chamar a API.

### B4/B5. Seleção de MP e fornecedor
**Status anterior:** já resolvido — a aba Manipulação já tinha autocomplete com dropdown de sugestões + seletor de fornecedor pós-seleção (não é digitação livre como o briefing supunha). O gap real era outro — ver B14.
**Mudança:** ver B14 (mesma correção).
**Arquivos:** ver B14.
**Validar:** ver B14.

### B6. Card do pipeline P&D não avança automaticamente
**Status anterior:** comportamento por design — nunca existiu (nem existe) transição automática por evento; todo movimento de card é ação explícita do usuário. **Decisão do usuário durante a auditoria:** avançar quando a requisição entra em IN_PROGRESS e um `pd_development` é criado (isso já acontecia como side-effect) — faltava só refletir no board sem refresh manual.
**Mudança:** `transition_status()` já sincronizava `pd_cards.status_pd` corretamente a cada mudança de estágio, mas nunca emitia o evento websocket `pd_card_moved` que o board (`PDPage.js`) escuta — por isso o card só aparecia na nova coluna após F5. Endpoint agora emite esse evento (mesmo formato já usado pelo drag-and-drop) após sincronizar o card.
**Arquivos:** `backend/pd_routes.py`.
**Validar:** com o board de P&D aberto em duas abas/usuários, mudar o status de uma requisição pela tela de detalhe (não pelo drag) → o card deve se mover de coluna nas duas abas sem F5.

### B7/B8. Gate D48h com caminho de bypass / botões dessincronizados
**Status anterior:** bug real confirmado. 3 caminhos podem levar ao "Entregar ao Comercial" (botão de status na requisição, botão por amostra, drag-and-drop no board) — só os 2 primeiros checavam a leitura D48h de estabilidade, cada um com uma busca ligeiramente diferente; **o drag-and-drop no board pulava a checagem por completo**, validando só homologação de MP. Era exatamente esse o caminho que permitia entregar ao comercial sem teste de estabilidade. B8: os dois botões já chamavam `fetchData()`/`onRefresh()` após a transição (nenhum estado local divergente) — a inconsistência era só o gate diferente entre eles.
**Mudança:** extraída `assert_d48h_stability_ok()` como ponto único de verdade (usa a busca mais robusta: `pd_cards` por `pd_request_id`, com fallback via `linked_pd_card_id`) e chamada a partir dos 3 pontos, incluindo o drag-and-drop (`assert_pd_card_ready_for_approval`, usado por `crm_routes.move_pd_card`).
**Arquivos:** `backend/pd_routes.py`.
**Validar:** tentar mover um card para "Aguardando Aprovação" **arrastando no board** (sem passar pela tela de detalhe) numa requisição sem leitura D48h → deve bloquear com a mesma mensagem que já aparecia nos outros dois caminhos.

### B9. Aba Estabilidades duplicada
**Status anterior:** confirmado que a aba "Estabilidades" e o painel de estabilidade dentro de "Testes" já renderizavam exatamente o mesmo componente (`StabilityGridPanel`) sobre o mesmo estudo — duplicação intencional, documentada no próprio código ("R12: painel clonado — mesma fonte de dados"). Sem risco de dado órfão.
**Mudança:** removida a aba "Estabilidades" (TabsTrigger/TabsContent) e a função `EstabilidadesTab` (agora órfã); atalho "Ver" do card de Estabilidades no Overview redirecionado para a aba "Testes". Removido também `TEST_TYPES`, array morto nunca referenciado.
**Arquivos:** `frontend/src/pages/PDDetail.js`.
**Validar:** abrir uma requisição de P&D → não deve haver mais aba "Estabilidades" separada; o painel de estabilidade deve continuar acessível dentro da aba "Testes", com todo o histórico de leituras intacto.

### B10. Tela branca ao adicionar fase (Ficha Técnica)
**Status anterior:** causa raiz identificada. Dados legados de `aspecto`/`cor`/`densidade`/`odor`/`ph`/`teor_alcool` gravados como string simples (versão antiga da ficha) violam o modelo `FichaTecnicaParam` do backend ao salvar; o erro 422 resultante tem `detail` como array de objetos (padrão FastAPI), que ia direto pro `toast.error()` — React não aceita array de objetos como filho, e sem nenhum Error Boundary na aplicação isso derrubava a tela inteira. Bug secundário confirmado: `secao.etapas.map()` sem guarda contra `etapas` ausente (mesma classe de problema para qualquer seção legada/malformada).
**Mudança:** normalização de parâmetros e seções legadas ao carregar a Ficha Técnica (nunca reenvia formato inválido); guardas em `addEtapa`/`removeEtapa`/`updateEtapa`/render; `err.response?.data?.detail` cru trocado por `formatApiError()` nas 19 ocorrências do arquivo (mesma classe de risco); **novo `ErrorBoundary` reutilizável envolvendo todas as abas do PDDetail**, para que qualquer exceção futura de render isole a aba em vez de branquear a página inteira.
**Arquivos:** `frontend/src/components/ErrorBoundary.js` (novo), `frontend/src/lib/letters.js` (novo, ver A10), `frontend/src/pages/PDDetail.js`.
**Validar:** abrir a Ficha Técnica de uma requisição com dados antigos (se existir), editar e salvar — não deve mais dar tela branca mesmo se o backend rejeitar algum campo (deve aparecer um toast de erro legível). Adicionar uma fase nova e salvar → deve funcionar normalmente.

### B11. Ficha Técnica não puxa Características Padrão
**Status anterior:** confirmado, desconectado. Ficha Técnica (`pd_ficha_tecnica`) e Características Padrão (`pd_lab_results`, aba Testes) têm campos parecidos (aspecto/cor/odor/pH) mas nunca se falam — usuário precisava redigitar na ficha algo que já tinha registrado em Características Padrão.
**Mudança:** `FichaTecnicaTab` passa a receber `labResults` e, quando o campo "resultado" da ficha ainda está vazio, sugere o valor de Características Padrão (`sensorial.aspecto/cor/odor`, `ph.valor_medido`) — nunca sobrescreve o que o usuário já digitou na própria ficha. Label ganha aviso "(de Características Padrão)" enquanto for sugestão; some assim que o usuário edita o campo. Densidade e Teor de Álcool não têm equivalente em Características Padrão, continuam manuais.
**Arquivos:** `frontend/src/pages/PDDetail.js`.
**Validar:** preencher Aspecto/Cor/Odor/pH em Características Padrão, depois abrir a Ficha Técnica pela primeira vez (ou recarregar a página) → os campos "Resultado" correspondentes devem vir preenchidos automaticamente com aviso; editar manualmente → aviso some.

### B12. Aba Custos P&D tela branca espontânea
**Status anterior:** não foi possível reproduzir ao vivo (sem acesso a dados de produção com o gatilho exato). Pela leitura estática, os campos `formulaCostData.total_cost_per_kg`/`custo_unitario`/`cotacao_usd` eram acessados com `.toFixed()` sem guarda, só protegidos pela truthiness do objeto inteiro — hoje o backend sempre popula os três juntos, mas isso é frágil a qualquer mudança futura ou documento legado parcial. Achado colateral: card de preview no Overview referenciava um campo inexistente (`custo_por_kg`, o campo real é `total_cost_per_kg`) e sempre mostrava "—" silenciosamente.
**Mudança:** todos os acessos numéricos de `formulaCostData` blindados com `Number(...)+fallback`; corrigida a referência ao campo inexistente; corrigido `pct` que virava `NaN` quando um item de fórmula não tinha `cost_brl`; erro de save trocado por `formatApiError()`. Coberta também pelo `ErrorBoundary` novo (B10) como rede de segurança geral.
**Arquivos:** `frontend/src/pages/PDDetail.js`.
**Validar:** abrir a aba "Custos P&D" de várias requisições em estágios diferentes (com e sem fórmula, com e sem custo calculado) → não deve haver tela branca em nenhum caso. **Se o cliente reproduzir o bug de novo, capturar o console do navegador no momento exato** — isso vai apontar o gatilho real que não foi possível reproduzir aqui.

### B13. Importar fórmula de outro produto
**Status anterior:** não existe. `PDFormulaBank.js` já existia como catálogo somente-leitura; não havia ação de importar/copiar composição entre requisições diferentes (só `duplicate`/`new-version`, que operam dentro da mesma requisição).
**Mudança:** novo endpoint `POST /pd/formulas/{formula_id}/import-into/{development_id}` — deep copy da fórmula + itens (IDs novos, nunca referência) para o desenvolvimento alvo, como rascunho destravado, gravando `importada_de_formula_id`/`importada_de_request_id` para rastreabilidade. Reaproveita `GET /pd/formulas/bank` para busca **e** preview (o endpoint já retornava a composição completa para quem pode ver custos). Bloqueia import para quem não tem permissão de ver composição de fórmula. Frontend: `ImportFormulaDialog` (busca → preview da tabela de ingredientes → confirmar) + botão "Importar Fórmula" na aba Manipulação.
**Arquivos:** `backend/pd_routes.py`, `backend/tests/test_formula_import.py` (novo), `frontend/src/pages/PDDetail.js`.
**Validar:** na aba Manipulação de uma requisição, clicar "Importar Fórmula" → buscar um produto de outra requisição → conferir a prévia da composição → confirmar → deve criar uma nova versão de fórmula (destravada, editável) com os mesmos ingredientes; editar um ingrediente da cópia e confirmar que a fórmula de origem não mudou.

### B14. Banco de custos não puxava fornecedores homologados
**Status anterior:** confirmado — `pd_catalog` (banco de custos), `homologacao_mps` e `materiais.fornecedores` (Compras) eram 3 coleções sem nenhuma ligação. Ao escolher uma MP no combobox (que já era autocomplete, não digitação livre — ver B4/B5), o fornecedor só vinha preenchido se o próprio `pd_catalog` já tivesse esse dado cadastrado a mão; fornecedores homologados cadastrados em Compras nunca apareciam, forçando redigitação.
**Mudança:** `GET /pd/catalog` agora casa cada item por nome (exato, case-insensitive) com `db.materiais` e mescla os fornecedores com `status_homologacao=="homologado"` na lista de fornecedores retornada — mesmo formato já consumido pelo picker existente em `PDDetail.js`, então não foi preciso mudar nada no front. Fornecedor com preço em moeda diferente de BRL não preenche `preco_rs_kg` (fica nulo) para não misturar USD com BRL sem conversão explícita.
**Arquivos:** `backend/pd_routes.py`.
**Validar:** cadastrar (ou usar um já existente) um material em Compras com fornecedor homologado, com o mesmo nome de um item já existente no banco de custos do P&D → ao selecionar essa MP na aba Manipulação, o fornecedor homologado deve aparecer como opção sugerida, sem precisar redigitar.

---

## Resumo de arquivos tocados

**Backend:** `crm_routes.py`, `pd_routes.py`, `orders_routes.py`, `tests/test_pd_card_lazy_request.py`, `tests/test_orders.py` (editados) + `tests/test_formula_import.py` (novo).

**Frontend:** `pages/CRM1Page.js`, `pages/CRM2Page.js`, `pages/CRM3Page.js`, `pages/PDDetail.js`, `pages/OrdersPage.js`, `components/SampleBatchModal.js` (editados) + `components/ErrorBoundary.js`, `components/Cli4Field.js`, `components/DirectOrderModal.js`, `lib/letters.js`, `lib/letters.test.js`, `lib/masks.js` (novos).

## Pendências recomendadas (fora do escopo dos 26 itens, achadas durante a auditoria)

1. **Cadastro de categorias CAT3** (`db.categorias`, fluxo de aprovação) não tem nenhuma tela no front — só é possível criar categoria hoje via migration/DB direto. Sem isso, o formato de SKU novo (CAT3-CLI4-SEQ) não pode receber categorias novas pela UI.
2. **B12** não foi 100% reproduzido — as guardas defensivas aplicadas cobrem todo ponto identificado como frágil, mas se a tela branca voltar a acontecer, capturar o console do navegador no momento exato ajuda a achar o gatilho real.
3. Rodar a suíte `backend/tests/` completa contra staging antes do próximo deploy — não foi possível executá-la nesta sessão (sem servidor/MongoDB disponível no ambiente local).

---

## Governança de geração de SKU — Fase 1 (auditoria pré-produção separada)

Auditoria pedida à parte, especificamente sobre a geração de SKU, antes de liberar a feature aos clientes. Não fazia parte dos 26 itens do hotfix — commit próprio (`feat(sku): governanca de geracao de SKU - Fase 1`).

**Achado crítico:** a geração de SKU estava completamente desconectada do fluxo real de aprovação. O único endpoint que o front chama quando o cliente aprova uma variação (`POST /crm/samples/{id}/variacoes/{id}/resultado-cliente`) nunca disparava nenhuma função de geração de SKU — as duas que existiam só eram acionadas por endpoints que nenhuma tela do front invoca (código morto).

**Corrigido nesta Fase 1:**
- Geração de SKU conectada ao ponto real de aprovação, no formato novo `CAT3-CLI4-SEQ4`, com a cadeia de validação R25 completa (cliente com CLI4 → categoria ativa → CGI assinado → amostra/variação aprovada → projeto em pedido aprovado).
- CAT3 resolvido dinamicamente do registro de categorias governado (`db.categorias`), não mais de um dicionário Python hardcoded desatualizado.
- Produto-Pai (entidade que já existia pronta no backend, sem uso) passa a ser auto-criado/reaproveitado a cada SKU novo, com a apresentação (volume) vinculada.
- Caminho antigo de geração (formato descontinuado, sem validação nenhuma) removido.
- SKUsPage.js passa a mostrar Produto-Pai + apresentação junto do código (nunca mais "SKU pelado").

**Limitação crítica descoberta (fora do escopo deste fix — precisa de decisão/implementação separada antes da geração de SKU funcionar de ponta a ponta):** a cadeia de validação exige um CGI "assinado"/"vigente" em `db.contratos`, mas o módulo de contratos só tem endpoint para **gerar** o contrato (grava `status="gerado"`) — não existe nenhum endpoint que marque um contrato como assinado. Hoje, essa checagem da cadeia é estruturalmente impossível de satisfazer via API. **Geração de SKU vai continuar bloqueada em produção até esse gap ser resolvido.**

**Fase 2 (não implementada, avaliar depois):** tela de solicitação/aprovação de categoria nova; tela de gestão de Produto-Pai/BOM; varredura da regra "nunca SKU pelado" em todas as telas (hoje só SKUsPage.js); verificação de compatibilidade do hífen com Omie/Bling (sem integração fiscal no código hoje para testar).

Testes novos em `backend/tests/test_sku_governance.py` (mesma limitação de ambiente do restante do relatório — não executados nesta sessão).
