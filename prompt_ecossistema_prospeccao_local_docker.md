# PROMPT --- ECOSSISTEMA LOCAL DE PROSPECÇÃO B2B 100% DOCKER

Quero desenvolver um sistema web completo de **prospecção automatizada
de empresas locais**, executado 100% no meu computador através de
Docker.

O sistema deverá funcionar de três formas:

1.  **Manual:** seleciono cidade/segmento e inicio a prospecção.
2.  **Automática:** deixo o sistema processando autonomamente uma fila
    de cidades e segmentos.
3.  **Agendada:** configuro dias e horários específicos para executar
    prospecções e campanhas.

O sistema deve continuar funcionando independentemente do navegador
estar aberto, desde que Docker esteja executando.

A arquitetura deverá ser preparada para processamentos longos, podendo
permanecer executando durante horas ou dias.

------------------------------------------------------------------------

# 1. OBJETIVO DO SISTEMA

Quero informar:

``` text
País: Brasil
Estado: Goiás
Cidade: Caldas Novas
Segmento: Todos
```

Ou selecionar um segmento específico:

``` text
Restaurantes
Academias
Clínicas
Dentistas
Advogados
Hotéis
Pousadas
Imobiliárias
Oficinas
Lojas
Mercados
etc.
```

O sistema deverá:

``` text
CIDADE
   ↓
DESCOBERTA DE EMPRESAS
   ↓
DEDUPLICAÇÃO
   ↓
ENRIQUECIMENTO
   ↓
ANÁLISE DO SITE
   ↓
ANÁLISE DO TELEFONE
   ↓
IDENTIFICAÇÃO DE WHATSAPP
   ↓
ANÁLISE DAS AVALIAÇÕES
   ↓
LEAD SCORE
   ↓
POSTGRESQL
   ↓
CRM
   ↓
DASHBOARD
   ↓
CSV / XLSX
   ↓
CAMPANHAS
   ↓
WHATSAPP
```

------------------------------------------------------------------------

# 2. REQUISITO PRINCIPAL

Todo o ambiente deverá funcionar através de:

``` bash
docker compose up -d
```

Não exigir instalação local de:

``` text
Node.js
npm
pnpm
PostgreSQL
Redis
Prisma
NestJS
Next.js
```

A máquina deverá precisar basicamente de:

``` text
Docker
Docker Compose
Git
```

Serviços externos poderão ser acessados pelos containers através da
internet.

------------------------------------------------------------------------

# 3. PRINCÍPIO FUNDAMENTAL DE PERSISTÊNCIA

Este requisito é obrigatório.

## PostgreSQL = fonte de verdade

O PostgreSQL deverá ser a **fonte oficial do estado do sistema**.

Tudo que for importante deverá estar persistido no PostgreSQL:

``` text
Empresas
Leads
Prospecções
Cidades
Células geográficas
Etapas processadas
Checkpoints
Agendamentos
Campanhas
Mensagens
Histórico
Erros
Tentativas
Status
```

## Redis/BullMQ = mecanismo de execução

Redis e BullMQ deverão ser utilizados para:

``` text
filas
distribuição de jobs
concorrência
delays
retries
backoff
scheduling
workers
```

Mas **não poderão ser considerados a fonte definitiva do estado do
sistema**.

Se Redis for perdido ou reiniciado, o sistema deverá conseguir
reconstruir suas filas utilizando o PostgreSQL.

Arquitetura:

``` text
POSTGRESQL
   │
   │ fonte de verdade
   ▼
SCHEDULER / RECOVERY SERVICE
   │
   ▼
REDIS
   │
   ▼
BULLMQ
   │
   ▼
WORKERS
   │
   ▼
RESULTADOS
   │
   ▼
POSTGRESQL
```

------------------------------------------------------------------------

# 4. STACK

## Frontend

``` text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
```

## Backend

``` text
Node.js
TypeScript
NestJS
Prisma
```

Utilizar arquitetura:

``` text
Clean Architecture
SOLID
Repository Pattern
Service Layer
DTOs
Dependency Injection
Arquitetura Modular
```

Começar como **monólito modular**, evitando microserviços
desnecessários.

## Banco

``` text
PostgreSQL
```

## Cache

