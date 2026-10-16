import {
  getQuestionReviewState,
  updateQuestionReviewState,
  getTopicProgress,
  updateTopicProgress,
} from './database';

export interface ReviewState {
  repetitions: number;
  easeFactor: number;
  interval: number;
  nextReviewDate: number; // timestamp
}

export const DEFAULT_REVIEW_STATE: ReviewState = {
  repetitions: 0,
  easeFactor: 2.5,
  interval: 0,
  nextReviewDate: Date.now(),
};

// 1. O nosso Juiz Invisível (Avalia a nota baseado no seu tempo)
export const evaluateQuality = (isCorrect: boolean, timeSpentSeconds: number): number => {
  if (!isCorrect) return 1; // Errou: vai pro Caderno de Erros amanhã
  
  if (timeSpentSeconds <= 45) return 5; // Rápido: Muito Fácil
  if (timeSpentSeconds <= 120) return 4; // Tempo normal: Bom
  return 3; // Demorou mais de 2 minutos: Difícil
};

// 2. O Motor SM-2 (Calcula o próximo agendamento)
export const calculateNextReview = (
  quality: number, 
  currentState: ReviewState
): ReviewState => {
  let { repetitions, easeFactor, interval } = currentState;

  if (quality >= 3) {
    // Acertou
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Errou (Nota 1) - Reseta a contagem
    repetitions = 0;
    interval = 1;
  }

  // Ajusta a curva de dificuldade (SM-2 original)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3; 

  // Calcula a data futura
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);

  return {
    repetitions,
    easeFactor,
    interval,
    nextReviewDate: nextDate.getTime(),
  };
};

/**
 * Processa a resposta do usuário, calcula o novo agendamento SM-2 por questão e persiste no SQLite.
 */
export async function processQuestionReview(
  questionId: string,
  isCorrect: boolean,
  timeSpentSeconds: number
): Promise<ReviewState> {
  const currentState = (await getQuestionReviewState(questionId)) || DEFAULT_REVIEW_STATE;
  const quality = evaluateQuality(isCorrect, timeSpentSeconds);
  const newState = calculateNextReview(quality, currentState);
  await updateQuestionReviewState(questionId, newState);
  console.log(`[SM-2] 📅 Agendado: ID ${questionId} | Intervalo: ${newState.interval}d | Repetições: ${newState.repetitions} | Fator: ${newState.easeFactor.toFixed(2)}`);
  return newState;
}

/**
 * Processa a resposta do usuário no nível de tema/matéria e atualiza a proficiência do tema via SM-2.
 */
export async function processTopicReview(
  topicName: string,
  isCorrect: boolean,
  timeSpentSeconds: number
): Promise<ReviewState> {
  const cleanTopic = String(topicName || '').trim();
  if (!cleanTopic) return DEFAULT_REVIEW_STATE;

  const currentState = (await getTopicProgress(cleanTopic)) || DEFAULT_REVIEW_STATE;
  const quality = evaluateQuality(isCorrect, timeSpentSeconds);
  const newState = calculateNextReview(quality, currentState);
  await updateTopicProgress(cleanTopic, newState);
  console.log(`[Topic SM-2] 📚 Tema '${cleanTopic}' agendado: Intervalo: ${newState.interval}d | Fator: ${newState.easeFactor.toFixed(2)}`);
  return newState;
}

export {
  getQuestionReviewState,
  updateQuestionReviewState,
  getTopicProgress,
  updateTopicProgress,
};
