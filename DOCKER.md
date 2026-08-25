# Docker

Copie `.env.example` para `.env` e execute `docker compose up -d --build`. Web: 3000; API e Swagger: 3001 e 3001/docs. PostgreSQL e Redis são acessíveis somente pela rede interna.

Os containers possuem healthcheck, reinício automático e encerramento gracioso. Volumes nomeados guardam banco, Redis, exports, logs e backups. Use `docker compose down -v` apenas quando desejar apagar todos os dados.
