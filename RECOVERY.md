# Recuperação

O scheduler executa dois laços idempotentes. A reconciliação recria jobs de runs `PENDING`, `QUEUED` ou `RECOVERING` ausentes no BullMQ e remove jobs pendentes de runs terminais. A recuperação encontra runs `RUNNING` com heartbeat expirado, marca `RECOVERING` e volta a enfileirá-las.

O worker consulta células e checkpoints persistidos. Células concluídas não são refeitas. SIGTERM fecha workers após o trabalho crítico e persiste o heartbeat corrente.

Análises de website em `WAITING`, `RECOVERING` ou `ACTIVE` sem atualização dentro do timeout também são reconstruídas. A combinação empresa/versão e a chave de idempotência impedem análises duplicadas durante a recuperação.

Jobs que esgotam as tentativas são copiados para a `dead-letter` com ID determinístico. O `JobRecord` permanece como fonte durável; por isso a DLQ também é reconstruída depois de uma perda do Redis. A reconciliação remove jobs órfãos e corrige estados duráveis que apontam para runs, análises, campanhas ou lotes já terminados ou removidos.

## Drill real de Redis

Com todas as entidades executáveis paradas, rode:

```powershell
./scripts/test-disaster-recovery.ps1 -Execute
```

O script para worker e scheduler, cria um job sintético durável, apaga o Redis, confirma que a reconciliação recriou exatamente um job, remove o cenário e reconstrói novamente as filas reais antes de religar o worker. Se houver trabalho real em andamento, o teste aborta sem apagar o Redis.

## Backup e restauração

`backup.sh` testa o gzip e chama `verify-restore.sh`, que restaura o dump em um banco temporário e executa uma consulta de sanidade. Somente depois grava `.last_verified`. Para validar manualmente um arquivo sem alterar o banco principal:

```sh
sh /scripts/restore.sh --verify-only /storage/backups/prospector_YYYYMMDD_HHMMSS.sql.gz
```