``` text
Redis
```

## Filas

``` text
BullMQ
```

## Scheduler

Utilizar:

``` text
BullMQ Job Schedulers
```

ou solução equivalente.

Entretanto, os schedules deverão estar persistidos no PostgreSQL.

------------------------------------------------------------------------

# 5. CONTAINERS

Criar:

``` text
prospector-web
prospector-api
prospector-worker
prospector-scheduler
prospector-postgres
prospector-redis
```

Opcional:

``` text
prospector-adminer
```

Arquitetura:

``` text
                 ┌─────────────────┐
                 │     NEXT.JS     │
                 │ localhost:3000  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │     NESTJS      │
                 │ localhost:3001  │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
        PostgreSQL      Redis       Scheduler
             │            │            │
             │            ▼            │
             │          BullMQ ◄───────┘
             │            │
             │            ▼
             │          Worker
             │            │
             └────────────┘
```

------------------------------------------------------------------------

# 6. DOCKER COMPOSE

Criar:

``` text
docker-compose.yml
docker-compose.dev.yml
.env
.env.example
```

Containers deverão possuir:

``` yaml
restart: unless-stopped
```

Implementar:

``` text
healthcheck
depends_on
volumes
networks
graceful shutdown
```

Volumes:

``` text
postgres_data
redis_data
exports_data
logs_data
backups_data
```

Executar:

``` bash
docker compose down
```

não poderá apagar os dados.

Somente:

``` bash
docker compose down -v
```

poderá remover os volumes.

------------------------------------------------------------------------

# 7. ESTRUTURA

Criar monorepo:

``` text
local-prospector/

├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── scheduler/
│
├── packages/
│   ├── database/
│   ├── queues/
│   ├── integrations/
│   ├── shared/
│   ├── types/
│   └── validation/
│
├── storage/
│   ├── exports/
│   ├── logs/
│   └── backups/
│
├── docker/
├── scripts/
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env
├── .env.example
└── README.md
```

------------------------------------------------------------------------

# 8. INICIALIZAÇÃO

Quero conseguir executar:

``` bash
git clone ...
cd local-prospector
cp .env.example .env
docker compose up -d --build
```

Frontend: `http://localhost:3000`

Backend: `http://localhost:3001`

Swagger: `http://localhost:3001/docs`

------------------------------------------------------------------------

# 9. VARIÁVEIS DE AMBIENTE

Criar:

``` env
POSTGRES_DB=prospector
POSTGRES_USER=prospector
POSTGRES_PASSWORD=prospector

DATABASE_URL=postgresql://prospector:prospector@postgres:5432/prospector

REDIS_HOST=redis
REDIS_PORT=6379

GOOGLE_MAPS_API_KEY=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

OPENAI_API_KEY=

TZ=America/Sao_Paulo

AUTOPILOT=false
AUTO_SEND_CAMPAIGNS=false
DRY_RUN=true

PROSPECTING_ALLOWED_START=00:00
PROSPECTING_ALLOWED_END=06:00

MESSAGING_ALLOWED_START=09:00
MESSAGING_ALLOWED_END=18:00

BUSINESS_REFRESH_DAYS=7
WEBSITE_REFRESH_DAYS=30
PHONE_REFRESH_DAYS=30

WORKER_CONCURRENCY=5
MAX_REQUESTS_PER_SECOND=5
```

Nenhum segredo deverá ficar hardcoded.

------------------------------------------------------------------------

# 10. EXECUÇÃO MANUAL

Dashboard: **NOVA PROSPECÇÃO**

Formulário:

-   País
-   Estado
-   Cidade
-   Categoria

Opções:

-   EXECUTAR AGORA
-   AGENDAR
-   ADICIONAR À FILA

Fluxo:

``` text
API
 ↓
cria ProspectingRun no PostgreSQL
 ↓
status = PENDING
 ↓
cria Job BullMQ
 ↓
status = QUEUED
 ↓
Worker
 ↓
status = RUNNING
```

------------------------------------------------------------------------

# 11. MODO AUTÔNOMO

Criar **AUTOPILOT**.

Permitir cadastrar várias cidades e processá-las sequencialmente ou com
concorrência configurável.

Configurar:

