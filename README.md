# ▲ Painel de Monitoramento Vercel

Dashboard em tempo real dos seus projetos e deployments na Vercel. Mostra
todos os projetos, estados dos deployments (READY / ERROR / BUILDING…),
deployments das últimas 24h e 7 dias, tempo médio de build e a lista dos
deployments mais recentes — tudo com auto-refresh a cada 30 segundos.

**Deploy:** https://vercel-monitor-api.vercel.app/

## Como funciona

- `public/index.html` — o painel (frontend, sem dependências externas)
- `api/summary.js` — totais agregados + estados dos deployments
- `api/projects.js` — lista de projetos com o último deployment
- `api/deployments.js` — deployments recentes
- `lib/vercel.js` — helper que chama a API oficial da Vercel

O **token nunca fica no código**. Ele é lido da variável de ambiente
`VERCEL_TOKEN` no servidor (funções serverless), então o navegador nunca vê
o token.

## Configuração (passo a passo)

1. Crie um token em **https://vercel.com/account/tokens**
2. No projeto na Vercel, vá em **Settings → Environment Variables**
3. Adicione a variável:
   - Nome: `VERCEL_TOKEN`
   - Valor: o token gerado
   - Ambientes: Production, Preview e Development
4. (Opcional) Se os projetos pertencem a um **Team**, adicione também
   `VERCEL_TEAM_ID` com o ID do time.
5. Faça um **Redeploy** para aplicar as variáveis.

## Rodar localmente

```bash
npm i -g vercel
cp .env.example .env        # e preencha o VERCEL_TOKEN
vercel dev
```

## Endpoints da API

| Rota | Descrição |
|------|-----------|
| `GET /api/summary` | Usuário, totais e contagem por estado |
| `GET /api/projects` | Lista de projetos |
| `GET /api/deployments?limit=30` | Deployments recentes |

## Segurança

- O token é secreto: fica só como variável de ambiente, nunca no repositório.
- O `.gitignore` bloqueia `.env` para evitar vazamentos.
- Se um token for exposto, revogue-o em vercel.com/account/tokens e gere outro.
