# React do zero em 4 semanas — roteiro de gravação

Curso: `react-do-zero-4-semanas` (`db/seeds/react-4-weeks.fixture.json`).
Direção de produto (Tainan, 11/09): a aula em vídeo mora no YouTube; as
atividades/"jogos" moram na Itera; a micro-aula (slide + vídeo de 30s–1min)
também mora na Itera.

Cada vídeo de aula: **5–8 min**, gancho em 1 frase, 3–5 beats, demo ao vivo no
app de tarefas (Educar+ ToDo), fechamento apontando pras atividades da Itera.
Cada semana ganha também **1 micro-aula** (30–60s) — um recorte menor, pra
quem só tem um intervalo.

Gravar sempre no app de tarefas real (`educar-plus` / o mesmo app que as
capturas de tela em `public/lesson-media/` mostram), não num sandbox isolado —
é o artefato que o aluno reconhece nas telas de conceito da Itera.

---

## Semana 1 — A lista na tela

Unidade 0 do programa. 3 aulas, reaproveitadas de `react-fundamentals.fixture.json`.

### Aula 1 — A lista na tela: JSX e .map

- **Gancho:** "Todo app que você já usou tem uma lista em algum lugar — hoje
  você aprende a única coisa que o React precisa pra desenhar qualquer uma
  delas."
- **Beats:**
  1. Mostra o app de tarefas pronto (fim da aula) rodando no navegador.
  2. Abre o código: um array `tasks` puro, sem nada de React ainda.
  3. Escreve o `<ul>{tasks.map(...)}</ul>` ao vivo, explicando `{ }` como
     janela pro JavaScript.
  4. Erra de propósito: tira o `key`, mostra o warning no console.
  5. Corrige com `key={task}`, fecha com a lista completa na tela.
- **Demo passo a passo:** abrir o projeto → mostrar `tasks` no topo do
  arquivo → digitar o `.map` dentro do `<ul>` → salvar e ver a lista aparecer
  → abrir o DevTools, mostrar o warning de `key` ausente → corrigir.
- **Fechamento:** "Na Itera tem uma atividade que monta essa mesma lista com
  você, peça por peça — e um exercício de código onde é a sua vez de
  escrever o `.map`. Vai lá."
- **Micro-aula (30–60s):** só o momento do warning de `key` no console — "por
  que o React pede um crachá pra cada item da lista".

### Aula 2 — Fazendo a lista funcionar: useState

- **Gancho:** "Sua lista já aparece na tela. Mas clique em Adicionar — nada
  acontece. Por quê?"
- **Beats:**
  1. Mostra o botão Adicionar não fazendo nada (comportamento atual).
  2. Tenta `tasks.push(texto)` ao vivo — ainda não funciona, mesmo array
     "mudando" (loga no console pra provar que mudou).
  3. Explica `useState`: a lista de agora + o único jeito de trocar ela.
  4. Reescreve com `setTasks([...tasks, texto])` — funciona na hora.
  5. Mostra o padrão de novo pro `filter` (remover).
- **Demo passo a passo:** clicar em Adicionar sem código → abrir a função
  `addTask` vazia → tentar `push` e mostrar que não desenha → trocar por
  `setTasks([...tasks, text])` → adicionar uma tarefa ao vivo → remover uma
  com `filter`.
- **Fechamento:** "É a mesma pegadinha do `push` que quase todo mundo cai a
  primeira vez. Na Itera tem um exercício de múltipla escolha bem sobre isso,
  e o código pra você mesmo escrever o `addTask`."
- **Micro-aula:** só o momento "por que `push` não funciona" — a explicação
  do placar de futebol que ninguém avisou.

### Aula 3 — A tarefa vira ficha: marcar e salvar

- **Gancho:** "Toda tarefa até agora é só um texto. Texto não tem onde
  guardar 'já fiz'. Hoje ela vira uma ficha de verdade."
