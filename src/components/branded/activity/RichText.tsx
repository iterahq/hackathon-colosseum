/**
 * RichText — desenha os blocos de `parseRichText` na linguagem visual da marca.
 *
 * A tela conceitual era um <p> corrido: o aluno via um muro de texto e, quando
 * o autor marcava alguma coisa, via os asteriscos junto. Aqui cada bloco ganha
 * o peso certo (título, citação, lista, código) e entra em cascata curta, que é
 * o que faz o olho percorrer a tela em vez de desistir dela.
 */
import { RichSteps } from '@/components/branded/activity/RichSteps';
import { parseRichText, splitSteps } from '@/utils/richText';

export function RichText({
  text,
  muted = false,
  stepped = false,
  className = '',
  'data-testid': testId,
}: {
  text: string;
  muted?: boolean;
  stepped?: boolean;
  className?: string;
  'data-testid'?: string;
}) {
  const steps = splitSteps(parseRichText(text));

  return (
    <div className={className} data-testid={testId}>
      <RichSteps steps={steps} muted={muted} stepped={stepped} />
    </div>
  );
}
