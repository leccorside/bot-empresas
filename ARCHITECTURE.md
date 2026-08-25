# Arquitetura

O Local Prospector é um monólito modular distribuído em quatro processos: Web (Next.js), API (NestJS), Worker (BullMQ) e Scheduler/Recovery. PostgreSQL é a única fonte de verdade. Redis contém apenas trabalho reconstruível.

`API → PostgreSQL (intenção) → BullMQ (execução) → Worker → PostgreSQL (resultado)`

O Website Analyzer possui fila e estado persistente próprios. A descoberta apenas registra a intenção; workers independentes analisam os sites com concorrência e limite de requisições configuráveis. O scheduler reconstrói análises pendentes ou abandonadas a partir do PostgreSQL após perda do Redis, e também reenfileira periodicamente análises `COMPLETED` mais antigas que `WEBSITE_REFRESH_DAYS` (refresh incremental, em pequenos lotes por ciclo) para não repetir análises recentes desnecessariamente.

Os módulos de domínio são prospecções, empresas, automações, filas, CRM, campanhas, exportações e saúde. Toda execução tem status persistente, heartbeat e checkpoints. O scheduler reconcilia periodicamente PostgreSQL e Redis e recupera execuções abandonadas.

O Autopilot mantém uma fila persistente de cidades/categorias (`AutopilotTarget`). A cada ciclo do scheduler, se ligado e não pausado, um alvo é despachado (o menos recentemente executado primeiro) respeitando limites de cidades simultâneas, delay entre disparos e cotas diária/mensal — todos configuráveis e persistidos no PostgreSQL, nunca no Redis.

As integrações ficam atrás de interfaces. O Google Places Text Search é o provider inicial; sem chave, um provider de demonstração determinístico mantém o fluxo local testável. Mensagens usam WhatsApp Cloud API e nunca são enviadas em `DRY_RUN`. O canal é bidirecional: `POST /webhooks/whatsapp` recebe status de entrega/leitura (atualiza `CampaignMessage`) e respostas inbound (avança o lead para `REPLIED` ou detecta opt-out e aplica `DO_NOT_CONTACT` automaticamente); essa rota fica fora do `AuthGuard` da API e valida a assinatura `X-Hub-Signature-256` da Meta quando `WHATSAPP_APP_SECRET` está configurado.