-   máximo de cidades simultâneas;
-   concorrência;
-   requests por segundo;
-   delay;
-   limite diário;
-   limite mensal.

------------------------------------------------------------------------

# 12. SCHEDULER

Criar página **AUTOMAÇÕES**.

Permitir execuções:

-   Uma vez
-   Diariamente
-   Semanalmente
-   Mensalmente
-   Dias específicos

Utilizar timezone `America/Sao_Paulo`.

------------------------------------------------------------------------

# 13. PERSISTÊNCIA DOS SCHEDULES

Criar tabela `schedules` com:

``` text
id
name
enabled
country
state
city
category
scheduleType
cronExpression
timezone
lastRunAt
nextRunAt
createdAt
updatedAt
```

PostgreSQL será a fonte oficial.

Na inicialização:

``` text
START
 ↓
buscar schedules enabled=true
 ↓
comparar PostgreSQL × BullMQ
 ↓
recriar schedules ausentes
 ↓
remover jobs órfãos
 ↓
sincronizar Redis
 ↓
continuar operação
```

------------------------------------------------------------------------

# 14. EXECUÇÕES

Criar tabela `prospecting_runs`:

``` text
id
scheduleId
country
state
city
category
status
startedAt
heartbeatAt
finishedAt
businessesFound
businessesNew
businessesUpdated
duplicatesFound
websitesFound
withoutWebsite
phonesFound
whatsappFound
currentStage
errorMessage
createdAt
updatedAt
```

Status:

``` text
PENDING
QUEUED
RUNNING
PAUSED
RECOVERING
COMPLETED
FAILED
CANCELLED
```

------------------------------------------------------------------------

# 15. HEARTBEAT

Workers deverão atualizar `heartbeatAt` periodicamente.

Se um processamento permanecer `RUNNING` sem heartbeat dentro do limite
configurado:

``` text
RUNNING → RECOVERING
```

O Recovery Service deverá consultar o checkpoint e recriar o job.

------------------------------------------------------------------------

# 16. CHECKPOINTS

Criar tabela `processing_checkpoints`:

``` text
id
runId
stage
entityType
entityId
cursor
page
offset
processedItems
totalItems
status
metadata JSONB
startedAt
updatedAt
completedAt
```

Checkpoint poderá representar cidade, categoria, grid, célula, página,
empresa ou etapa.

------------------------------------------------------------------------

# 17. RECUPERAÇÃO

Após reinicialização:

``` text
PostgreSQL inicia
 ↓
Redis inicia
 ↓
API inicia
 ↓
Worker inicia
 ↓
Scheduler inicia
 ↓
Recovery Service inicia
 ↓
procura RUNNING sem heartbeat
 ↓
marca RECOVERING
 ↓
consulta checkpoint
 ↓
recria jobs
 ↓
continua do último ponto
```

Nunca reiniciar uma cidade inteira quando existirem checkpoints válidos.

------------------------------------------------------------------------

# 18. IDEMPOTÊNCIA

Todos os jobs deverão possuir chave de idempotência.

Exemplos:

``` text
prospecting:{runId}:{cellId}
website-analysis:{businessId}:{version}
```

Utilizar:

-   unique constraints;
-   transactions;
-   upsert;
-   locks;
-   idempotency keys.

------------------------------------------------------------------------

# 19. DESCOBERTA

Criar interface `BusinessDiscoveryProvider`.

Implementação inicial: `GooglePlacesProvider`.

Priorizar APIs oficiais e preparar arquitetura para outros providers,
como OpenStreetMap.

------------------------------------------------------------------------

# 20. COBERTURA GEOGRÁFICA

Criar estratégia:

``` text
Cidade
 ↓
Bounding Box
 ↓
Grid geográfico
 ↓
Células
 ↓
Busca por coordenadas
 ↓
Paginação
 ↓
Deduplicação
```

Tabela `search_cells`:

``` text
id
runId
latitude
longitude
radius
category
status
currentPage
nextPageToken
resultsFound
startedAt
completedAt
```

------------------------------------------------------------------------

# 21. CHECKPOINT POR CÉLULA

Exemplo:

``` text
Goiânia
500 células

1-237 = COMPLETED
238 = RUNNING
239-500 = PENDING
```

