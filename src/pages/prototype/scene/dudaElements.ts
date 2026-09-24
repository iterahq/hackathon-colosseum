import type { DudaElement } from "@/types/scenePrototype";

export const DUDA_ELEMENTS: DudaElement[] = [
  { id: "h1", tag: "h1", text: "Oi, eu sou a Duda", name: "título", job: "o texto mais importante da página" },
  { id: "p", tag: "p", text: "Faço bolo de pote e vendo na escola.", name: "parágrafo", job: "um bloco de texto corrido" },
  { id: "a", tag: "a", attrs: ' href="insta"', text: "Me segue no Insta", name: "link", job: "leva pra outro lugar quando clica" },
  { id: "button", tag: "button", text: "Quero um bolo!", name: "botão", job: "algo pra apertar" },
];

/** Colors shared by every code view so a tag reads the same everywhere. */
export const CODE_COLORS = {
  bracket: "#6B6660",
  tag: "#3FD17F",
  attr: "#E07A4A",
  value: "#F2C66D",
  text: "#EDE8E1",
};

/** Deliberately NOT the Itera palette, so the learner always sees "this is
 * Duda's site" versus "this is the tool". */
export const DUDA_PAGE_BACKGROUND =
  "radial-gradient(120% 90% at 0% 0%, #FFE4EC 0%, #FFF4E6 55%, #FDEBD3 100%)";
