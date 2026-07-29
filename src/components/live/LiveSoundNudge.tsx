import { motion } from 'framer-motion';
import { ArrowLeft, VolumeX } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useLiveMuted } from '@/hooks/useLiveMuted';

/**
 * Aponta o dock de som durante a sala de espera. Como o som agora nasce
 * DESLIGADO, sem isso o aluno nunca descobre que existe trilha e efeito — o
 * dock é um botão de 36px num canto. Some sozinho quando ele liga.
 */
export function LiveSoundNudge() {
  const { t } = useI18n();
  const [muted] = useLiveMuted();
  if (!muted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.35 }}
      className="fixed bottom-3 left-14 md:left-16 z-30 hidden sm:flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full border border-menta/40 bg-card shadow-lg"
      data-testid="live-sound-nudge"
    >
      <motion.span
        animate={{ x: [0, -4, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="text-menta"
        aria-hidden="true"
      >
        <ArrowLeft className="w-4 h-4" />
      </motion.span>
      <VolumeX className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{t('live.sound.nudge')}</span>
    </motion.div>
  );
}