Após reinicialização, retomar a célula 238 e continuar pelas restantes,
sem reprocessar 1-237 desnecessariamente.

------------------------------------------------------------------------

# 22. DEDUPLICAÇÃO

Identificador principal:

``` text
provider + providerId
```

Exemplo:

``` text
GOOGLE + placeId
```

Criar unique constraint.

Fallback:

``` text
normalizedName
normalizedPhone
normalizedAddress
```

Utilizar UPSERT.

------------------------------------------------------------------------

# 23. EMPRESAS

Tabela `businesses`:

``` text
id
provider
providerId
name
category
address
district
city
state
postalCode
country
latitude
longitude
website
phone
rating
reviewsCount
mapsUrl
firstSeenAt
lastSeenAt
createdAt
updatedAt
```

------------------------------------------------------------------------

# 24. HISTÓRICO

Criar `business_snapshots`:

``` text
businessId
rating
reviewsCount
website
phone
capturedAt
```

------------------------------------------------------------------------

# 25. ENRIQUECIMENTO

Pipeline:

``` text
DISCOVERED
 ↓
WEBSITE_ANALYSIS
 ↓
PHONE_ANALYSIS
 ↓
REVIEW_ANALYSIS
 ↓
LEAD_SCORING
 ↓
READY
```

Cada etapa deverá ser independente, idempotente, assíncrona e
recuperável.

------------------------------------------------------------------------

# 26. SITE

Verificar:

-   existência do site;
-   HTTP status;
-   HTTPS;
-   SSL;
-   tempo de resposta;
-   viewport;
-   title;
-   description;
-   WordPress;
-   tecnologias.

Opcionalmente integrar PageSpeed Insights.

Status:

``` text
NO_WEBSITE
POOR
AVERAGE
GOOD
UNKNOWN
```

------------------------------------------------------------------------

# 27. TELEFONE

Normalizar para E.164.

Tabela `business_phones`:

``` text
id
businessId
phone
normalizedPhone
type
whatsappStatus
verifiedAt
```

Tipos:

``` text
MOBILE
LANDLINE
UNKNOWN
```

WhatsApp:

``` text
UNKNOWN
AVAILABLE
NOT_AVAILABLE
INVALID
```

Não considerar automaticamente que todo celular possui WhatsApp.
Utilizar somente mecanismos permitidos pelos providers configurados.

------------------------------------------------------------------------

# 28. AVALIAÇÕES

Guardar `rating` e `reviewsCount`.

Classificação configurável:

``` text
0       → NO_REVIEWS
1-10    → VERY_LOW
11-30   → LOW
31-100  → MEDIUM
100+    → HIGH
```

Também suportar `UNKNOWN`.

------------------------------------------------------------------------

# 29. LEAD SCORE

Exemplo:

``` text
Sem site               +40
Site ruim              +25
0 avaliações           +25
1-10 avaliações        +15
WhatsApp               +20
Telefone               +10
Performance < 50       +15
Sem HTTPS              +10
```

Normalizar para 0--100.

Classificar:

``` text
LOW
MEDIUM
HIGH
VERY_HIGH
```

Pesos configuráveis.

------------------------------------------------------------------------

# 30. DASHBOARD

Mostrar indicadores de:

-   empresas;
-   com/sem site;
-   com/sem telefone;
-   WhatsApp confirmado;
-   sem avaliações;
-   oportunidades HIGH;
-   jobs ativos;
-   jobs esperando;
-   jobs falhos;
-   últimas execuções;
-   próximas execuções;
-   status de Scheduler, Worker, Redis e PostgreSQL.

------------------------------------------------------------------------

# 31. TELA DE EMPRESAS

Tabela com:

``` text
Empresa
Categoria
Cidade
Telefone
WhatsApp
Site
Rating
Avaliações
Lead Score
Status
Última atualização
```

Filtros por cidade, estado, categoria, site, telefone, WhatsApp,
avaliações, rating e Lead Score.

------------------------------------------------------------------------

# 32. EXPORTAÇÃO

Permitir CSV e XLSX.

Salvar em:

``` text
/storage/exports/
```

Campos:

