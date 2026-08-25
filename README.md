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

## Operação e resiliência

Use `docker compose down` para parar sem apagar dados. Apenas `docker compose down -v` remove volumes. O scheduler reconcilia o estado a cada 30 segundos; apagar o volume Redis não apaga empresas, runs, checkpoints, schedules ou campanhas.

Comandos auxiliares estão no `Makefile`. Logs estruturados em JSON vão simultaneamente para stdout (`docker compose logs -f`) e para o volume persistente `logs_data`, em `/storage/logs/`: `api.log`, `worker.log`, `scheduler.log`, `recovery.log`, `whatsapp.log` e `errors.log`. A rotação usa 10 MB e cinco históricos por padrão; ajuste `LOG_MAX_BYTES` e `LOG_MAX_FILES` no `.env` quando necessário. Exports ficam no volume `exports_data`; backups usam `scripts/backup.sh` e o volume `backups_data`.

## Desenvolvimento

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Testes e lint também rodam dentro do ambiente Docker: `make test` e `make lint`.
