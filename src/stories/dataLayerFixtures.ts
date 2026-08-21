import type {
  ActivityEvent,
  Announcement,
  DailyChallenge,
  LeaderboardEntry,
  LearningResume,
  LessonProgress,
  NotificationsSummary,
  UserAchievement,
  UserPreferences,
  UserProfile,
  UserStats,
} from '@/components/data-layer/types';

// Datas fixas, nunca `Date.now()`: uma story que se move sozinha faz o diff de
// screenshot do Chromatic falhar todo dia por motivo nenhum.
const NOW = '2026-08-21T12:00:00.000Z';
const YESTERDAY = '2026-08-20T12:00:00.000Z';

export const profile: UserProfile = {
  id: 'u1',
  name: 'Ana Ribeiro',
  email: 'ana.ribeiro@exemplo.com',
  age: 24,
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=ana',
};

export const preferences: UserPreferences = {
  userId: 'u1',
  theme: 'dark',
  soundEffectsEnabled: true,
  language: 'pt-BR',
};

export const stats: UserStats = {
  userId: 'u1',
  totalXp: 4820,
  level: 7,
  currentStreak: 12,
  livesRemaining: 4,
};

export const lessonProgress: LessonProgress = {
  lessonId: 'l1',
  completedActivities: 7,
  totalActivities: 12,
  percent: 58,
};

export const resume: LearningResume = {
  lessonId: 'l1',
  lessonTitle: 'Estado em React: useState na prática',
  completedActivities: 7,
  totalActivities: 12,
  lastVisitedAt: YESTERDAY,
  percent: 58,
};

export const challenge: DailyChallenge = {
  id: 'dc1',
  title: 'Termine uma lição hoje',
  description: 'Complete qualquer lição antes da meia-noite e leve o bônus.',
  bonusXp: 150,
  expiresAt: NOW,
  targetLessonId: 'l1',
};

export const announcements: Announcement[] = [
  {
    id: 'a1',
    title: 'Aula ao vivo na quinta',
    body: 'A turma 07 tem aula ao vivo às 19h. O link abre 10 minutos antes.',
    severity: 'info',
    publishedAt: YESTERDAY,
    expiresAt: null,
  },
  {
    id: 'a2',
    title: 'Manutenção no sábado',
    body: 'O player fica indisponível das 2h às 4h para manutenção.',
    severity: 'warning',
    publishedAt: YESTERDAY,
    expiresAt: NOW,
  },
  {
    id: 'a3',
    title: 'Novo módulo liberado',
    body: 'O módulo de componentes já está no seu catálogo.',
    severity: 'success',
    publishedAt: NOW,
    expiresAt: null,
  },
];

export const achievements: UserAchievement[] = [
  {
    id: 'ach1',
    title: 'Primeira lição',
    description: 'Você terminou sua primeira lição.',
    iconEmoji: '🎯',
    unlockedAt: YESTERDAY,
  },
  {
    id: 'ach2',
    title: 'Sequência de 7 dias',
    description: 'Sete dias seguidos estudando.',
    iconEmoji: '🔥',
    unlockedAt: NOW,
  },
  {
    id: 'ach3',
    title: 'Maratonista',
    description: 'Complete 50 atividades.',
    iconEmoji: '🏃',
    unlockedAt: null,
  },
  {
    id: 'ach4',
    title: 'Mestre dos componentes',
    description: 'Termine o módulo de componentes.',
    iconEmoji: '🧩',
    unlockedAt: null,
  },
];

export const leaderboard: LeaderboardEntry[] = [
  {
    rank: 1,
    userId: 'u9',
    displayName: 'Bruno Tavares',
    avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=bruno',
    totalXp: 9120,
    isCurrentUser: false,
  },
  {
    rank: 2,
    userId: 'u1',
    displayName: 'Ana Ribeiro',
    avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=ana',
    totalXp: 4820,
    isCurrentUser: true,
  },
  {
    rank: 3,
    userId: 'u4',
    displayName: 'Carla Menezes',
    avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=carla',
    totalXp: 4310,
    isCurrentUser: false,
  },
  {
    rank: 4,
    userId: 'u7',
    displayName: 'Diego Farias',
    avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=diego',
    totalXp: 2980,
    isCurrentUser: false,
  },
];

export const notifications: NotificationsSummary = {
  unreadCount: 3,
  items: [
    { id: 'n1', title: 'Sua atividade foi corrigida', read: false, createdAt: NOW },
    { id: 'n2', title: 'Aula ao vivo começa em 1 hora', read: false, createdAt: NOW },
    { id: 'n3', title: 'Você subiu para o nível 7', read: false, createdAt: YESTERDAY },
    { id: 'n4', title: 'Bem-vinda à Itera', read: true, createdAt: YESTERDAY },
  ],
};

export const activityEvents: ActivityEvent[] = [
  { id: 'e1', type: 'lesson_completed', label: 'Terminou "Props e composição"', occurredAt: NOW },
  { id: 'e2', type: 'achievement_unlocked', label: 'Desbloqueou "Sequência de 7 dias"', occurredAt: NOW },
  { id: 'e3', type: 'streak_milestone', label: 'Alcançou 12 dias seguidos', occurredAt: YESTERDAY },
];