- **Beats:**
  1. Mostra o texto puro (`"Estudar React"`) não tendo como marcar como feito.
  2. Troca pro objeto `{ id, text, done }`.
  3. Escreve `toggleTask` com `.map` + spread (`{ ...task, done: !task.done }`).
  4. Marca uma tarefa ao vivo, mostra o texto riscando.
  5. Adiciona o `useEffect` que salva no `localStorage`, dá F5 e mostra que
     sobreviveu.
- **Demo passo a passo:** trocar o array de textos pelo array de objetos →
  escrever `toggleTask` → ligar o checkbox no `onChange` → marcar uma tarefa
  → abrir o Application tab do DevTools, mostrar o `localStorage` vazio →
  adicionar o `useEffect` → recarregar a página e mostrar que a tarefa
  continua marcada.
- **Fechamento:** "Marcar e salvar é a aula de hoje na Itera — inclusive o
  quadro com o JSON de verdade que ficou salvo. Vai fazer a mesma coisa,
  sozinho, na atividade de código."
- **Micro-aula:** o momento do F5 — "a gaveta que sobrevive ao recarregar".

**Release semana 1:** primeira a sair, abre o curso.

---

## Semana 2 — Organizando o app

Unidade 1. Fecha os fundamentos (edição/filtro/componentes) e abre efeitos
(`useEffect`).

### Aula 1 — Editar e filtrar: estado calculado

- **Gancho:** "Você tem uma aba 'Ativas' e um contador. Nenhum dos dois é uma
  lista nova — os dois são a MESMA lista, olhada de outro jeito."
- **Beats:**
  1. Mostra as abas Todas/Ativas/Feitas e o contador "2 restantes".
  2. Tentação errada: guardar `visibleTasks` num `useState` separado — mostra
     o bug de ficar desatualizado.
  3. Corrige calculando `visibleTasks` e `remaining` a cada desenho, com
     `.filter`.
  4. Liga os três botões de filtro.
  5. Adiciona a edição: duplo clique abre, Enter salva, Escape desiste.
- **Demo passo a passo:** clicar nas abas sem filtro implementado (mostra que
  não muda nada) → escrever o `.filter` dentro do componente → clicar de novo
  nas abas → dar duplo clique numa tarefa → editar o texto → apertar Enter.
- **Fechamento:** "'O que dá pra calcular não vira estado' é a frase da aula
  de hoje na Itera. Tem um quiz sobre isso e o exercício de código com o
  filtro e o contador pra você terminar."
- **Micro-aula:** só o duplo clique → editar → Enter, sem o filtro — "editar
  uma tarefa em 15 segundos".

### Aula 2 — Peças: componentes e props

- **Gancho:** "Um castelo de LEGO não é esculpido num bloco só. Seu app
  também não devia ser."
- **Beats:**
  1. Mostra o `App` com tudo dentro de uma função só (proposital, grande).
  2. Extrai `TaskItem`, com `task` e `onRemove` como props.
  3. Explica a prop que é função: `onRemove` começa com `on`, é o "controle
     remoto".
  4. Extrai `TaskForm` e `FilterBar` do mesmo jeito.
  5. Mostra o app final com as bordas de cada peça (a mesma imagem da
     atividade de conceito).
- **Demo passo a passo:** abrir o `App` gigante → selecionar o bloco do
  `<li>` → criar `function TaskItem` → copiar o bloco pra dentro → trocar
  por `<TaskItem key={task.id} task={task} onRemove={removeTask} />` →
  repetir a ideia rapidamente pro `TaskForm`.
- **Fechamento:** "Hoje a Itera pede pra você extrair o `TaskItem` sozinho, e
  no fim tem uma pergunta aberta: por que a lista mora no App, não no
  TaskItem. É a mesma ideia do controle remoto."
- **Micro-aula:** só a extração do `TaskItem`, do bloco inline até o
  componente pronto.

### Aula 3 — Efeitos: useEffect e o que ele vigia

