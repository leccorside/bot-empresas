# Arquitetura

O Local Prospector é um monólito modular distribuído em quatro processos: Web (Next.js), API (NestJS), Worker (BullMQ) e Scheduler/Recovery. PostgreSQL é a única fonte de verdade. Redis contém apenas trabalho reconstruível.

`API → PostgreSQL (intenção) → BullMQ (execução) → Worker → PostgreSQL (resultado)`

O Website Analyzer possui fila e estado persistente próprios. A descoberta apenas registra a intenção; workers independentes analisam os sites com concorrência e limite de requisições configuráveis. O scheduler reconstrói análises pendentes ou abandonadas a partir do PostgreSQL após perda do Redis.

Os módulos de domínio são prospecções, empresas, automações, filas, CRM, campanhas, exportações e saúde. Toda execução tem status persistente, heartbeat e checkpoints. O scheduler reconcilia periodicamente PostgreSQL e Redis e recupera execuções abandonadas.

As integrações ficam atrás de interfaces. O Google Places Text Search é o provider inicial; sem chave, um provider de demonstração determinístico mantém o fluxo local testável. Mensagens usam WhatsApp Cloud API e nunca são enviadas em `DRY_RUN`.
