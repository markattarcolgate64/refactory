import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../');

function safeJoin(...parts: string[]): string {
  const resolved = path.resolve(PROJECT_ROOT, ...parts);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error('Unsafe path detected');
  }
  return resolved;
}

export function writeFile(relPath: string, content: string): void {
  const absPath = safeJoin(relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
}

export function deleteFile(relPath: string): void {
  const absPath = safeJoin(relPath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}

export function createDirectory(relPath: string): void {
  const absPath = safeJoin(relPath);
  fs.mkdirSync(absPath, { recursive: true });
}

export function deleteDirectory(relPath: string): void {
  const absPath = safeJoin(relPath);
  if (fs.existsSync(absPath)) {
    fs.rmdirSync(absPath, { recursive: true });
  }
}
