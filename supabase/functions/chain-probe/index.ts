import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@1.6.0';
import { keypairIdentity } from 'npm:@metaplex-foundation/umi@1.6.0';
import { mplCore } from 'npm:@metaplex-foundation/mpl-core@1.10.0';

Deno.serve(async () => {
  const started = Date.now();
  try {
    const umi = createUmi(Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com', 'confirmed').use(mplCore());
    const secret = Uint8Array.from(JSON.parse(Deno.env.get('SOLANA_AUTHORITY_SECRET') ?? '[]'));
    const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(keypairIdentity(keypair));
    const balance = await umi.rpc.getBalance(keypair.publicKey);
    return Response.json({ ok: true, authority: keypair.publicKey, lamports: Number(balance.basisPoints), ms: Date.now() - started });
  } catch (error) {
    return Response.json({ ok: false, error: String(error), ms: Date.now() - started }, { status: 500 });
  }
});
