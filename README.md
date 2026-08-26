# Local Prospector

Servidor local autônomo de prospecção B2B. PostgreSQL é a fonte de verdade; Redis/BullMQ executam filas reconstruíveis. O projeto inclui dashboard, busca manual e agendada, checkpoints, recovery, deduplicação, análise básica de site, lead score, exportação CSV/XLSX, CRM e campanhas protegidas por dry run.

## Início com um único comando

```bash
docker compose up -d --build
```

Esse único comando constrói as imagens, inicia PostgreSQL e Redis, cria/atualiza o schema, executa o seed e sobe API, Web, Worker, Scheduler, Recovery e Reconciliation. Não instale Node, npm, Prisma ou bancos no host.

- Painel: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/docs
- Login inicial: `admin@local.test` / `prospector`

Altere `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` antes de uso permanente. PostgreSQL e Redis não expõem portas ao host.

## Providers

Sem `GOOGLE_MAPS_API_KEY`, o sistema usa resultados de demonstração determinísticos para que todo o pipeline possa ser validado. Ao fornecer uma chave, passa a usar a API oficial Places Text Search. `DRY_RUN=true` impede envios. Para enviar WhatsApp de verdade, configure as credenciais, mude `DRY_RUN=false` e autorize explicitamente `AUTO_SEND_CAMPAIGNS=true`.

## WhatsApp Business Platform

Toda campanha exige um **template aprovado** — a tela **CRM & Campanhas** ganhou a seção **Templates de mensagem**: crie um template com nome (minúsculas e `_`), idioma, categoria (Marketing/Utilidade/Autenticação) e corpo com placeholders posicionais `{{1}}`, `{{2}}`... correspondendo às variáveis marcadas (`nome_empresa`, `cidade`, `categoria` — resolvidas a partir dos dados da empresa no envio). "Enviar para aprovação" (`POST /templates/:id/submit`) usa a `WhatsAppTemplateProvider`: sem `WHATSAPP_BUSINESS_ACCOUNT_ID`/`WHATSAPP_ACCESS_TOKEN` configurados, aprova instantaneamente em modo demo/local (para testar o fluxo completo sem uma conta Meta real); com as credenciais, submete de verdade à Meta (`POST /{waba-id}/message_templates`) e fica `PENDING` até você sincronizar o status (`POST /templates/:id/sync`). Campanhas só podem ser criadas com um template `APPROVED`.

Envio usa a WhatsApp Cloud API (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) com `type:'template'` (não texto livre — obrigatório pela plataforma para mensagens iniciadas pela empresa); em `DRY_RUN=true` nenhuma mensagem sai e o `providerMessageId` fica com prefixo `dry-run:`. Para receber status de entrega/leitura e respostas, configure no app da Meta um webhook apontando para `https://<seu-dominio-publico>/webhooks/whatsapp`, use `WHATSAPP_WEBHOOK_VERIFY_TOKEN` no handshake de verificação e defina `WHATSAPP_APP_SECRET` para validar a assinatura `X-Hub-Signature-256` de cada callback (sem o secret configurado, a assinatura não é validada — adequado para testes locais, mas configure antes de expor a rota publicamente). Callbacks de status atualizam `CampaignMessage` (`DELIVERED`/`READ`/`FAILED`); uma resposta do lead marca a mensagem mais recente como `REPLIED` e avança automaticamente o status do CRM para `REPLIED` (sem retroceder leads já mais adiantados no funil); se a resposta contiver uma intenção de opt-out ("parar", "remover", "sem interesse" etc.), o lead é movido para `DO_NOT_CONTACT` e o telefone suprimido automaticamente, sem intervenção manual. O histórico de mensagens de cada campanha (status, enviada/entregue/lida/respondida) fica visível na tela **CRM & Campanhas**.

### Expor o webhook publicamente para testes (ngrok)

