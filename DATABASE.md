# Banco de dados

O schema Prisma está em `packages/database/prisma/schema.prisma`. Chaves únicas em provider/providerId, telefone normalizado, idempotencyKey e campanha/empresa evitam duplicidade. Checkpoints e a entidade associada são atualizados na mesma transação. Índices cobrem status, heartbeat, cidade, score e datas operacionais.

`WebsiteAnalysis` armazena uma análise por empresa e versão/URL, com estado, tentativas, resultado técnico, score de performance (PageSpeed, opcional) e erro. A chave `website-analysis:{businessId}:{version}` liga a intenção durável ao `JobRecord`; os campos resumidos em `Business` (incluindo `performanceScore`) representam a análise mais recente do website atual.

`AutopilotTarget` guarda a fila persistente de cidades/categorias do Autopilot; `ProspectingRun.autopilotTargetId` liga cada execução disparada automaticamente ao seu alvo de origem, permitindo contabilizar cidades simultâneas e limites diário/mensal sem depender do Redis.

`MessageTemplate` guarda o registro de templates de mensagem WhatsApp (nome único, corpo com placeholders `{{1}}`, `{{2}}`..., status de aprovação). `Campaign.templateId` referencia o template usado; `Campaign.messageTemplate` guarda uma cópia do corpo no momento da criação, preservando o que foi efetivamente enviado mesmo que o template seja editado depois.

`BusinessInsight` guarda a análise e a sugestão de abordagem geradas por IA para uma empresa (relação 1:1 com `Business`, regenerar sobrescreve a mesma linha) e a flag `approved`, marcada manualmente quando um humano valida o texto.

Migrations são aplicadas automaticamente no boot dos serviços por `prisma migrate deploy`. O volume `postgres_data` sobrevive a `docker compose down`.
