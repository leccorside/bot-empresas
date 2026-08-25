import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger, RotatingFileStream } from '../packages/shared/src';

const temporaryDirectories: string[] = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'prospector-logs-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('logs estruturados e persistentes', () => {
  it('grava JSON no arquivo do serviço e replica erros no errors.log', () => {
    const directory = temporaryDirectory();
    const log = logger('api', { directory, stdout: false });

    log.info({ requestId: 'request-123', statusCode: 200 }, 'request completed');
    log.error({ requestId: 'request-456', statusCode: 500 }, 'request failed');
    log.flush();

    const apiLines = readFileSync(join(directory, 'api.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const errorLines = readFileSync(join(directory, 'errors.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(apiLines).toHaveLength(2);
    expect(apiLines[0]).toMatchObject({ service: 'api', requestId: 'request-123', statusCode: 200, msg: 'request completed' });
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toMatchObject({ level: 50, service: 'api', requestId: 'request-456', msg: 'request failed' });
  });

  it('rotaciona por tamanho e respeita o limite de históricos', () => {
    const directory = temporaryDirectory();
    const filename = join(directory, 'worker.log');
    const stream = new RotatingFileStream(filename, 40, 2);

    stream.write('primeira-linha-com-30-caracteres\n');
    stream.write('segunda-linha-com-30-caracteres\n');
    stream.write('terceira-linha-com-30-caracteres\n');

    expect(existsSync(filename)).toBe(true);
    expect(existsSync(`${filename}.1`)).toBe(true);
    expect(existsSync(`${filename}.2`)).toBe(true);
    expect(existsSync(`${filename}.3`)).toBe(false);
    expect(readFileSync(filename, 'utf8')).toContain('terceira');
  });

  it('sanitiza nomes de serviços antes de criar arquivos', () => {
    const directory = temporaryDirectory();
    const log = logger('Custom Service/Unsafe', { directory, stdout: false });
    log.info('online');
    log.flush();
    expect(existsSync(join(directory, 'custom-service-unsafe.log'))).toBe(true);
  });
});
