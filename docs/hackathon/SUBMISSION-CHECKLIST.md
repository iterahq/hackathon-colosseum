# Checklist de submissão — Colosseum "Crypto World's Fair" (estado de 2026-10-11, main `f93240f`)

Para o Samuel (e o Tainan onde indicado). Prazo: **2026-10-13 03:59 BRT**. Meta interna: enviar até 2026-10-12 22:00 BRT.
Só o que depende de uma pessoa está aqui, na ordem de execução, com tempo estimado. O que as lanes já fecharam não está.
Itens marcados **(confirmar no site do Colosseum)** não vêm de fonte primária deste repositório. Nunca ponha senha, chave ou
token neste repositório.

Fontes: roteiro `~/hackathon-pitch.md` (v3, pessoal), ensaio `/tmp/hk/orch/demo-rehearsal/REHEARSAL.md`, teste da Phantom
`docs/hackathon/PHANTOM-TEST.md`, números reais em `/tmp/hk/orch/PROOF-STATUS.md` ("REAL NUMBERS").

## Hoje, antes de gravar (≈ 1 h 30)

1. **Saldos de devnet (2 min).** Autoridade `CPq4…VJq8B` (≥ 1,5 SOL; tinha 11,4 em 11/10), tesouraria `AMoT…J3cA` (≥ 0,5),
   carteira do dono `CQzi…DAhW` (≥ 0,03). Comando no roteiro §6. Sem saldo na autoridade a cerimônia não abre.
2. **Phantom real (15 min).** `docs/hackathon/PHANTOM-TEST.md`, seis passos, com uma conta de teste (nunca a do dono).
   Nenhuma máquina fez isso; é o maior risco aberto. Anotar o que apareceu e as linhas `[wallet]` do console.
3. **Conta do patrocinador (5 min).** Entrar com o e-mail do patrocinador (`~/.config/itera-hackathon/bounty-sponsor.env`),
   trocar o idioma para EN uma vez (fica salvo no perfil), abrir `/bounties/manage` e conferir que a bounty do take
   ("Semantic page for a study group", 3 dias, 0,05 SOL) está aberta e financiada. O ensaio consumiu a de 1 dia (0,03
   SOL): se quiser uma bounty de 1 dia para jurado novo, postar outra pelo painel (2 min).
4. **Ensaio das atividades abertas do dia 5 (20 min).** Na conta demo de e-mail (`demo@hackathon.iterahq.dev`), 2x. Solução
   do exercício de código salva num arquivo. Conferir quantas atividades do dia 5 faltam na conta do dono (não resolver).
5. **Abas e máquina (10 min).** App em EN, zoom 110%, 1920×1080, só a extensão Phantom (devnet). As 8 abas do roteiro §3 na
   ordem, **com a lição do dia 5 já aberta e quente** (carga fria leva ~10 s). OBS com áudio do desktop. Celular não é
   necessário na v3 (o Blink saiu do demo).
6. **Teleprompter (5 min).** Linhas pt-BR do §2 e §3. Água. Se for antes das 8h BRT, esperar (medalha early_bird alonga a cerimônia).

## Gravação (≈ 1 h 30)

7. **Demo, um take (30 min com repetições).** Roteiro §3. Esperas medidas no ensaio: cerimônia 5–15 s; se ela não vier,
   reabrir a lição e terminar de novo. **Segurar 5 s o cartão "What you proved / What this opened"**: é o frame mais forte.
   Aceitar bounty 4 s, entregar 2 s, **aprovar → pago 40 s** (falar por cima ou cortar), loja 7–10 s até "Done!".
   Depois do take: não mexer na conta do dono até o corte estar pronto.
8. **Pitch, talking head (30 min).** Roteiro §2, cada linha 2x. Primeira e última frase em inglês.
9. **Capturas estáticas (15 min).** Dashboard, duas atividades, `/u/CQzi…`, `/c/Dk35…` com a conta do dono já dourada.

## Edição (≈ 3 h)