- **Gancho:** "Todo sensor de presença tem um alvo: ele acende quando ALGO
  específico muda, não a qualquer hora. `useEffect` é a mesma ideia."
- **Beats:**
  1. Mostra o efeito de salvar no `localStorage` rodando (contador de quantas
     vezes rodou, print na tela).
  2. Adiciona uma tarefa — o contador sobe.
  3. Digita no campo de texto sem clicar em Adicionar — o contador NÃO sobe.
  4. Troca `[tasks]` por `[]` — mostra que só roda uma vez.
  5. Tira o array todo — mostra rodando a cada tecla (efeito colateral ruim).
- **Demo passo a passo:** abrir o `useEffect` com o `console.log` de contagem
  → adicionar 2 tarefas → digitar no campo sem enviar → trocar o array de
  dependências ao vivo três vezes, mostrando o contador cada vez.
- **Fechamento:** "Na Itera tem um jogo de ligar cada `useEffect` a quando
  ele roda, e o exercício de código é escrever o efeito que falta nesse
  mesmo app."
- **Micro-aula:** só a comparação lado a lado de `[tasks]` vs `[]` vs sem
  array — "três efeitos, três comportamentos".

**Release semana 2:** uma semana depois da semana 1.

---

## Semana 3 — Dados de verdade

Unidade 2. Fecha efeitos: buscar dados, formulários controlados, subir estado.

### Aula 1 — Buscando dados: carregando, pronto e erro

- **Gancho:** "Pedir um lanche no balcão tem três momentos: pedido,
  carregando, chegou. Buscar dados na internet é igual."
- **Beats:**
  1. Mostra a tela travada em "Carregando tarefas…" (sem fetch ainda).
  2. Escreve o `fetch` dentro do `useEffect` com `[]`.
  3. Mostra a Network tab do DevTools, o `tarefas.json` chegando.
  4. Adiciona o `status` (carregando/pronto/erro) e o `if (!response.ok)`.
  5. Simula um erro (desliga a internet ou troca a URL) e mostra a tela de
     erro.
- **Demo passo a passo:** abrir o componente sem fetch → adicionar o
  `useEffect` com `fetch(...)` → abrir a aba Network → recarregar e mostrar a
  requisição → trocar a URL pra uma inexistente → mostrar `status === "erro"`.
- **Fechamento:** "Os três estados são o quiz de hoje na Itera, e o exercício
  de código é você mesmo escrever esse `fetch` com o `status` certo."
- **Micro-aula:** só o "Simular erro" — como um `.catch` vira uma mensagem
  amigável na tela.

### Aula 2 — Formulários: controlado e não controlado

- **Gancho:** "Quem segura os fios da marionete decide cada movimento. Um
  campo de formulário pode ser assim — ou pode ser papel, que você só lê no
  final."
- **Beats:**
  1. Mostra um campo `defaultValue` (não controlado): contador de letras
     parado, botão sempre ligado.
  2. Troca pra `value={text}` + `onChange`.
  3. O contador passa a atualizar letra por letra.
  4. Liga o `disabled={text.trim() === ""}` no botão.
  5. Compara os dois: quando cada um faz sentido.
- **Demo passo a passo:** digitar no campo não controlado, mostrar que nada
  muda na tela → adicionar `value` e `onChange` → digitar de novo, mostrar o
  contador subindo em tempo real → adicionar o `disabled`.
- **Fechamento:** "Na Itera tem o jogo de ligar `value`/`onChange`/
  `disabled` ao que cada um faz, e o exercício pede pra você controlar o
  campo do zero."
- **Micro-aula:** só o contador `10/40` subindo letra por letra — "o campo
  que o React vigia em tempo real".

### Aula 3 — Subir o estado e criar um hook: useLocalStorage

- **Gancho:** "Num prédio, a água não fica em cada apartamento — fica numa
  caixa d'água lá em cima. Estado compartilhado é igual."
