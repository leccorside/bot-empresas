import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes de integração compartilham um único PostgreSQL/Redis reais (sem banco de teste isolado).
    // Rodar arquivos de teste em paralelo corrompe asserções sobre agregados globais (ex.: contagens
    // totais) por corrida entre arquivos. Serializa a execução para manter os testes determinísticos.
    fileParallelism: false,
  },
});