``` text
Empresa
Categoria
Endereço
Cidade
Estado
Telefone
WhatsApp
Site
Status Site
Rating
Avaliações
Google Maps
Lead Score
Data Descoberta
Última Atualização
```

------------------------------------------------------------------------

# 33. CRM

Status:

``` text
NEW
QUALIFIED
CONTACT_PENDING
CONTACTED
REPLIED
INTERESTED
MEETING
PROPOSAL
CUSTOMER
NOT_INTERESTED
DO_NOT_CONTACT
```

Criar histórico em `lead_events`.

------------------------------------------------------------------------

# 34. CAMPANHAS

Permitir criar campanhas por filtros como cidade, ausência de site,
WhatsApp disponível e Lead Score mínimo.

Permitir selecionar leads, criar campanha e agendar campanha.

------------------------------------------------------------------------

# 35. WHATSAPP

Utilizar preferencialmente WhatsApp Business Platform.

Criar abstração `MessagingProvider` e implementação inicial
`WhatsAppCloudProvider`.

Não utilizar automação de WhatsApp Web como infraestrutura principal.

------------------------------------------------------------------------

# 36. CAMPANHAS AGENDADAS

Fluxo:

``` text
PostgreSQL
 ↓
Scheduler
 ↓
BullMQ
 ↓
Worker
 ↓
MessagingProvider
 ↓
WhatsApp
```

------------------------------------------------------------------------

# 37. MENSAGENS

Tabela `campaign_messages`:

``` text
id
campaignId
businessId
phone
status
providerMessageId
scheduledAt
sentAt
deliveredAt
readAt
repliedAt
failedAt
errorMessage
```

Status:

``` text
PENDING
QUEUED
SENT
DELIVERED
READ
REPLIED
FAILED
BLOCKED
```

------------------------------------------------------------------------

# 38. OPT-OUT

Criar `contact_suppression`.

Se empresa solicitar parar, sair, remover ou indicar falta de interesse,
marcar `DO_NOT_CONTACT`.

Nunca incluir novamente automaticamente em campanhas.

------------------------------------------------------------------------

# 39. DRY RUN

Implementar:

``` env
DRY_RUN=true
```

Quando ativo:

``` text
Descobrir empresas        SIM
Analisar empresas         SIM
Criar leads               SIM
Gerar mensagens           SIM
Enviar mensagens          NÃO
```

Mostrar claramente **DRY RUN ATIVO** no dashboard.

------------------------------------------------------------------------

# 40. AUTOPILOT

Criar AUTOPILOT OFF/ON.

Ativar AUTOPILOT não deverá automaticamente autorizar envio de WhatsApp.

Utilizar:

``` env
AUTO_SEND_CAMPAIGNS=false
```

Default `false`.

------------------------------------------------------------------------

# 41. LIMITES

Configurar:

-   requests por segundo;
-   jobs simultâneos;
-   empresas por execução;
-   cidades simultâneas;
-   mensagens por hora;
-   mensagens por dia;
-   horários permitidos.

Respeitar limites oficiais dos providers e não implementar mecanismos
para contornar anti-spam ou rate limits.

------------------------------------------------------------------------

# 42. BOTÃO DE EMERGÊNCIA

Criar **PARAR AUTOMAÇÕES** para:

-   pausar scheduler;
-   pausar filas;
-   impedir novos jobs;
-   impedir mensagens.

Não apagar dados.

Criar também **RETOMAR AUTOMAÇÕES**.

------------------------------------------------------------------------

# 43. CENTRAL DE JOBS

Página **JOBS** com:

``` text
WAITING
ACTIVE
COMPLETED
FAILED
DELAYED
RECOVERING
```

Permitir pausar, continuar, cancelar e reprocessar.

------------------------------------------------------------------------

# 44. LOGS

Salvar em stdout e `/storage/logs/`.

Arquivos:

``` text
api.log
worker.log
scheduler.log
recovery.log
whatsapp.log
errors.log
```

Implementar rotação.

------------------------------------------------------------------------

# 45. OBSERVABILIDADE

Logs deverão conter quando aplicável:

``` text
requestId
jobId
runId
businessId
cellId
scheduleId
```

Utilizar logs estruturados em JSON.

------------------------------------------------------------------------

# 46. SYSTEM STATUS

