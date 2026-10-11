# Teste manual com a Phantom REAL (dono) — compra na Loja do Tera

Por quê: até agora a compra só foi provada com uma Phantom simulada (`scripts/hackathon/browser-e2e.mjs`).
O código fala com a extensão pelo mesmo canal que a Phantom usa internamente (`request({ method: 'signAndSendTransaction',
params: { message } })`), e tem um plano B (assinar sem enviar; o servidor transmite na devnet). Este roteiro prova os dois
caminhos e cada falha. Tempo: ~15 min. Custo: ~0,004 SOL de devnet (torneira paga a primeira compra).

Preparo (uma vez)
- Chrome/Brave desktop com a extensão Phantom instalada e uma conta NOVA (ou vazia).
- Phantom > Configurações > Developer Settings > **Testnet Mode ON** (fica na devnet). Confira: o saldo mostra "Devnet".
- Abra o DevTools (F12) na aba Console antes de começar: toda tentativa escreve `[wallet] attempt request|sign` e, se
  falhar, `[wallet] <attempt> <code> <message>`. Copie essas linhas em cada passo que der errado.
- Site: https://hackathon-colosseum.178-105-2-230.sslip.io

## Passo 1 — entrar com a carteira
1. `/login` → "Continuar com Phantom". A Phantom abre UM pedido de assinatura de mensagem ("Sign in to Itera", domínio do site).
2. Aprove. Esperado: entra direto, pede apelido (primeira vez), dashboard com o Tera no header em até ~1 s.
3. Falha a observar: se a Phantom abrir pedido de *conexão* e nada mais, ou o site ficar em "entrando…" > 5 s → anote.
   Se aparecer "Nenhuma carteira encontrada" com a Phantom instalada: recarregue a página uma vez (a extensão injeta tarde às vezes).

## Passo 2 — compra com carteira VAZIA (torneira)
1. `/shop` → aba Loja → "Vidas" → qualquer pacote → **Pagar com SOL**.
2. Esperado: modal "Saldo insuficiente na devnet: esta compra precisa de cerca de 0,0X SOL" com botão **Pegar SOL de teste**.
   Toque. Esperado: "Enviando SOL de teste…" (~3 s) e a compra reinicia sozinha → a Phantom abre a transação.
3. Na Phantom confira: rede **Devnet**, destinatário = tesouro, valor = preço, um memo. **Aprove.**
4. Esperado: "Confirmando na Solana…" (2–8 s) → "Pronto!" com linha **Pagamento ↗** (explorer, cluster devnet) e, para
   vidas, "Vidas recarregadas: N/M". Abra o link do explorer: a transação existe e tem o memo.
5. Falhas e o que o app DEVE dizer:
   - Fechou a Phantom sem aprovar → o modal some em silêncio (nenhuma mensagem de erro). Correto.
   - "A carteira não concluiu a transação. Confira se a Phantom está na devnet…" → a Phantom está na mainnet (Testnet Mode OFF)
     OU rejeitou a simulação. Ligue o Testnet Mode e toque em Tentar de novo. **Anote** as linhas `[wallet]` do console.
   - "O pedido expirou antes de a transação chegar. Nada foi cobrado." → demorou > ~1 min na Phantom. Tentar de novo.
   - Segunda janela da Phantom pedindo só ASSINATURA (sem enviar) → o plano B entrou: é esperado quando o envio falhou.
     Aprove; o servidor transmite. Anote que isso aconteceu (prova o caminho `sign`).

## Passo 3 — compra com saldo (caminho normal)
1. Compre um óculos (Personalizar → outfit) **Pagar com SOL**. Esperado: SEM modal de saldo, a Phantom abre direto.
2. Aprove. Esperado: "Pronto!" + "Você comprou: Óculos. Equipe…", botão **Equipar agora**. Equipe e veja o Tera no header mudar.
3. Em `/profile` ("Meu Tera") o item aparece como em uso; no `/c/<asset do Tera>` (link "Ver no explorer" do menu da conta)
   o atributo `outfit` aparece depois de ~30 s (espelho on-chain tem cooldown).

## Passo 4 — rejeitar e repetir (idempotência)
1. Compre outro item, **rejeite** na Phantom. Esperado: modal fecha, nada no explorer, saldo igual.
2. Compre o mesmo item de novo e aprove. Esperado: paga UMA vez. Compre o mesmo outfit de novo: o botão diz "Em uso/Equipar"
   (não deixa comprar duas vezes); se forçar pela URL, o servidor responde "Você já tem este item."

## Passo 5 — conta errada na Phantom
1. Na Phantom troque para OUTRA conta (que não é a do login). Tente comprar.
2. Esperado: "A carteira aberta no navegador não é a da sua conta. Troque de conta na Phantom e tente de novo. Nada foi
   cobrado." (Detalhes mostram os dois endereços.) Volte para a conta certa e Tentar de novo → funciona.

## Passo 6 — entrega pendente / falha depois do pagamento
1. Compre com SOL e, assim que a Phantom aprovar, **desligue a internet por ~20 s** (ou feche a aba e reabra `/shop`).
2. Com a aba aberta: o modal fica em "Confirmando…" até 30 s e então diz **"Pagamento enviado, entrega pendente"** com o
   link do pagamento e **Tentar de novo**. Reconecte e toque: ele confere A MESMA transação (a Phantom NÃO abre de novo)
   e termina em "Pronto!". Nunca deve dizer "Nada foi cobrado" quando a transação existe no explorer.
3. Com a aba fechada: ao reabrir, o item já aparece comprado (o servidor reconcilia sozinho) ou aparece na próxima
   abertura da loja. Se em 2 min não aparecer, anote o link do explorer e a hora.

## O que mandar de volta
- Para cada passo: OK ou o texto exato que apareceu + as linhas `[wallet]`/`[purchase]` do console + link do explorer.
- Versão da Phantom (Configurações > Sobre) e navegador.

Pontos conhecidos (não são bugs do teste): a torneira paga 0,01 SOL uma vez por carteira; pacotes caros mostram "Esta peça é
de vitrine"; o espelho on-chain demora até 30 s depois da compra; o pagamento sai do saldo DEVNET, nunca de SOL real.