- **Beats:**
  1. Mostra dois componentes com `useState` separados, um não enxergando o
     outro.
  2. Sobe o estado pro pai comum, passa como prop pros dois.
  3. Extrai a lógica de ler/gravar do `localStorage`, repetida em dois
     lugares, pra dentro de uma função `useLocalStorage`.
  4. Troca `useState` por `useLocalStorage("tasks", [])` numa linha só.
  5. Mostra o app inteiro, com as peças e o hook, de cima.
- **Demo passo a passo:** abrir os dois componentes com estado duplicado →
  criar `function useLocalStorage(key, initial)` → mover o `useState` e o
  `useEffect` pra dentro → trocar as duas chamadas no app pra usar o hook.
- **Fechamento:** "É o mesmo hook que a semana 4 vai reaproveitar. Hoje na
  Itera você escreve ele do zero, com o exercício de código."
- **Micro-aula:** só a troca de duas linhas duplicadas por
  `useLocalStorage("feitas", 0)` — "uma receita, dois lugares".

**Release semana 3:** uma semana depois da semana 2.

---

## Semana 4 — Do app ao ar

Unidade 3 — nova, autorada para este curso. 4 aulas.

### Aula 1 — Tipando o ToDo: props e state com TypeScript

- **Gancho:** "Numa mala, a etiqueta de bagagem diz o que pode ir e o que
  não pode. Um tipo do TypeScript é a mesma etiqueta pros seus dados."
- **Beats:**
  1. Mostra um bug clássico: digitar "2" num campo de busca não marca a
     tarefa 2 (comparação texto vs número).
  2. Explica `any` como "tirar a etiqueta" — o editor para de checar.
  3. Escreve `type Task = { id: number; text: string; done: boolean }`.
  4. Tipa `useState<Task[]>` e a prop `TaskItemProps`.
  5. Corrige o bug convertendo o texto com `Number(search)`.
- **Demo passo a passo:** mostrar o bug ao vivo (digitar "2", clicar, nada
  acontece) → abrir o VS Code e passar o mouse no `any`, sem sugestão nenhuma
  → trocar por `id: number` → o editor passa a sublinhar a comparação errada
  → corrigir com `Number(search)`.
- **Fechamento:** "Na Itera você conserta esse mesmo bug, com o mesmo motivo:
  tipo errado que só aparece rodando."
- **Micro-aula:** só o "antes/depois" do editor: `any` sem sugestão vs
  `Task` com autocomplete e erro sublinhado.

### Aula 2 — Dividir em peças: componentes reutilizáveis e o hook de novo

- **Gancho:** "Você já extraiu um componente e já escreveu um hook. Hoje é a
  vez de aplicar os dois juntos, de propósito."
- **Beats:**
  1. Mostra o `App` desenhando a lista inteira na mão, de novo (recap
     proposital).
  2. Decide junto com quem assiste: "isso repete? tem nome próprio? extrai."
  3. Cria `TaskList`, com `tasks` e `onToggle` como props.
  4. Lembra o `useLocalStorage` da semana 3 e mostra ele sendo reusado sem
     mudar uma linha da receita.
  5. Fecha com o "antes de extrair demais": um pedaço usado uma vez só não
     precisa virar componente.
- **Demo passo a passo:** selecionar o bloco do `<ul>{tasks.map(...)}</ul>`
  dentro do `App` → criar `TaskList` → mover o bloco → usar
  `<TaskList tasks={tasks} onToggle={toggleTask} />` → marcar uma tarefa pra
  provar que nada quebrou.
- **Fechamento:** "O exercício de hoje é exatamente esse: extrair o
  `TaskList`. Bateu a checagem quando marcar continuar funcionando depois."
- **Micro-aula:** só o "quando extrair" — os 3 motivos bons (repete, tem
  nome, fica mais fácil de checar).

### Aula 3 — Testando um componente: o que olhar

- **Gancho:** "Um mecânico não confia só no olho: ele liga o carro. Testar um
  componente é a mesma prova, automática."
