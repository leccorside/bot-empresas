# Recuperação

O scheduler executa dois laços idempotentes. A reconciliação recria jobs de runs `PENDING`, `QUEUED` ou `RECOVERING` ausentes no BullMQ e remove jobs pendentes de runs terminais. A recuperação encontra runs `RUNNING` com heartbeat expirado, marca `RECOVERING` e volta a enfileirá-las.

O worker consulta células e checkpoints persistidos. Células concluídas não são refeitas. SIGTERM fecha workers após o trabalho crítico e persiste o heartbeat corrente.