Dashboard deverá mostrar:

``` text
API           ONLINE
POSTGRES      ONLINE
REDIS         ONLINE
WORKER        ONLINE
SCHEDULER     ONLINE
RECOVERY      ONLINE

Waiting Jobs
Active Jobs
Failed Jobs

Database Size
Exports Size
Logs Size
```

------------------------------------------------------------------------

# 47. BACKUP

Criar:

``` bash
./scripts/backup.sh
./scripts/restore.sh
```

Salvar em `/storage/backups/`.

Backup deverá incluir PostgreSQL, configurações relevantes e exports
importantes.

------------------------------------------------------------------------

# 48. BACKUP AUTOMÁTICO

Permitir execução diária, por exemplo às 04:00.

Utilizar `pg_dump`.

Configurar:

``` env
BACKUP_RETENTION_DAYS=30
```

------------------------------------------------------------------------

# 49. COMANDOS

Criar Makefile:

``` bash
make start
make stop
make restart
make logs
make status
make migrate
make seed
make backup
make restore
make test
make lint
make worker-logs
make scheduler-logs
```

------------------------------------------------------------------------

# 50. SEGURANÇA

Mesmo localmente utilizar:

``` text
JWT
Helmet
CORS
Rate Limit
validação
sanitização
```

PostgreSQL e Redis não deverão ser expostos externamente por padrão.

Expor apenas Web e API quando necessário.

------------------------------------------------------------------------

# 51. PROCESSAMENTO INCREMENTAL

Configurar:

``` env
BUSINESS_REFRESH_DAYS=7
WEBSITE_REFRESH_DAYS=30
PHONE_REFRESH_DAYS=30
```

Não repetir análises recentes desnecessariamente.

------------------------------------------------------------------------

# 52. HISTÓRICO DE EXECUÇÕES

Nunca sobrescrever execuções anteriores.

Permitir comparar crescimento de empresas e oportunidades entre
execuções.

------------------------------------------------------------------------

# 53. RECONCILIAÇÃO POSTGRESQL × BULLMQ

Criar `QueueReconciliationService`.

Executar na inicialização e periodicamente.

Se PostgreSQL indicar `QUEUED` e BullMQ não possuir job, recriar o job.

Se PostgreSQL indicar `COMPLETED` e BullMQ possuir job pendente,
remover/cancelar o job órfão.

**Regra: PostgreSQL vence.**

------------------------------------------------------------------------

# 54. RECOVERY SERVICE

Criar `RecoveryService`.

Procurar processos `RUNNING` com heartbeat expirado.

Fluxo:

``` text
RUNNING
 ↓
RECOVERING
 ↓
checkpoint
 ↓
recriar job
 ↓
RUNNING
```

------------------------------------------------------------------------

# 55. TRANSAÇÕES

Operações críticas deverão utilizar transações.

Exemplo:

``` text
BEGIN
UPSERT business
INSERT discovery_event
UPDATE checkpoint
COMMIT
```

Em erro, executar rollback.

Checkpoint nunca poderá avançar sem que os dados correspondentes tenham
sido persistidos.

------------------------------------------------------------------------

# 56. GRACEFUL SHUTDOWN

Workers deverão tratar SIGTERM e SIGINT.

Fluxo:

``` text
receber SIGTERM
 ↓
parar novos jobs
 ↓
finalizar operação crítica
 ↓
salvar checkpoint
 ↓
atualizar heartbeat/status
 ↓
fechar conexões
 ↓
encerrar
```

Configurar `stop_grace_period` adequado.

------------------------------------------------------------------------

# 57. MÉTRICAS COMERCIAIS

Calcular:

``` text
Empresas encontradas
Novas empresas
Leads qualificados
Mensagens enviadas
Mensagens entregues
Mensagens lidas
Respostas
Interessados
Propostas
Clientes
```

E taxas:

``` text
Delivery Rate
Read Rate
Reply Rate
Interest Rate
Conversion Rate
```

------------------------------------------------------------------------

# 58. MVP 1

Implementar primeiro:

``` text
Docker Compose
PostgreSQL
Redis
NestJS
Next.js
Prisma
BullMQ
Worker
Scheduler
Recovery Service
Google Places Provider
Busca manual
Busca agendada
Empresas
Site
Telefone
Rating
Reviews
Deduplicação
Checkpoints
Recovery
Dashboard
CSV/XLSX
```

