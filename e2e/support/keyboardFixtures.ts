/**
 * Fixtures with a field a learner types in that `activityFixtures.ts` and
 * `sceneFixtures.ts` do not already carry. Copied from the Storybook contracts
 * (`contractFixtures.ts` cannot be loaded here: it imports JSON without an
 * import attribute).
 */
import { fixture } from './sceneFixtures';
import oneBehaviourChat from '../../src/test/fixtures/one-behaviour-chat-scenarios.json' with { type: 'json' };

export const QUESTION_WRITE = fixture(
  60,
  'question_write',
  {
    title: 'O que falta no adaptador do plans-app?',
    description: 'Escreva com as suas palavras. Não há resposta certa.',
    free_text: { label: 'Sua resposta', placeholder: 'O que você mudaria primeiro?' },
  },
  'question_write',
);

export const DOCUMENT_REFLECT = fixture(
  61,
  'document_reflect',
  {
    prompt: 'Escreva, com suas palavras, o que você entendeu sobre chaves primárias.',
    body: 'Vale citar um exemplo do seu dia a dia — número de matrícula, CPF, e-mail…',
    evaluation: { mode: 'word-count', minWords: 30 },
  },
  'document_reflect',
);

export const CODE_FILL_TYPE = fixture(
  62,
  'code_fill_type',
  {
    prompt: 'Escreva o que falta para o contador começar em zero e saber somar.',
    starter: `export default function ClubeDeLeitura() {
  const [curtidas, {{blank:setter}}] = useState({{blank:inicial}});

  return (
    <div className="rounded-xl border border-slate-200 p-6 text-center">
      <h1 className="text-xl font-bold text-slate-800">Clube de leitura</h1>
      <button onClick={() => setCurtidas(curtidas + 1)}>Gostei: {curtidas}</button>
    </div>
  );
}
`,
    language: 'tsx',
    blanks: [
      { id: 'setter', kind: 'text', answer: 'setCurtidas', placeholder: 'setAlgo', hint: 'O botão já chama esse nome mais abaixo.' },
      { id: 'inicial', kind: 'text', answer: '0', placeholder: '?', hint: 'Ninguém curtiu ainda quando a tela abre.' },
    ],
  },
  'code_fill_type',
);

export const CHAT_FILL_TYPE = fixture(
  63,
  'chat_fill_type',
  (oneBehaviourChat as Record<string, Record<string, unknown>>).CHAT_FILL_TYPE_SPEC,
  'chat_fill_type',
);
