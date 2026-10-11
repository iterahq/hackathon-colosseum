# One outside sponsor and one real learner: a 3-minute job each

Both judges asked for the same thing: one sponsor that is not the team, one learner that is not a test account, one
delivery anyone can open. Nothing here can be done by the team's own keys without being a rehearsal, and the board
names rehearsals as such. This page is what the owner sends.

Site: https://hackathon-colosseum.178-105-2-230.sslip.io (Solana **devnet**: test SOL, no real money).

## The sponsor (3 minutes, needs Phantom on a computer)

1. Phantom → Settings → Developer settings → Testnet mode ON (network: Solana Devnet).
2. Get free test SOL: https://faucet.solana.com (paste the wallet address, 0.5 SOL is plenty).
3. Open https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/post and sign in with the wallet.
4. Fill the form (a real small task they would like done: a page, a table, a form) and press **Post and lock the reward**.
   Phantom asks for ONE signature: it creates the escrow account and moves the reward from their wallet into it.
5. Later, at https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/mine: open the delivery, press **Approve and pay**
   (one signature: the escrow pays the learner) or **Reject** with a note. If nobody delivers by the deadline the reward
   goes back to their wallet by itself; they can also take it back at any time while nobody holds the bounty.

Limits: reward 0.01 to 0.5 SOL, 3 bounties a day, deadline up to 30 days. The wallet's name for itself cannot be the
team's ("Itera", "DevFellowship").

Message to send (PT):

> Oi! Preciso de 3 minutos seus pra um teste real do meu projeto de hackathon (Solana devnet, dinheiro de teste, custo zero).
> Você posta uma tarefa pequena de HTML/CSS que te seria útil e trava uma recompensa de teste; um aluno certificado entrega
> e você aprova. Passo a passo: instale a Phantom, ligue o modo Testnet (Devnet), pegue SOL de teste em
> https://faucet.solana.com e abra https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/post

Message to send (EN):

> Hi! I need 3 minutes of yours for a real test of my hackathon project (Solana devnet, test money, zero cost). You post a
> small HTML/CSS task that would be useful to you and lock a test reward; a certified learner delivers and you approve.
> Steps: install Phantom, switch on Testnet mode (Devnet), get test SOL at https://faucet.solana.com and open
> https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/post

## The learner (about 30 minutes: Day 1 is 18 short activities)

1. Open the site, **Sign in with a wallet** (Phantom, any network setting; the learner needs 0 SOL).
2. Do Day 1 of Week 1 · HTML until the stamp ("Day 1 stamped").
3. Open **Bounties**, pick a one-day bounty (the outside sponsor's, ideally), **Accept**, do the task on CodePen and
   paste the public link in **Deliver**.

## After a real payout: make the counters count it

Public numbers leave out every account listed in `itera.test_accounts`, and `select itera.tag_test_accounts();` lists
every account created before the moment it runs (except the owner's, the demo and the sponsor account). A real learner
or sponsor who signed up before the last run is therefore tagged as a test account, and the bounty they were paid for
would be labelled "team rehearsal". After the real payout, untag them (replace the wallet):

```sql
delete from itera.test_accounts
 where user_id in (select user_id from itera.user_wallets where wallet = '<the real wallet>'
                   union select user_id from itera.bounty_claims where wallet = '<the real wallet>');
```

Then `/bounties` shows the payout under "to outside learners" and the card loses the rehearsal label.
