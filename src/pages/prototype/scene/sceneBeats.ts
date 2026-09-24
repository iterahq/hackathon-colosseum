import type { SceneBeat } from "@/types/scenePrototype";

export const SCENE_BEATS: SceneBeat[] = [
  {
    id: "xray",
    kicker: "Cena 1 · O segredo",
    prompt: "Esse é o meu site. Parece mágica, né? Passa o raio-X por cima e descobre do que ele é feito.",
    reaction: "Viu? Embaixo de tudo é só texto. O navegador lê esse texto e desenha a página.",
    stamp: "Todo site é texto",
  },
  {
    id: "live-type",
    kicker: "Cena 2 · Onde se escreve",
    prompt: "Olha eu escrevendo do lado esquerdo, e o navegador desenhando do direito. Quando eu terminar, é sua vez: troca pelo SEU nome.",
    reaction: "Você acabou de programar! Mudou o arquivo e o navegador redesenhou na hora.",
    stamp: "Escreve → o navegador desenha",
  },
  {
    id: "inspect",
    kicker: "Cena 3 · As peças",
    prompt: "Minha página tem 4 peças. Passa o mouse (ou o dedo) em cada uma e descobre o nome dela.",
    reaction: "Cada peça é uma tag: abre, conteúdo, fecha. É assim que o HTML dá nome às coisas.",
    stamp: "<tag>conteúdo</tag>",
  },
];
