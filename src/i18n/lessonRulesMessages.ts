/** Strings of the lesson rules: what a miss costs, the first try that keeps the answer. */
export const LESSON_RULES_MESSAGES: Record<'pt' | 'en', Record<string, string>> = {
  pt: {
    'lesson.miss.noAnswerYet': 'Releia a pergunta e tente de novo. A resposta e o porquê aparecem se você errar a segunda tentativa.',
    'lives.firstLoss.title': 'Você perdeu uma vida',
    'lives.firstLoss.body': 'Cada exercício errado custa uma vida: uma por exercício, no máximo {cap} por dia de lição. Elas voltam sozinhas, uma a cada {minutes} minutos. O carimbo do dia só sai com tudo certo.',
    'lives.firstLoss.ok': 'Entendi',
    'video.language.pt': 'Em português',
    'header.nav.passport.short': 'Certific.',
  },
  en: {
    'lesson.miss.noAnswerYet': 'Read the question again and have another go. The answer and the why show up if you miss the second try.',
    'lives.firstLoss.title': 'You lost a life',
    'lives.firstLoss.body': 'Each exercise you miss costs a life: one per exercise, at most {cap} per lesson day. They come back by themselves, one every {minutes} minutes. The day is stamped only when every answer is right.',
    'lives.firstLoss.ok': 'Got it',
    'video.language.pt': 'In Portuguese',
    'header.nav.passport.short': 'Certs',
  },
};
