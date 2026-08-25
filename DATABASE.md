# Banco de dados

O schema Prisma está em `packages/database/prisma/schema.prisma`. Chaves únicas em provider/providerId, telefone normalizado, idempotencyKey e campanha/empresa evitam duplicidade. Checkpoints e a entidade associada são atualizados na mesma transação. Índices cobrem status, heartbeat, cidade, score e datas operacionais.

Migrations são aplicadas automaticamente no boot dos serviços por `prisma migrate deploy`. O volume `postgres_data` sobrevive a `docker compose down`.
