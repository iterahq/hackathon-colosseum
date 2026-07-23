import type { ReactElement } from 'react';
import { CheckCircle2, XCircle, Circle, CircleDot } from 'lucide-react';
import type { AnswerStateVariant } from '@/utils/answerStateVariant';

export const ANSWER_STATE_ICONS: Record<AnswerStateVariant, ReactElement> = {
  pending: <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />,
  answered: <CircleDot className="w-4 h-4 text-menta flex-shrink-0" />,
  done: <CheckCircle2 className="w-4 h-4 text-menta flex-shrink-0" />,
  wrong: <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />,
};