MVP 1 deverá estar completamente funcional antes de avançar.

------------------------------------------------------------------------

# 59. MVP 2

``` text
Grid geográfico
Website Analyzer
PageSpeed
Lead Score
Snapshots
Histórico
Autopilot
Analytics
```

------------------------------------------------------------------------

# 60. MVP 3

``` text
CRM
WhatsApp Business Platform
Campanhas
Scheduler de campanhas
Webhooks
Opt-out
Analytics comercial
```

------------------------------------------------------------------------

# 61. MVP 4

``` text
IA
Análise automática
Personalização
Sugestão de oferta
Segmentação inteligente
```

------------------------------------------------------------------------

# 62. ORDEM DE DESENVOLVIMENTO

Primeiro gerar:

``` text
ARCHITECTURE.md
DATABASE.md
DOCKER.md
RECOVERY.md
ROADMAP.md
```

Depois implementar:

``` text
1. Monorepo
2. Docker Compose
3. PostgreSQL
4. Prisma
5. Redis
6. NestJS
7. Next.js
8. BullMQ
9. Workers
10. Scheduler
11. Recovery Service
12. Queue Reconciliation
13. Checkpoints
14. Google Provider
15. Busca manual
16. Busca agendada
17. Grid geográfico
18. Deduplicação
19. Dashboard
20. Exportação
21. Website Analyzer
22. Lead Score
23. Autopilot
24. CRM
25. WhatsApp
26. Analytics
```

------------------------------------------------------------------------

# 63. VALIDAÇÃO OBRIGATÓRIA A CADA ETAPA

Após cada etapa:

``` text
BUILD
 ↓
LINT
 ↓
TEST
 ↓
DOCKER BUILD
 ↓
SUBIR CONTAINER
 ↓
HEALTHCHECK
 ↓
TESTAR FUNCIONALIDADE
 ↓
CORRIGIR ERROS
 ↓
AVANÇAR
```

Não avançar deixando erros conhecidos.

------------------------------------------------------------------------

# 64. TESTES CRÍTICOS

Criar testes para:

``` text
deduplicação
idempotência
UPSERT
checkpoints
recovery
scheduler
reconciliation
graceful shutdown
retry
backoff
lead score
normalização telefone
opt-out
campanhas
rate limits
```

Criar teste de recuperação:

``` text
iniciar processamento
 ↓
processar 50%
 ↓
derrubar worker
 ↓
subir worker
 ↓
Recovery Service detectar
 ↓
retomar
 ↓
finalizar 100%
 ↓
garantir ausência de duplicação
```

------------------------------------------------------------------------

# 65. CENÁRIO PRINCIPAL DE RESILIÊNCIA

Exemplo:

``` text
Goiânia
50.000 empresas
```

Processamento começa às 02:00.

Às 04:30 existem 28.000 empresas processadas e o computador desliga.

Quando o computador voltar:

``` text
PostgreSQL inicia
 ↓
Scheduler inicia
 ↓
Recovery Service inicia
 ↓
detecta processamento incompleto
 ↓
consulta checkpoint
 ↓
identifica células restantes
 ↓
recria jobs
 ↓
continua aproximadamente do ponto interrompido
 ↓
finaliza processamento
```

Sem recriar as primeiras 28.000 empresas, sem perder informações e sem
depender do estado anterior do Redis.

------------------------------------------------------------------------

# 66. EXPERIÊNCIA FINAL

Quero ligar meu computador e permitir que Docker Desktop inicie
automaticamente os containers:

``` text
prospector-web
prospector-api
prospector-worker
prospector-scheduler
prospector-postgres
prospector-redis
```

Acesso:

``` text
http://localhost:3000
```

Dashboard deverá mostrar status do sistema, AUTOPILOT, DRY RUN, próxima
execução, última execução e estatísticas.

Posso executar manualmente ou deixar AUTOPILOT ON.

------------------------------------------------------------------------

# 67. PRINCÍPIO ARQUITETURAL FINAL