Como a stack roda só localmente, o painel da Meta não consegue alcançar `/webhooks/whatsapp` sem um túnel público. Um serviço `ngrok` está definido no `docker-compose.yml` sob o profile `webhooks` (não sobe com o `docker compose up -d` padrão, para não expor a API por acidente). Defina `NGROK_AUTHTOKEN` no `.env` (pegue em https://dashboard.ngrok.com/get-started/your-authtoken) e suba com:

```bash
docker compose --profile webhooks up -d ngrok
```

A URL pública fica disponível em `curl http://localhost:4040/api/tunnels` (ou no painel web em `http://localhost:4040`). Use `https://<url-gerada>/webhooks/whatsapp` como Callback URL no app da Meta. Para parar: `docker compose stop ngrok`.

Cada prospecção resolve o viewport da cidade pela Places API (New), divide-o em células geográficas persistentes e restringe cada busca ao retângulo da célula. O progresso pode ser acompanhado na coluna **Células** e em `GET /runs/:id/cells`. Ajuste `GRID_CELL_SIZE_METERS`, `GRID_MAX_CELLS` e `GOOGLE_PLACES_MAX_PAGES_PER_CELL` no `.env` para controlar cobertura, custo e volume. A resolução do viewport e as buscas usam somente a Places API (New); não é necessário habilitar a Geocoding API.

Empresas com website são enviadas para a fila persistente **Website Analyzer**. O worker verifica status HTTP, HTTPS/SSL, tempo de resposta, viewport, title, description, WordPress e tecnologias, atualiza o Lead Score e mantém o resultado em `WebsiteAnalysis`. A análise também pode ser refeita na tela **Empresas** ou por `POST /businesses/:id/website-analysis`; o histórico fica em `GET /businesses/:id/website-analyses`. Destinos locais, redes privadas, portas não web e redirects inseguros são bloqueados.

Sem `PAGESPEED_API_KEY`, o score de performance usa um resultado de demonstração determinístico; com a chave, o worker consulta o PageSpeed Insights (`PAGESPEED_STRATEGY`, `PAGESPEED_TIMEOUT_MS`) e grava `performanceScore` em `WebsiteAnalysis` e `Business`. Um score de performance abaixo de 50 soma pontos ao Lead Score. Falhas na consulta ao PageSpeed não derrubam a análise do site: o restante do resultado é persistido normalmente.

O scheduler também reenfileira automaticamente análises de website concluídas há mais de `WEBSITE_REFRESH_DAYS` dias, em lotes de `WEBSITE_REFRESH_BATCH_SIZE` por ciclo, para manter o Website Analyzer atualizado sem reprocessar sites analisados recentemente.

## CRM

A tela **CRM & Campanhas** mostra o pipeline completo de leads em colunas por status (`NEW → QUALIFIED → CONTACT_PENDING → CONTACTED → REPLIED → INTERESTED → MEETING → PROPOSAL → CUSTOMER`, mais `NOT_INTERESTED`/`DO_NOT_CONTACT` fora do funil ativo). Cada card permite mover o lead para qualquer status (`PATCH /businesses/:id/status`) com uma nota opcional, registrada permanentemente em `LeadEvent`, e visualizar o histórico completo do lead. Marcar `DO_NOT_CONTACT` suprime automaticamente o telefone normalizado em `ContactSuppression`, impedindo inclusão futura em campanhas. Filtre a base de empresas por status do CRM em `GET /businesses?leadStatus=`.

## Analytics

A tela **Analytics** (`GET /analytics?days=`) mostra crescimento de empresas descobertas por dia, distribuição de Lead Score, funil de status do CRM, status de site e telefones por WhatsApp, além dos rankings por categoria e cidade — tudo calculado sob demanda a partir do PostgreSQL, sem tabelas ou jobs adicionais. O período é configurável (7 a 180 dias, padrão 30).

A mesma tela traz a seção **Analytics comercial** (`GET /analytics/commercial?days=`): funil completo (empresas encontradas → novas → leads qualificados → mensagens enviadas/entregues/lidas/respondidas → interessados → propostas → clientes) e as taxas Delivery/Read/Reply/Interest/Conversion Rate, calculadas a partir dos timestamps de `CampaignMessage` (`sentAt`/`deliveredAt`/`readAt`/`repliedAt`, preenchidos pelos webhooks do WhatsApp), com detalhamento por campanha no período.

## Inteligência (IA assistida)

Os dois recursos abaixo usam o `AiInsightProvider`, que encadeia dois provedores por custo: tenta o **Gemini** primeiro (`GEMINI_API_KEY`, `GEMINI_MODEL` — padrão `gemini-3.6-flash`, tier gratuito generoso), cai para a **OpenAI** (`OPENAI_API_KEY`, `gpt-4o-mini`) só se o Gemini não estiver configurado ou falhar, e usa um modo demo determinístico (regras simples, sem custo e sem chamada de rede) quando nenhum dos dois está configurado. Configurar os dois ao mesmo tempo economiza tokens pagos da OpenAI, já que ela só é chamada como reserva. Se um provedor configurado falhar de verdade (quota, erro de rede), o erro é propagado — nunca mascarado com texto demo. Em qualquer modo, a IA só **sugere** — nada é aplicado, enviado ou movido automaticamente; um humano decide.

- **Insight de lead** — na tela **Empresas**, o botão "Insight IA" em cada linha gera (`POST /businesses/:id/insight`) uma análise curta da oportunidade e uma sugestão de abordagem personalizada, usando os dados já coletados da empresa (site, avaliações, categoria, cidade, lead score). Pode ser regenerado a qualquer momento e marcado como "Aprovado" (`POST /businesses/:id/insight/approve`) para indicar que um humano validou o texto.
- **Segmentação inteligente** — no topo da mesma tela, descreva um objetivo em texto livre (ex.: "empresas sem site em Caldas Novas, ideal para oferta de criação de site") e `POST /segments/suggest` devolve um filtro sugerido, mostrando quantas empresas correspondem antes de qualquer ação. "Usar esses filtros" pré-preenche o formulário de filtros existente (aplicar continua manual); "Criar campanha com este segmento" cria uma campanha em rascunho (`POST /campaigns`) já com esse filtro completo — só falta escolher nome e template aprovado, e depois ir em **CRM & Campanhas** para revisar e agendar o envio.
- **Geração em lote** — o botão "Gerar insights em lote" na tela **Empresas** (`POST /insights/batch`) enfileira, para as empresas que correspondem ao filtro atual e ainda não têm insight, a geração assíncrona via `AiInsightProvider` (fila BullMQ dedicada `insight-batch`, processada uma empresa por vez para não estourar limites de taxa dos provedores). O tamanho do lote é limitado por `INSIGHT_BATCH_MAX_SIZE` (padrão 30). O progresso pode ser acompanhado em tempo real (`GET /insights/batch/:id`, com contagem de processadas/geradas/falhas) e um lote em andamento pode ser cancelado (`POST /insights/batch/:id/cancel`). Como no fluxo individual, cada insight gerado fica marcado como não aprovado até revisão humana.
- **Classificação assistida por IA** — o Lead Score continua 100% calculado por regras fixas (`calculateLeadScore`), mas cada geração de insight (individual ou em lote) agora também pede à IA uma reavaliação qualitativa: um `suggestedScore` (0-100) e uma `scoreJustification` de 1 frase, exibidos na seção "Classificação assistida por IA" do painel de insight ao lado do score atual. Nada é aplicado automaticamente — o botão "Aplicar score sugerido" (`POST /businesses/:id/insight/apply-score`) só existe para o humano decidir se substitui `leadScore`/`scoreClass` da empresa pelo valor sugerido; note que uma próxima descoberta ou análise de site recalcula o score pelas regras normalmente, então a aplicação é um ajuste tático, não uma sobrescrita permanente.

## Autopilot

Na tela **Automações**, cadastre cidades/categorias na fila do Autopilot e ligue o botão **Autopilot**. Com o Autopilot ligado, o scheduler despacha automaticamente uma prospecção por ciclo para a cidade menos recentemente executada, respeitando os limites configuráveis (cidades simultâneas, delay entre disparos, limite diário e limite mensal — persistidos no PostgreSQL, editáveis na própria tela). Ativar o Autopilot não autoriza envio de campanhas: isso continua exigindo `AUTO_SEND_CAMPAIGNS=true` e `DRY_RUN=false` separadamente. **Parar automações** também pausa o Autopilot imediatamente.

Campanhas podem usar filtros completos ou uma seleção explícita de leads. O worker respeita `CAMPAIGN_MESSAGES_PER_HOUR`, `CAMPAIGN_MESSAGES_PER_DAY` e a janela `CAMPAIGN_ALLOWED_START_HOUR`–`CAMPAIGN_ALLOWED_END_HOUR` no fuso `CAMPAIGN_TIMEZONE`; quando um limite é alcançado, as mensagens restantes permanecem enfileiradas e a campanha é retomada automaticamente.

## Operação e resiliência

Use `docker compose down` para parar sem apagar dados. Apenas `docker compose down -v` remove volumes. O scheduler reconcilia o estado a cada 30 segundos; apagar o volume Redis não apaga empresas, runs, checkpoints, schedules ou campanhas.

Comandos auxiliares estão no `Makefile`. Logs estruturados em JSON vão simultaneamente para stdout (`docker compose logs -f`) e para o volume persistente `logs_data`, em `/storage/logs/`: `api.log`, `worker.log`, `scheduler.log`, `recovery.log`, `whatsapp.log` e `errors.log`. A rotação usa 10 MB e cinco históricos por padrão; ajuste `LOG_MAX_BYTES` e `LOG_MAX_FILES` no `.env` quando necessário. Exports ficam no volume `exports_data`; backups usam `scripts/backup.sh` e o volume `backups_data`.

## Desenvolvimento

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Testes e lint também rodam dentro do ambiente Docker: `make test` e `make lint`.
