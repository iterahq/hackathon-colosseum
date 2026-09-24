// One-off build script for db/seeds/react-4-weeks.fixture.json.
// Reuses lessons verbatim from react-fundamentals.fixture.json and
// react-effects.fixture.json (renumbering only the per-unit lesson ordinal),
// and appends the newly authored week-4 unit. Not part of the app; run once
// with `node scripts/build-react-4-weeks-fixture.mjs` and commit the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const fundamentals = JSON.parse(readFileSync(resolve(ROOT, 'db/seeds/react-fundamentals.fixture.json'), 'utf8'));
const effects = JSON.parse(readFileSync(resolve(ROOT, 'db/seeds/react-effects.fixture.json'), 'utf8'));

const fundLessons = fundamentals.program.units[0].lessons;
const effLessons = effects.program.units[0].lessons;

function reorder(lessons) {
  return lessons.map((lesson, i) => ({ ...lesson, ordinal: i }));
}

const week1 = reorder([fundLessons[0], fundLessons[1], fundLessons[2]]);
const week2 = reorder([fundLessons[3], fundLessons[4], effLessons[0]]);
const week3 = reorder([effLessons[1], effLessons[2], effLessons[3]]);

const week4 = [
  {
    ordinal: 0,
    key: 'tipos-do-todo',
    title_i18n: {
      pt: 'Aula 1 — Tipando o ToDo: props e state com TypeScript',
      en: 'Lesson 1 — Typing the ToDo: props and state with TypeScript',
    },
    activities: [
      {
        ordinal: 0,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## A etiqueta antes da mala fechar\n\nNo aeroporto, a **etiqueta de bagagem** diz o que pode ir e o que não pode: some o líquido acima do limite, a mala nem embarca. É melhor descobrir no balcão do que na esteira do outro lado do mundo.\n\nUm **tipo** do TypeScript é essa etiqueta pras suas peças: `Task`, `TaskItemProps`. Se alguém tenta encaixar a coisa errada — um texto onde devia ser número — o editor avisa **antes** de rodar, não depois que o app já está no ar.\n\n> A imagem é o app das aulas passadas com as peças marcadas: `TaskForm`, `TaskItem` e `FilterBar`. Cada uma delas vai ganhar a sua etiqueta nesta aula.',
            image_url: '/lesson-media/react-fundamentals/aula-5-componentes.png',
            description: 'O app com as bordas de cada componente destacadas: TaskForm, TaskItem (três vezes) e FilterBar.',
          },
        },
        rubric: {},
      },
      {
        ordinal: 1,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## type, props tipadas e o perigo do any\n\n```tsx\ntype Task = {\n  id: number;\n  text: string;\n  done: boolean;\n};\n\ntype TaskItemProps = {\n  task: Task;\n  onToggle: (id: number) => void;\n};\n\nconst [tasks, setTasks] = useState<Task[]>([]);\n```\n\n- `type Task` é a etiqueta do dado: todo objeto de tarefa **tem** que ter esses três campos, com esses tipos\n- `useState<Task[]>([])` diz ao React: essa lista **só** guarda `Task`\n- `any` é tirar a etiqueta: o TypeScript para de checar aquele valor, e o erro só aparece rodando\n- um exemplo clássico: um campo de busca sempre entrega **texto** (`string`), mesmo quando a pessoa digita um número — comparar esse texto direto com um `id: number` nunca bate',
          },
        },
        rubric: {},
      },
      {
        ordinal: 2,
        status: 'published',
        kind: 'single_choice',
        spec: {
          instruction: {
            text: 'Uma função está com o parâmetro tipado como `any` e um colega diz "funciona, então tá bom". Qual é o risco?',
          },
          options: [
            { id: 'sem-checagem', label: 'O TypeScript para de checar aquele valor, e um tipo errado só vai aparecer quando o app já estiver rodando' },
            { id: 'mais-lento', label: 'O código fica mais lento em tempo de execução' },
            { id: 'nao-compila', label: 'O projeto simplesmente não compila mais' },
          ],
          correct_option_id: 'sem-checagem',
          explanation: '`any` desliga a checagem: o editor não avisa mais nada sobre aquele valor, e o erro só aparece quando alguém clicar e o app quebrar de verdade.',
        },
        rubric: {},
      },
      {
        ordinal: 3,
        status: 'published',
        kind: 'match',
        spec: {
          instruction: { text: 'Ligue cada trecho ao que ele tipa:' },
          left: [
            { id: 'l0', label: 'type Task = { id: number; text: string; done: boolean }' },
            { id: 'l1', label: 'useState<Task[]>([])' },
            { id: 'l2', label: '(id: number) => void' },
            { id: 'l3', label: 'e: React.ChangeEvent<HTMLInputElement>' },
          ],
          right: [
            { id: 'r0', label: 'O formato de uma tarefa' },
            { id: 'r1', label: 'Uma lista de tarefas guardada no estado' },
            { id: 'r2', label: 'Uma função que recebe um id e não devolve nada' },
            { id: 'r3', label: 'O evento de digitar num campo de texto' },
          ],
          pairs: [
            { left_id: 'l0', right_id: 'r0' },
            { left_id: 'l1', right_id: 'r1' },
            { left_id: 'l2', right_id: 'r2' },
            { left_id: 'l3', right_id: 'r3' },
          ],
          explanation: 'Cada tipo é uma etiqueta: do dado, da lista, da função de aviso ou do evento do campo.',
        },
        rubric: {},
      },
      {
        ordinal: 4,
        status: 'published',
        kind: 'code',
        spec: {
          prompt:
            'Digite "2" no campo de busca e clique em **Marcar por número**: nada acontece, mesmo a tarefa 2 existindo. O parâmetro de `toggleById` está `any`, e o texto do campo nunca vira número. Tipe `toggleById` como `(id: number) => void` e converta o texto de busca antes de comparar.\n\n// useState e useEffect já estão disponíveis — não precisa importar.',
          language: 'tsx',
          starter:
            '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = {\n  id: number;\n  text: string;\n  done: boolean;\n};\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([\n    { id: 1, text: "Estudar React", done: false },\n    { id: 2, text: "Beber água", done: false },\n    { id: 3, text: "Revisar TypeScript", done: false },\n  ]);\n  const [search, setSearch] = useState("");\n\n  function toggleById(id: any) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <div className="p-4">\n      <input id="busca" className="border px-2" value={search} onChange={(e) => setSearch(e.target.value)} />\n      <button id="marcar" onClick={() => toggleById(search)}>Marcar por número</button>\n      <ul>\n        {tasks.map((task) => (\n          <li key={task.id}>\n            <span className={task.done ? "line-through" : ""}>{task.text}</span>\n          </li>\n        ))}\n      </ul>\n    </div>\n  );\n}\n',
          checks: [
            {
              id: 'marca-certa',
              label: 'Buscar "2" e clicar em Marcar risca a segunda tarefa',
              hint: 'toggleById(id: number) e chame com toggleById(Number(search)).',
              steps: [
                { do: 'fill', selector: '#busca', value: '2' },
                { do: 'click', selector: '#marcar' },
              ],
              selector: 'li:nth-child(2) span',
              assert: { type: 'class', contains: 'line-through' },
            },
            {
              id: 'nao-mexe-nas-outras',
              label: 'As outras tarefas continuam sem marcar',
              hint: 'A conversão troca só a comparação, não o resto da lista.',
              steps: [
                { do: 'fill', selector: '#busca', value: '2' },
                { do: 'click', selector: '#marcar' },
              ],
              selector: 'li:nth-child(1) span',
              assert: { type: 'attr', name: 'class', equals: '' },
            },
          ],
        },
        rubric: {},
        _solution:
          '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = {\n  id: number;\n  text: string;\n  done: boolean;\n};\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([\n    { id: 1, text: "Estudar React", done: false },\n    { id: 2, text: "Beber água", done: false },\n    { id: 3, text: "Revisar TypeScript", done: false },\n  ]);\n  const [search, setSearch] = useState("");\n\n  function toggleById(id: number) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <div className="p-4">\n      <input id="busca" className="border px-2" value={search} onChange={(e) => setSearch(e.target.value)} />\n      <button id="marcar" onClick={() => toggleById(Number(search))}>Marcar por número</button>\n      <ul>\n        {tasks.map((task) => (\n          <li key={task.id}>\n            <span className={task.done ? "line-through" : ""}>{task.text}</span>\n          </li>\n        ))}\n      </ul>\n    </div>\n  );\n}\n',
      },
    ],
  },
  {
    ordinal: 1,
    key: 'dividir-em-componentes-e-hook',
    title_i18n: {
      pt: 'Aula 2 — Dividir em peças: componentes reutilizáveis e o hook de novo',
      en: 'Lesson 2 — Splitting into pieces: reusable components and the hook again',
    },
    activities: [
      {
        ordinal: 0,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## Recapitulando: peça pequena, memória compartilhada\n\nDuas ideias que você já usou separadas, agora juntas: **peças pequenas** (`TaskItem`, `FilterBar`) que só cuidam da sua parte, e um **hook seu** (`useLocalStorage`) pra não repetir a mesma receita de gaveta duas vezes.\n\nHoje o `App` ainda desenha a lista inteira sozinho. Vamos tirar mais uma peça dele: um `TaskList`, que só sabe desenhar tarefas — o `App` continua sendo o dono da lista, só não desenha ela na mão.\n\n> Na imagem, o `App` já usa `useLocalStorage("tasks")` e entrega a lista pras peças de baixo — é esse desenho que a aula de hoje deixa mais completo.',
            image_url: '/lesson-media/react-effects/aula-4-estado-no-pai.png',
            description: 'O app com as peças marcadas e o App no topo, dono da lista, guardada pelo useLocalStorage.',
          },
        },
        rubric: {},
      },
      {
        ordinal: 1,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## Quando extrair uma peça (ou um hook)\n\n- extraia um **componente** quando um pedaço de JSX tem nome próprio e pode aparecer mais de uma vez (`TaskItem` pra cada tarefa)\n- extraia um **hook** quando a mesma lógica de estado + efeito se repete em lugares diferentes (`useLocalStorage` pra `tasks` e pra `filter`)\n- o componente extraído recebe só o que precisa, via **props** — nunca importa `tasks` direto do `App`\n- extrair demais também tem custo: uma peça que só é usada uma vez, sem nome que ajude ninguém, costuma ser cedo demais',
          },
        },
        rubric: {},
      },
      {
        ordinal: 2,
        status: 'published',
        kind: 'multi_choice',
        spec: {
          instruction: { text: 'Quais são bons motivos pra extrair um componente novo?' },
          options: [
            { id: 'repete', label: 'O mesmo JSX aparece mais de uma vez, com dados diferentes' },
            { id: 'nome', label: 'O pedaço tem um nome que faz sentido sozinho, tipo TaskItem' },
            { id: 'arquivo-grande', label: 'O arquivo já passou de 300 linhas, então precisa cortar em algum lugar' },
            { id: 'testar', label: 'Fica mais fácil checar o comportamento dessa peça sozinha' },
          ],
          correct_option_ids: ['repete', 'nome', 'testar'],
          explanation: 'Tamanho de arquivo sozinho não é motivo: o corte certo segue repetição, nome e a facilidade de checar a peça isolada.',
        },
        rubric: {},
      },
      {
        ordinal: 3,
        status: 'published',
        kind: 'order',
        spec: {
          instruction: { text: 'Coloque na ordem os passos para extrair o TaskList do App:' },
          items: [
            { id: 'a', label: 'Olhar o que o map de tasks devolve hoje, dentro do App' },
            { id: 'b', label: 'Criar function TaskList({ tasks, onToggle }: TaskListProps)' },
            { id: 'c', label: 'Mover o <ul> e o .map pra dentro do TaskList' },
            { id: 'd', label: 'No App, trocar aquele bloco por <TaskList tasks={tasks} onToggle={toggleTask} />' },
            { id: 'e', label: 'Conferir que marcar uma tarefa continua funcionando' },
          ],
          correct_order: ['a', 'b', 'c', 'd', 'e'],
          explanation: 'Extrair é mover código pra uma peça nova com props, trocar o uso e confirmar que nada quebrou.',
        },
        rubric: {},
      },
      {
        ordinal: 4,
        status: 'published',
        kind: 'code',
        spec: {
          prompt:
            'O `TaskItem` já existe, mas o `<ul>` e o `.map` ainda moram dentro do `App`. Crie o `TaskList`, com as props `tasks` e `onToggle`, coloque `data-task-list` no `<ul>` dele, e use no `App`.\n\n// useState e useEffect já estão disponíveis — não precisa importar.',
          language: 'tsx',
          starter:
            '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string; done: boolean };\n\nfunction TaskItem({ task, onToggle }: { task: Task; onToggle: (id: number) => void }) {\n  return (\n    <li data-task-item>\n      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />\n      <span className={task.done ? "line-through" : ""}>{task.text}</span>\n    </li>\n  );\n}\n\n// crie o TaskList aqui\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([\n    { id: 1, text: "Estudar React", done: false },\n    { id: 2, text: "Beber água", done: false },\n    { id: 3, text: "Revisar TypeScript", done: false },\n  ]);\n\n  function toggleTask(id: number) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <ul className="p-4">\n      {tasks.map((task) => (\n        <TaskItem key={task.id} task={task} onToggle={toggleTask} />\n      ))}\n    </ul>\n  );\n}\n',
          checks: [
            {
              id: 'peca',
              label: 'A lista é desenhada por um TaskList, não pelo App direto',
              hint: 'function TaskList({ tasks, onToggle }: TaskListProps) { return <ul data-task-list>{tasks.map(...)}</ul>; }',
              selector: '[data-task-list]',
              assert: { type: 'count', equals: 1 },
            },
            {
              id: 'continua-marcando',
              label: 'Marcar a primeira tarefa ainda funciona depois da extração',
              hint: 'O TaskList só embrulha o que já existia: passe tasks e onToggle como props.',
              steps: [{ do: 'click', selector: '[data-task-item]:nth-of-type(1) input' }],
              selector: '[data-task-item]:nth-of-type(1) span',
              assert: { type: 'class', contains: 'line-through' },
            },
          ],
        },
        rubric: {},
        _solution:
          '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string; done: boolean };\n\nfunction TaskItem({ task, onToggle }: { task: Task; onToggle: (id: number) => void }) {\n  return (\n    <li data-task-item>\n      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />\n      <span className={task.done ? "line-through" : ""}>{task.text}</span>\n    </li>\n  );\n}\n\ntype TaskListProps = {\n  tasks: Task[];\n  onToggle: (id: number) => void;\n};\n\nfunction TaskList({ tasks, onToggle }: TaskListProps) {\n  return (\n    <ul data-task-list>\n      {tasks.map((task) => (\n        <TaskItem key={task.id} task={task} onToggle={onToggle} />\n      ))}\n    </ul>\n  );\n}\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([\n    { id: 1, text: "Estudar React", done: false },\n    { id: 2, text: "Beber água", done: false },\n    { id: 3, text: "Revisar TypeScript", done: false },\n  ]);\n\n  function toggleTask(id: number) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <div className="p-4">\n      <TaskList tasks={tasks} onToggle={toggleTask} />\n    </div>\n  );\n}\n',
      },
    ],
  },
  {
    ordinal: 2,
    key: 'testando-um-componente',
    title_i18n: {
      pt: 'Aula 3 — Testando um componente: o que olhar',
      en: 'Lesson 3 — Testing a component: what to check',
    },
    activities: [
      {
        ordinal: 0,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## A prova real, não o "parece que funciona"\n\nUm mecânico não confia só no olho: ele **liga o carro** e confere se o painel acende certo. Testar um componente é a mesma prova, só que automática — em vez de olhar a tela, o teste clica e confere o resultado.\n\n> Na imagem, o resultado que a gente quer poder provar sem precisar de outra pessoa olhando: depois de adicionar, a lista tem a tarefa nova. É exatamente isso que um teste confere.',
            image_url: '/lesson-media/react-fundamentals/aula-2-adicionar.png',
            description: 'O app depois de adicionar uma quarta tarefa, "Ler um capítulo".',
          },
        },
        rubric: {},
      },
      {
        ordinal: 1,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## O que checar, não como montar tudo\n\nUm teste bom olha o **resultado visível**, não como ele foi feito por dentro:\n\n```tsx\n// clica no primeiro checkbox\n// confere: o texto da primeira tarefa ficou riscado?\n```\n\n- teste o que a **pessoa vê**: texto, se um botão está desligado, se algo apareceu ou sumiu\n- **não** teste detalhe de implementação: nome de variável interna, quantas vezes uma função foi chamada\n- pra um componente ser fácil de checar, ele precisa **expor** o resultado de um jeito estável — um atributo, uma classe, um texto — em vez de esconder tudo\n- é a mesma ideia dos `checks` que você já viu em toda aula: selecionar algo na tela e comparar com o que devia estar lá',
          },
        },
        rubric: {},
      },
      {
        ordinal: 2,
        status: 'published',
        kind: 'single_choice',
        spec: {
          instruction: {
            text: 'Qual das opções é um bom teste para o botão "Adicionar"?',
          },
          options: [
            { id: 'resultado', label: 'Clicar em Adicionar com um texto preenchido e conferir se a lista ganhou um item novo' },
            { id: 'interno', label: 'Conferir se a função addTask foi escrita com uma arrow function' },
            { id: 'nome-var', label: 'Conferir se a variável se chama exatamente "text"' },
          ],
          correct_option_id: 'resultado',
          explanation: 'Teste bom confere o resultado que a pessoa vê. Nome de variável e estilo de função podem mudar sem quebrar nada de verdade.',
        },
        rubric: {},
      },
      {
        ordinal: 3,
        status: 'published',
        kind: 'order',
        spec: {
          instruction: { text: 'Coloque na ordem os três passos de um teste de componente:' },
          items: [
            { id: 'a', label: 'Renderizar o componente' },
            { id: 'b', label: 'Interagir: clicar, preencher um campo' },
            { id: 'c', label: 'Conferir o resultado na tela' },
          ],
          correct_order: ['a', 'b', 'c'],
          explanation: 'Sempre a mesma ordem: desenha, mexe, confere — a mesma receita dos checks que você já vem usando.',
        },
        rubric: {},
      },
      {
        ordinal: 4,
        status: 'published',
        kind: 'code',
        spec: {
          prompt:
            'Pra um teste (ou um colega) conseguir checar se a tarefa está feita sem depender de classe CSS, exponha o resultado num atributo estável. Adicione `data-done={task.done}` no `<li>`.\n\n// useState e useEffect já estão disponíveis — não precisa importar.',
          language: 'tsx',
          starter:
            '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string; done: boolean };\n\nfunction TaskItem({ task, onToggle }: { task: Task; onToggle: (id: number) => void }) {\n  return (\n    <li>\n      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />\n      <span>{task.text}</span>\n    </li>\n  );\n}\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([{ id: 1, text: "Estudar React", done: false }]);\n\n  function toggleTask(id: number) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <ul className="p-4">\n      {tasks.map((task) => (\n        <TaskItem key={task.id} task={task} onToggle={toggleTask} />\n      ))}\n    </ul>\n  );\n}\n',
          checks: [
            {
              id: 'expoe-o-resultado',
              label: 'Marcar a tarefa deixa data-done="true" no item',
              hint: 'No <li>: data-done={task.done}.',
              steps: [{ do: 'click', selector: 'li input' }],
              selector: 'li',
              assert: { type: 'attr', name: 'data-done', equals: 'true' },
            },
          ],
        },
        rubric: {},
        _solution:
          '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string; done: boolean };\n\nfunction TaskItem({ task, onToggle }: { task: Task; onToggle: (id: number) => void }) {\n  return (\n    <li data-done={task.done}>\n      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />\n      <span>{task.text}</span>\n    </li>\n  );\n}\n\nexport default function App() {\n  const [tasks, setTasks] = useState<Task[]>([{ id: 1, text: "Estudar React", done: false }]);\n\n  function toggleTask(id: number) {\n    setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));\n  }\n\n  return (\n    <ul className="p-4">\n      {tasks.map((task) => (\n        <TaskItem key={task.id} task={task} onToggle={toggleTask} />\n      ))}\n    </ul>\n  );\n}\n',
      },
    ],
  },
  {
    ordinal: 3,
    key: 'publicar-e-entregar',
    title_i18n: {
      pt: 'Aula 4 — Publicar: build, deploy e o README como portfólio',
      en: 'Lesson 4 — Shipping it: build, deploy and the README as portfolio',
    },
    activities: [
      {
        ordinal: 0,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## Da cozinha pro salão\n\nO código que você escreve é a **cozinha**: ninguém de fora vê. Publicar é levar o prato pro **salão** — pra alguém de fora conseguir abrir um link e usar o que você fez, sem instalar nada.\n\n`npm run build` empacota o app inteiro numa pasta `dist/`: arquivos prontos, sem precisar do seu computador rodando. Um host estático (Vercel, Netlify, GitHub Pages) só serve essa pasta pro mundo.',
          },
        },
        rubric: {},
        _comment: [
          'TODO: real screenshot needed — a terminal showing `npm run build` output and/or the deployed',
          'ToDo app live on its host URL. Nothing under public/lesson-media shows a terminal or a live',
          'deploy, so this concept ships without image_url rather than reuse a screenshot that would not',
          'truly fit (per itera-lesson-authoring §4: never a fake image).',
        ],
      },
      {
        ordinal: 1,
        status: 'published',
        kind: 'concept',
        spec: {
          instruction: {
            text: '## Os passos e o README\n\n1. `npm run build` — gera a pasta `dist/`\n2. `npm run preview` (ou abrir `dist/index.html`) — confere localmente antes de publicar\n3. conectar o repositório a um host estático e publicar\n4. atualizar o **README** com: o que o app faz, o **link ao vivo**, uma screenshot, e uma coisa que você melhoraria depois\n\n> O README é a primeira coisa que um recrutador ou colega lê. Ele é o seu **portfólio**, não só uma formalidade.',
          },
        },
        rubric: {},
      },
      {
        ordinal: 2,
        status: 'published',
        kind: 'single_choice',
        spec: {
          instruction: {
            text: 'Antes de subir o projeto pro GitHub, qual arquivo você NUNCA deve commitar?',
          },
          options: [
            { id: 'env', label: 'Um .env com chaves ou senhas' },
            { id: 'package', label: 'O package.json' },
            { id: 'readme', label: 'O README.md' },
          ],
          correct_option_id: 'env',
          explanation: 'Chave ou senha commitada fica no histórico do repositório pra sempre, mesmo apagando depois. Segredo nunca vai pro código.',
        },
        rubric: {},
      },
      {
        ordinal: 3,
        status: 'published',
        kind: 'order',
        spec: {
          instruction: { text: 'Coloque na ordem os passos de publicar o app:' },
          items: [
            { id: 'a', label: 'Rodar npm run build e conferir a pasta dist/' },
            { id: 'b', label: 'Testar localmente com npm run preview' },
            { id: 'c', label: 'Conectar o repositório a um host estático e publicar' },
            { id: 'd', label: 'Abrir o link publicado numa aba nova e testar de novo' },
            { id: 'e', label: 'Atualizar o README com o link ao vivo e uma screenshot' },
          ],
          correct_order: ['a', 'b', 'c', 'd', 'e'],
          explanation: 'Empacota, confere local, publica, confere no ar, e só então documenta com o link que já funciona.',
        },
        rubric: {},
      },
      {
        ordinal: 4,
        status: 'published',
        kind: 'code',
        spec: {
          prompt:
            'Antes de publicar, uma lista vazia fica em branco — parece quebrado pra quem abre o link pela primeira vez. Mostre "Nenhuma tarefa ainda" com o atributo `data-empty` quando `tasks.length` for 0.\n\n// useState e useEffect já estão disponíveis — não precisa importar.',
          language: 'tsx',
          starter:
            '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string };\n\nexport default function App() {\n  const [tasks] = useState<Task[]>([]);\n\n  return (\n    <div className="p-4">\n      <h1 className="text-xl font-bold">Minhas tarefas</h1>\n      <ul>\n        {tasks.map((task) => (\n          <li key={task.id}>{task.text}</li>\n        ))}\n      </ul>\n    </div>\n  );\n}\n',
          checks: [
            {
              id: 'mostra-vazio',
              label: 'Lista vazia mostra a mensagem',
              hint: '{tasks.length === 0 && <p data-empty>Nenhuma tarefa ainda</p>}',
              selector: '[data-empty]',
              assert: { type: 'exists' },
            },
            {
              id: 'texto-certo',
              label: 'A mensagem diz "Nenhuma tarefa ainda"',
              hint: 'O texto do <p data-empty> tem que ser exatamente esse.',
              selector: '[data-empty]',
              assert: { type: 'text', equals: 'Nenhuma tarefa ainda' },
            },
          ],
        },
        rubric: {},
        _solution:
          '// useState e useEffect já estão disponíveis — não precisa importar.\n\ntype Task = { id: number; text: string };\n\nexport default function App() {\n  const [tasks] = useState<Task[]>([]);\n\n  return (\n    <div className="p-4">\n      <h1 className="text-xl font-bold">Minhas tarefas</h1>\n      {tasks.length === 0 && <p data-empty>Nenhuma tarefa ainda</p>}\n      <ul>\n        {tasks.map((task) => (\n          <li key={task.id}>{task.text}</li>\n        ))}\n      </ul>\n    </div>\n  );\n}\n',
      },
      {
        ordinal: 5,
        status: 'published',
        kind: 'document',
        spec: {
          prompt:
            'Escreva o texto do README do seu ToDo: o que o app faz, o link ao vivo (pode ser um placeholder), e uma coisa que você melhoraria numa próxima versão.',
          body: 'Escreva como se um recrutador fosse ler antes de te chamar pra conversar.',
        },
        rubric: { min_words: 30 },
      },
    ],
  },
];