- **Beats:**
  1. Mostra os `checks` que a Itera já roda em toda atividade de código —
     "isso já É um teste, só que com um nome mais simpático".
  2. Explica: teste bom olha o RESULTADO (texto, classe, atributo), não
     como foi feito por dentro.
  3. Mostra um `<li>` sem jeito nenhum de saber se está marcado de fora
     (sem classe, sem atributo).
  4. Adiciona `data-done={task.done}` — agora dá pra checar de fora.
  5. Fecha comparando: "se eu mudar o nome de uma variável interna, o teste
     quebra? Não devia."
- **Demo passo a passo:** abrir o DevTools no `<li>` sem atributo → tentar
  "adivinhar" se está marcado só pelo CSS → adicionar `data-done` → reabrir o
  DevTools e mostrar o atributo mudando ao clicar.
- **Fechamento:** "É exatamente essa mudança que o exercício de hoje pede.
  Bateu quando o `data-done` virar `\"true\"` depois do clique."
- **Micro-aula:** só o antes/depois no DevTools — "um atributo que qualquer
  teste consegue ler".

### Aula 4 — Publicar: build, deploy e o README como portfólio

- **Gancho:** "Seu código na sua máquina não existe pra mais ninguém. Hoje
  ele sai da cozinha e vai pro salão."
- **Beats:**
  1. Roda `npm run build` ao vivo, mostra a pasta `dist/` nascendo.
  2. Roda `npm run preview`, abre `localhost` e confere que funciona igual.
  3. Conecta o repositório a um host estático (Vercel/Netlify/GitHub Pages)
     e publica.
  4. Abre o link publicado numa aba anônima — prova que funciona pra
     qualquer um, não só na sua máquina.
  5. Escreve o README junto: o que o app faz, o link ao vivo, uma
     screenshot, uma coisa a melhorar depois.
- **Demo passo a passo:** terminal aberto → `npm run build` → abrir `dist/`
  no explorador de arquivos → `npm run preview` → conectar no host escolhido
  → publicar → copiar o link → colar no README.
- **Fechamento:** "A atividade de hoje mostra a lista vazia parecendo
  quebrada — você resolve isso antes de publicar de verdade. E a última
  pergunta da Itera é literalmente escrever o texto do seu README."
- **Micro-aula:** só o momento do link publicado abrindo numa aba anônima —
  "a prova de que já não depende mais da sua máquina".

**Release semana 4:** uma semana depois da semana 3 — fecha o curso.

---

## Calendário de lançamento semanal

Uma unidade por semana, sempre na mesma referência de dia (ajustar pro dia
real de publicação combinado com o Tainan; datas abaixo partem de hoje,
2026-09-24, com a primeira segunda-feira disponível):

| Semana | Unidade | Lançamento |
|---|---|---|
| 1 | A lista na tela | 2026-09-28 |
| 2 | Organizando o app | 2026-10-05 |
| 3 | Dados de verdade | 2026-10-12 |
| 4 | Do app ao ar | 2026-10-19 |

Cada lançamento: vídeo da aula 1 daquela semana sai primeiro; as demais aulas
da mesma unidade podem sair ao longo da mesma semana, mas a **unidade** (e as
atividades da Itera) fica disponível inteira no dia do lançamento — sem
liberar unidade futura antes da hora.

## TODOs

- Aula 4 da semana 4 ("Publicar") ainda não tem screenshot real de
  `npm run build` nem do app publicado — ver `_comment` na primeira
  atividade de conceito dessa aula em `db/seeds/react-4-weeks.fixture.json`.
  Capturar depois de gravar o vídeo e trocar o TODO por um `image_url` real.
- Confirmar com o Tainan o host estático oficial de referência pra aula 4
  (Vercel, Netlify ou GitHub Pages) antes de gravar, pra roteiro e imagem
  baterem com o que o aluno vai realmente usar.