10. Legendas EN queimadas (≤ 42 caracteres por linha, 48 px em 1080p). Pitch ≤ 2:45, demo ≤ 3:00. Selo "devnet" no canto.
    Não acelerar mais que 1,5x. Corte permitido em 1:35 e 2:05 do demo.
11. YouTube não listado ou Loom; testar o link em aba anônima **(confirmar formato/hospedagem no site do Colosseum)**.

## Submissão (≈ 1 h)

12. **Números (15 min).** `grep '\[\[' ~/hackathon-pitch.md` e preencher: mês/ano em produção, alunos (itera-player),
    seguidores/alunos DFL, preço, alunos ativos, turmas, assinantes pagos, anos do Tainan, dado de tração DFL, e
    **alunos reais que entraram nesta cópia até o prazo**. Regra: número que não for verdadeiro sai do texto. Nunca
    "N alunos certificados": nesta cópia há 1 certificação real (a sua), 3 contas de gente, 0 bounties pagas a aluno real;
    os totais grandes são nossos testes na devnet e só entram com as palavras "devnet, incluindo nossos próprios testes".
13. **Contador da landing (2 min, Samuel ou LANE 2).** Depois do ÚLTIMO teste automatizado e antes de qualquer pessoa de
    fora usar o site: `select itera.tag_test_accounts();` no projeto `nyzcbnnbffsizshiolbh` (Management API ou SQL
    editor). Sem isso, contas de robôs criadas depois contam como reais na landing e na loja.
14. **Plataforma (15 min).** Samuel sai do time atual antes de criar "Itera"; cria o time; convida o Tainan; Tainan aceita.
    Cada pessoa em um time só **(confirmar no site do Colosseum)**.
15. **Repositório (10 min).** Decidir: A) manter privado e convidar `hackathon@colosseum.com` como leitor; B) público como está;
    C) cópia filtrada (perde o histórico que prova o que foi feito). Análise em `/tmp/hk/REPO-EXPOSURE-AUDIT.md`. Não há
    `LICENSE`: decidir se precisa **(confirmar no site do Colosseum)**.
16. **Campos do formulário (20 min).** Colar o §4 do roteiro (EN): descrição ≤ 100 palavras, built during / before, stack,
    integração Solana, go-to-market, limites, time. Conferir limites de tamanho e campos reais **(confirmar no site)**.
    Links: site, repo, pitch, demo, `/c/Dk35…QM45`, `/u/CQzi…DAhW`, `/bounties`.
17. **Conta pro jurado (5 min).** `demo@hackathon.iterahq.dev` + senha só nas notas privadas da submissão, e a frase
    "sign in with Phantom on devnet; the app gives you 0.01 SOL once". Tesouraria ≥ 0,4 SOL (torneira: 0,3 SOL/dia).
18. **Enviar** e guardar o comprovante.

## Depois de enviar (10 min)

19. Site em aba anônima às 22:00 de 12/10 e de novo depois do prazo (`/`, `/c/Dk35…`, `/u/CQzi…`, `/bounties`).
20. Conferir que o convite do repositório foi aceito (opção A) ou que o repositório público não expõe segredo (B/C).

## O que o código já garante (não precisa de ninguém)

- README, `docs/hackathon/BUILT-DURING-HACKATHON.md` e este arquivo batem com `main` (refazer os números com os comandos do
  disclosure se houver merge novo: `git rev-list --count 1f5b925b..origin/main`, `ls supabase/functions | grep -vc _shared`,
  `ls db/migrations | awk -F_ '$1>=110' | wc -l`, `gh pr list --state merged --limit 200`).
- Prévias de link (`/c`, `/u`, `/gift`), manifest, ícones, títulos de aba, faixa offline, rate limit nas funções públicas.
- O laço inteiro (aprender → carimbo corrigido no servidor → claims na chain → bounty paga pelo programa → compra no asset)
  foi ensaiado ponta a ponta na devnet em 11/10 com carteira descartável e explorer em cada passo.