const fixture = {
  _comment: [
    'DECLARATIVE CONTENT FIXTURE — the first Itera course: a 4-week program that',
    'strings react-fundamentals.fixture.json and react-effects.fixture.json',
    'together (weeks 1–3, lessons reused verbatim, only the per-unit `ordinal`',
    'was renumbered) and adds a newly authored week 4, "Do app ao ar" (typed',
    'props/state, splitting into components + the useLocalStorage hook recap,',
    'a light intro to testing, and shipping: build, deploy, README as portfolio).',
    '',
    'Generated by `scripts/build-react-4-weeks-fixture.mjs` for weeks 1–3; week 4',
    'is authored directly in that script. Re-run the script after either source',
    'fixture changes, rather than hand-editing the reused weeks here.',
    '',
    'Validated by `src/test/react4WeeksFixture.test.ts`, same rules as the other',
    'two units: the shared `@iterahq/activity-spec` parser, every code snack\'s',
    'STARTER failing its checks and its `_solution` passing them, and the',
    'authoring rules (context + metaphor before any exercise, no retired kinds,',
    'no `---` in concept text). Week 4\'s "Publicar" lesson ships its opening',
    'concept without an image_url — see the `_comment` on that activity — because',
    'no committed screenshot shows a terminal build or a live deploy, and a',
    'fake or mismatched image is worse than none (itera-lesson-authoring §4).',
    '',
    '`_solution`, `_comment` and `_todo` are fixture-only keys; a seed must drop',
    'every `_`-prefixed key before it writes a row.',
  ],
  program: {
    slug: 'react-do-zero-4-semanas',
    title_i18n: {
      pt: 'React do zero em 4 semanas',
      en: 'React from scratch in 4 weeks',
    },
    units: [
      {
        ordinal: 0,
        title_i18n: { pt: 'Semana 1 — A lista na tela', en: 'Week 1 — The list on screen' },
        lessons: week1,
      },
      {
        ordinal: 1,
        title_i18n: { pt: 'Semana 2 — Organizando o app', en: 'Week 2 — Organizing the app' },
        lessons: week2,
      },
      {
        ordinal: 2,
        title_i18n: { pt: 'Semana 3 — Dados de verdade', en: 'Week 3 — Real data' },
        lessons: week3,
      },
      {
        ordinal: 3,
        title_i18n: { pt: 'Semana 4 — Do app ao ar', en: 'Week 4 — From app to the web' },
        lessons: week4,
      },
    ],
  },
};

writeFileSync(resolve(ROOT, 'db/seeds/react-4-weeks.fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('wrote db/seeds/react-4-weeks.fixture.json');
