import { useChainAccount } from '@/hooks/useChainRead';
import { ESCROW_PROGRAM } from '@/lib/chain/escrowAccount';
import { PROGRAM_DATA_HEADER_BYTES, programDataAddress } from '@/lib/chain/programData';

/** The escrow program account, then the header of its data account, both read by the browser. */
export function useProgramData() {
  const program = useChainAccount(ESCROW_PROGRAM);
  const dataAddress = program.data ? programDataAddress(program.data.data) : null;
  const header = useChainAccount(dataAddress ?? '', { offset: 0, length: PROGRAM_DATA_HEADER_BYTES }, dataAddress !== null);
  return { program, dataAddress, header };
}
