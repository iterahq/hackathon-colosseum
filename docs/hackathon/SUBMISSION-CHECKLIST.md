# Checklist de submissão — Colosseum "Crypto World's Fair"

Para os fundadores (Samuel e Tainan). Prazo: **2026-10-13 03:59 BRT**. Meta interna: enviar até 2026-10-12 22:00 BRT.

Legenda: itens marcados **(confirmar no site do Colosseum)** não vêm de fonte primária deste repositório; vêm do
briefing ou de memória. Confira no formulário antes de confiar. Não coloque senha, chave ou token neste repositório.

## 1. Conta e time

- [ ] Cada pessoa participa de **um** time só **(confirmar no site do Colosseum)**.
- [ ] Samuel sai do time atual antes de criar o novo (o plano do pitch registra isso; decidir o risco de time duplo).
- [ ] Samuel cria o time novo e convida o Tainan; o Tainan aceita o convite.
- [ ] Samuel preenche, no cadastro do projeto **(confirmar no site do Colosseum: nomes e obrigatoriedade dos campos)**:
  - [ ] nome do projeto: Itera
  - [ ] tagline (sugestão: "Proof of learning that lives in your wallet")
  - [ ] descrição (rascunho em `/home/samuel/hackathon-pitch.md`, seção 4)
  - [ ] links: app, repositório, pitch, demo, página de prova (certificado)
  - [ ] trilha/categoria (track) — escolher **(confirmar no site do Colosseum)**
  - [ ] envio dos dois vídeos

## 2. Repositório

O repositório `iterahq/hackathon-colosseum` é privado. Escolher uma opção (análise completa em
`/tmp/hk/REPO-EXPOSURE-AUDIT.md`, fora do repositório; resumo abaixo):

- [ ] **A. Manter privado e convidar `hackathon@colosseum.com`** como leitor (Settings > Collaborators) e conferir se o
  convite foi aceito ou se o e-mail aparece como pendente **(confirmar no site do Colosseum se aceitam esse caminho e se
  o convite precisa ser um colaborador ou uma organização)**. Expõe o produto inteiro só para quem avaliar.
- [ ] **B. Tornar público como está.** Abre o código do produto da empresa e todo o histórico anterior ao hackathon.
  Ver a auditoria antes de decidir.
- [ ] **C. Publicar uma cópia filtrada ou com histórico achatado.** Reduz a exposição, mas a cópia deixa de ter o
  histórico de commits que prova o que foi feito durante o hackathon.
- [ ] Qualquer que seja a opção, o `README.md` e `docs/hackathon/BUILT-DURING-HACKATHON.md` já fazem a divulgação do
  que existia antes (obrigatória pelas regras).
- [ ] Não há arquivo `LICENSE` no repositório. Decidir se o repositório precisa de licença para a submissão.
  **(confirmar no site do Colosseum)**

## 3. Campos escritos

Rascunhos prontos em `/home/samuel/hackathon-pitch.md`, seção 4 (em inglês): descrição do produto (até 100 palavras),
"built during the hackathon", "before the hackathon", stack, integração com Solana, go-to-market, limite conhecido, time.

- [ ] Conferir os limites de tamanho e os campos reais do formulário **(confirmar no site do Colosseum)**.
- [ ] Preencher os números que faltam (ver seção 6) e rodar `grep '\[\[' /home/samuel/hackathon-pitch.md` sem resultado.
- [ ] Ajustar o texto "PRs #1 a #36" do rascunho: o intervalo atual é #1 a #57 (55 commits; ver
  `docs/hackathon/BUILT-DURING-HACKATHON.md`). A contagem de funções (20) e de migrations (41) do rascunho também está
  desatualizada: no código são 19 funções e 34 migrations (0110 a 0143).
- [ ] Não afirmar que o "Cristal de Fênix" existe enquanto o PR #43 não estiver em `main` (só o chip de saldo do PR #56 está lá, sem backend).

## 4. Vídeos

