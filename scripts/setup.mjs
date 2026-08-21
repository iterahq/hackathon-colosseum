#!/usr/bin/env node
// `npm run setup` — checa o NODE_AUTH_TOKEN ANTES do `npm install`, porque o erro
// que o npm dá sozinho manda pro caminho errado: token fine-grained devolve
// `403 does not match expected scopes`, que se lê como "faltou marcar um escopo"
// quando o problema é o TIPO do token. Custou a primeira story do designer.
import { spawnSync } from 'node:child_process';

const PROBE = 'https://npm.pkg.github.com/@iterahq%2factivity-spec';

const HOW_TO = `
Como criar o token (uma vez só):

  1. https://github.com/settings/tokens  ->  "Tokens (classic)"  ->  Generate new token (classic)
  2. Marque SOMENTE o escopo  read:packages
  3. Gere, e na lista de tokens clique  "Configure SSO"  ->  Authorize  na org  iterahq
     ^ sem este passo o token existe e mesmo assim não enxerga os pacotes @iterahq
  4. export NODE_AUTH_TOKEN=ghp_...      (e rode 'npm run setup' de novo)

Para não reexportar a cada terminal, ponha o export no seu ~/.zshrc ou ~/.bashrc.
NUNCA escreva o token no .npmrc do repositório — esse arquivo é versionado.
`;

function fail(message) {
  console.error(`\n✖ ${message}\n${HOW_TO}`);
  process.exit(1);
}

const token = process.env.NODE_AUTH_TOKEN;

if (!token) {
  fail(
    'NODE_AUTH_TOKEN não está no ambiente.\n' +
      '  O .npmrc roteia o escopo @iterahq para o GitHub Packages (registry privado),\n' +
      '  e @iterahq/activity-spec só resolve de lá.',
  );
}

if (token.startsWith('github_pat_')) {
  fail(
    'Esse é um token FINE-GRAINED, e o registry npm do GitHub não aceita.\n' +
      '  Ele responde 403 "does not match expected scopes", que parece escopo faltando\n' +
      '  mas é o tipo do token. Gere um CLASSIC.',
  );
}

console.log('Validando o token contra o GitHub Packages…');

const response = await fetch(PROBE, {
  headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
});

if (response.status === 401) {
  fail('401 — o registry não aceitou o token. Ele foi revogado ou está incompleto.');
}

if (response.status === 403) {
  const body = await response.text();
  fail(
    `403 — token recusado. Resposta do registry: ${body.slice(0, 200)}\n` +
      '  Quase sempre é uma destas duas: falta o escopo read:packages, ou falta\n' +
      '  autorizar o SSO da org iterahq (passo 3 abaixo).',
  );
}

if (response.status === 404) {
  fail(
    '404 — o registry não mostra @iterahq/activity-spec para este token.\n' +
      '  O pacote é privado, então 404 aqui costuma ser SSO não autorizado para a org\n' +
      '  iterahq, e não pacote inexistente.',
  );
}

if (!response.ok) {
  fail(`${response.status} — resposta inesperada do registry.`);
}

console.log('✔ Token OK. Instalando…\n');

const install = spawnSync('npm', ['install'], { stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status ?? 1);

console.log(`
✔ Pronto.

  npm run dev          app         -> http://localhost:8080
  npm run storybook    componentes -> http://localhost:6006

Stories de design vão em  design-playground/  (é a sua área, sem gate de review).
`);
