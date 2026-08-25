# Banco de dados

O schema Prisma está em `packages/database/prisma/schema.prisma`. Chaves únicas em provider/providerId, telefone normalizado, idempotencyKey e campanha/empresa evitam duplicidade. Checkpoints e a entidade associada são atualizados na mesma transação. Índices cobrem status, heartbeat, cidade, score e datas operacionais.

`WebsiteAnalysis` armazena uma análise por empresa e versão/URL, com estado, tentativas, resultado técnico e erro. A chave `website-analysis:{businessId}:{version}` liga a intenção durável ao `JobRecord`; os campos resumidos em `Business` representam a análise mais recente do website atual.

Migrations são aplicadas automaticamente no boot dos serviços por `prisma migrate deploy`. O volume `postgres_data` sobrevive a `docker compose down`.