- [ ] Pitch: 2 a 3 minutos. Roteiro em `/home/samuel/hackathon-pitch.md`, seção 2 (alvo 2:15, teto 2:45).
- [ ] Demo: até 3 minutos. Roteiro na seção 3 do mesmo arquivo (alvo 2:40, teto 3:00).
- [ ] Confirmar duração máxima, formato e onde hospedar (YouTube não listado, Loom ou upload) **(confirmar no site do
  Colosseum)**. Testar o link em aba anônima.
- [ ] Legendas em inglês queimadas; selo "devnet" no canto.

## 5. Antes de gravar

- [ ] **SOL de devnet.** Autoridade `CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B` e tesouraria
  `AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA`. Mínimos do plano: autoridade ≥ 1.5 SOL, tesouraria ≥ 0.4 SOL.
  Última leitura registrada nos arquivos de status: autoridade 0.709, tesouraria 0.356 (2026-10-10). Conferir:

  ```bash
  for a in CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA; do
    curl -s https://api.devnet.solana.com -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$a\"]}" | jq -r --arg a "$a" '"\($a[0:6]) \(.result.value/1e9) SOL"'
  done
  ```

  Se estiver baixo: faucet.solana.com (cerca de 2 SOL por dia por IP; limite que consta no plano do pitch). Sem saldo
  na autoridade, a cerimônia de carimbo não abre (`authority_unfunded`).
- [ ] Chave de RPC dedicada (por exemplo Helius) em `SOLANA_RPC_URL`, ou aceitar o risco do RPC público limitado.
- [ ] Conta de gravação preparada (carteira e estado descritos em `/home/samuel/hackathon-pitch.md`, parágrafo "Conta do dono"): não mexer nela antes do take.
- [ ] Phantom no desktop em **devnet**; Phantom no celular, segunda conta, também em devnet (Testnet Mode).
- [ ] Site responde em aba anônima: `https://hackathon-colosseum.178-105-2-230.sslip.io`.
- [ ] Página pública de certificado carrega sem login e mostra "verificado".
- [ ] App em inglês para a gravação (toggle no header), zoom 110%, 1920x1080.

## 6. Pendências do dono (segundo os arquivos de status e decisões)

- [ ] **Compra com Phantom real.** Nenhum teste automático usou uma Phantom de verdade (só uma fake). Fazer uma compra
  real com a conta 2 (por exemplo os fones, US$ 0.20) em navegador anônimo, anotar o tempo até "paid" e se caiu no
  caminho de só assinar.
- [ ] **DNS de `hackathon.iterahq.dev`.** Opcional: o site funciona em `hackathon-colosseum.178-105-2-230.sslip.io`.
  O código aceita as duas origens; se o DNS sair, trocar os links. Se não sair, usar o endereço sslip.io em todo lugar.
- [ ] **Números do pitch** (marcados `[[NÚMERO: ...]]` em `/home/samuel/hackathon-pitch.md`, seção 8): mês/ano em
  produção, alunos, seguidores/alunos DFL, preço, alunos ativos, turmas, assinantes pagos, anos de experiência, dado de
  tração DFL. Número que não for verdadeiro sai do texto.
- [ ] **Doação de SOL de devnet** pedida nos arquivos de status: 2 SOL para a autoridade.
- [ ] **Decisão sobre acesso do jurado sem Phantom** (conta de e-mail de demonstração). Se existir, a senha vai só nas
  notas privadas da submissão, nunca neste repositório.
- [ ] **Sincronizar o rascunho do pitch** com o estado de `main` (seção 3 acima) e decidir se o PR #43 entra antes do prazo.
- [ ] Teste final do blink de presente (celular, conta 2) e do endosso de professor, se forem mostrados no vídeo.

## 7. Depois de enviar

- [ ] Abrir o site em aba anônima às 22:00 do dia 12 e de novo depois do prazo.
- [ ] Conferir que o convite do repositório foi aceito (opção A) ou que o repositório público não expõe segredo (B/C).
- [ ] Guardar o comprovante de envio.
