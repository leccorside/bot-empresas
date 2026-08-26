# Arquitetura

O Local Prospector é um monólito modular distribuído em quatro processos: Web (Next.js), API (NestJS), Worker (BullMQ) e Scheduler/Recovery. PostgreSQL é a única fonte de verdade. Redis contém apenas trabalho reconstruível.

`API → PostgreSQL (intenção) → BullMQ (execução) → Worker → PostgreSQL (resultado)`

O Website Analyzer possui fila e estado persistente próprios. A descoberta apenas registra a intenção; workers independentes analisam os sites com concorrência e limite de requisições configuráveis. O scheduler reconstrói análises pendentes ou abandonadas a partir do PostgreSQL após perda do Redis, e também reenfileira periodicamente análises `COMPLETED` mais antigas que `WEBSITE_REFRESH_DAYS` (refresh incremental, em pequenos lotes por ciclo) para não repetir análises recentes desnecessariamente.

Os módulos de domínio são prospecções, empresas, automações, filas, CRM, campanhas, exportações e saúde. Toda execução tem status persistente, heartbeat e checkpoints. O scheduler reconcilia periodicamente PostgreSQL e Redis e recupera execuções abandonadas.

O Autopilot mantém uma fila persistente de cidades/categorias (`AutopilotTarget`). A cada ciclo do scheduler, se ligado e não pausado, um alvo é despachado (o menos recentemente executado primeiro) respeitando limites de cidades simultâneas, delay entre disparos e cotas diária/mensal — todos configuráveis e persistidos no PostgreSQL, nunca no Redis.

As integrações ficam atrás de interfaces. O Google Places Text Search é o provider inicial; sem chave, um provider de demonstração determinístico mantém o fluxo local testável. Mensagens usam WhatsApp Cloud API e nunca são enviadas em `DRY_RUN`. O canal é bidirecional: `POST /webhooks/whatsapp` recebe status de entrega/leitura (atualiza `CampaignMessage`) e respostas inbound (avança o lead para `REPLIED` ou detecta opt-out e aplica `DO_NOT_CONTACT` automaticamente); essa rota fica fora do `AuthGuard` da API e valida a assinatura `X-Hub-Signature-256` da Meta quando `WHATSAPP_APP_SECRET` está configurado.

`Campaign.filters` aceita o mesmo formato de filtro usado por `GET /businesses` (o helper `businessWhere` é compartilhado pelas duas rotas), então qualquer segmento — manual ou sugerido pela IA — é respeitado por inteiro ao agendar o envio (`POST /campaigns/:id/schedule`), não só `city`/`minScore`.

O `AiInsightProvider` orquestra `GeminiInsightProvider` e `OpenAiInsightProvider` numa cadeia de custo crescente (Gemini primeiro, OpenAI só como reserva, modo demo determinístico quando nenhum está configurado) para gerar análise e sugestão de abordagem por empresa (`BusinessInsight`) e sugerir filtros de segmentação a partir de um objetivo em texto livre. Nenhuma chamada de IA dispara ações automáticas — o resultado é sempre uma sugestão que a interface apresenta para revisão humana antes de qualquer uso.

A geração de insights em lote (`InsightBatch`) segue o mesmo padrão intenção/execução das demais filas: `POST /insights/batch` persiste a intenção (filtro, `onlyMissing`, teto de `INSIGHT_BATCH_MAX_SIZE`) e enfileira na fila dedicada `insight-batch` (concorrência 1, para não estourar limite de taxa dos provedores de IA); o worker processa uma empresa por vez, checando o status a cada iteração para permitir cancelamento (`POST /insights/batch/:id/cancel`) e persistindo progresso incremental (`processedCount`/`generatedCount`/`failedCount`). O scheduler reconstrói lotes pendentes ou abandonados a partir do PostgreSQL após perda do Redis, como as demais filas.

Nota de implementação: classes em `packages/*/src` são carregadas em runtime via `require('@prospector/x')`, que resolve para o `.ts` de origem (não para o build do `tsc`) através do suporte nativo a TypeScript do Node — que só apaga anotações de tipo, sem transformar sintaxe. Por isso, essas classes não podem usar parameter properties no construtor (`constructor(private readonly x: T)`); todo provider declara o campo e atribui no corpo do construtor. `apps/*/src` não tem essa restrição, pois roda a partir do `dist/` já compilado pelo `tsc`.