``` text
                  POSTGRESQL
              FONTE DE VERDADE
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    Scheduler     Recovery    Reconciliation
        │            │            │
        └────────────┼────────────┘
                     ▼
                   Redis
                     │
                   BullMQ
                     │
              ┌──────┴──────┐
              ▼             ▼
           Worker 1       Worker N
              │             │
              └──────┬──────┘
                     ▼
                 Providers
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
       Google     Websites    WhatsApp
         │           │           │
         └───────────┼───────────┘
                     ▼
                 PostgreSQL
                     │
            ┌────────┼────────┐
            ▼        ▼        ▼
        Dashboard   CRM     Export
```

**REGRA ABSOLUTA:**

``` text
POSTGRESQL = ESTADO
REDIS/BULLMQ = EXECUÇÃO
WORKER = PROCESSAMENTO
SCHEDULER = DISPARO
RECOVERY = RECUPERAÇÃO
RECONCILIATION = CONSISTÊNCIA
```

O sistema deverá conseguir reconstruir seu estado operacional utilizando
somente PostgreSQL + configurações.

Redis poderá ser completamente apagado e recriado sem causar perda dos
dados permanentes da aplicação.

------------------------------------------------------------------------

# 68. REGRAS FINAIS DE IMPLEMENTAÇÃO

1.  Não utilizar pseudocódigo quando puder implementar código funcional.
2.  Utilizar TypeScript strict.
3.  Criar migrations Prisma.
4.  Criar índices PostgreSQL adequados.
5.  Utilizar transações nas operações críticas.
6.  Implementar idempotência.
7.  Implementar checkpoints persistentes.
8.  Implementar heartbeat.
9.  Implementar Recovery Service.
10. Implementar Queue Reconciliation.
11. Implementar graceful shutdown.
12. Implementar retries e exponential backoff.
13. Implementar Dead Letter Queue quando aplicável.
14. Não depender do Redis como armazenamento permanente.
15. Não depender do navegador aberto.
16. Não perder processamento após restart.
17. Não duplicar empresas.
18. Não duplicar mensagens.
19. Não executar novamente etapas recentes desnecessariamente.
20. Não armazenar secrets no Git.
21. Criar `.env.example`.
22. Criar README completo.
23. Criar Swagger.
24. Criar healthchecks.
25. Criar logs estruturados.
26. Implementar rotação de logs.
27. Criar backup/restore.
28. Implementar testes automatizados.
29. Priorizar APIs oficiais.
30. Não implementar mecanismos destinados a contornar proteções
    anti-spam, limites ou políticas dos providers.
31. Implementar DRY RUN antes de qualquer envio real.
32. AUTO_SEND_CAMPAIGNS deverá ser `false` por padrão.
33. Toda operação externa potencialmente duplicável deverá possuir
    idempotency key.
34. O banco deverá sempre prevalecer em inconsistências entre PostgreSQL
    e BullMQ.
35. O sistema deverá conseguir operar por horas ou dias sem intervenção
    manual.

------------------------------------------------------------------------

# RESULTADO FINAL ESPERADO

Quero transformar meu computador em um **servidor local autônomo de
prospecção B2B**, totalmente executado através de Docker.

Fluxo:

``` text
Escolher cidade
      ↓
Mapear empresas
      ↓
Salvar PostgreSQL
      ↓
Identificar novas empresas
      ↓
Analisar presença digital
      ↓
Identificar site
      ↓
Analisar avaliações
      ↓
Identificar telefone/WhatsApp
      ↓
Calcular Lead Score
      ↓
Gerar oportunidades
      ↓
CRM
      ↓
CSV/XLSX
      ↓
Campanhas
      ↓
WhatsApp
      ↓
Acompanhar respostas
      ↓
Conversões
```

Tudo poderá ser:

``` text
MANUAL
ou
AGENDADO
ou
AUTÔNOMO
```

E deverá sobreviver a:

``` text
restart de container
restart do Docker
restart do Windows
queda de internet
timeout de API
rate limit
worker crash
Redis perdido
processamento interrompido
```

sem perder o progresso já persistido no PostgreSQL.

O resultado deve ser um projeto **local-first, Docker-first, resiliente,
persistente, idempotente, incremental, recuperável e preparado para
operar autonomamente por longos períodos**.
