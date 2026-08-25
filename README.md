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

Cada prospecção resolve o viewport da cidade pela Places API (New), divide-o em células geográficas persistentes e restringe cada busca ao retângulo da célula. O progresso pode ser acompanhado na coluna **Células** e em `GET /runs/:id/cells`. Ajuste `GRID_CELL_SIZE_METERS`, `GRID_MAX_CELLS` e `GOOGLE_PLACES_MAX_PAGES_PER_CELL` no `.env` para controlar cobertura, custo e volume. A resolução do viewport e as buscas usam somente a Places API (New); não é necessário habilitar a Geocoding API.

Empresas com website são enviadas para a fila persistente **Website Analyzer**. O worker verifica status HTTP, HTTPS/SSL, tempo de resposta, viewport, title, description, WordPress e tecnologias, atualiza o Lead Score e mantém o resultado em `WebsiteAnalysis`. A análise também pode ser refeita na tela **Empresas** ou por `POST /businesses/:id/website-analysis`; o histórico fica em `GET /businesses/:id/website-analyses`. Destinos locais, redes privadas, portas não web e redirects inseguros são bloqueados.

Sem `PAGESPEED_API_KEY`, o score de performance usa um resultado de demonstração determinístico; com a chave, o worker consulta o PageSpeed Insights (`PAGESPEED_STRATEGY`, `PAGESPEED_TIMEOUT_MS`) e grava `performanceScore` em `WebsiteAnalysis` e `Business`. Um score de performance abaixo de 50 soma pontos ao Lead Score. Falhas na consulta ao PageSpeed não derrubam a análise do site: o restante do resultado é persistido normalmente.

O scheduler também reenfileira automaticamente análises de website concluídas há mais de `WEBSITE_REFRESH_DAYS` dias, em lotes de `WEBSITE_REFRESH_BATCH_SIZE` por ciclo, para manter o Website Analyzer atualizado sem reprocessar sites analisados recentemente.

## Operação e resiliência

Use `docker compose down` para parar sem apagar dados. Apenas `docker compose down -v` remove volumes. O scheduler reconcilia o estado a cada 30 segundos; apagar o volume Redis não apaga empresas, runs, checkpoints, schedules ou campanhas.

Comandos auxiliares estão no `Makefile`. Logs estruturados em JSON vão simultaneamente para stdout (`docker compose logs -f`) e para o volume persistente `logs_data`, em `/storage/logs/`: `api.log`, `worker.log`, `scheduler.log`, `recovery.log`, `whatsapp.log` e `errors.log`. A rotação usa 10 MB e cinco históricos por padrão; ajuste `LOG_MAX_BYTES` e `LOG_MAX_FILES` no `.env` quando necessário. Exports ficam no volume `exports_data`; backups usam `scripts/backup.sh` e o volume `backups_data`.

## Desenvolvimento

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Testes e lint também rodam dentro do ambiente Docker: `make test` e `make lint`.
