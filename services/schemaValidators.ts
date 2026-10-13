import { z } from 'zod';

// Esquema para validar os Passos Individuais
export const FlowStepSchema = z.object({
  id: z.string().optional(),
  tipo: z.enum(['apostila', 'aulas', 'aulas_bonus', 'questoes', 'flashcards']),
  label: z.string().optional(),
  detalhe: z.string().optional(),
  dia: z.enum(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']).optional(),
  metaQuestoes: z.number().int().positive().optional(),
  temaQuestoes: z.string().optional(),
  focoQuestoes: z.string().optional(),
});

export const CronogramaRevisaoConfigSchema = z.object({
  ativa: z.boolean().optional(),
  intervalos: z.array(z.number().int().positive()).optional(),
  passos: z.array(FlowStepSchema).optional(),
});

export const CronogramaRevisaoSchema = z.union([
  z.boolean(),
  z.array(FlowStepSchema),
  CronogramaRevisaoConfigSchema,
]);

// Esquema para validar cada Tópico
export const CronogramaTopicoSchema = z.object({
  id: z.string().min(1, 'O tópico deve ter um ID.'), // O Zod garante que o ID nunca venha vazio
  titulo: z.string().min(1, 'O tópico deve ter um título.'),
  area: z.string().min(1, 'A grande área é obrigatória.'),
  grandeArea: z.string().optional(),
  especialidade: z.string().optional(),
  topicosSecundarios: z.array(z.string()).optional(),
  aulasBonus: z.union([z.string(), z.array(z.string())]).optional(),
  estimativaMinutos: z.number().int().positive().optional(),
  assignedDay: z.enum(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']).optional(),
  passos: z.array(FlowStepSchema).optional(),
  revisao: CronogramaRevisaoSchema.optional(),
  revisão: CronogramaRevisaoSchema.optional(),
});

// Esquema para validar cada Semana
export const CronogramaSemanaSchema = z.object({
  numero: z.number().int().positive(),
  titulo: z.string().optional(),
  subtitulo: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  topicos: z.array(CronogramaTopicoSchema),
});

// Esquema Principal (A Raiz do JSON)
export const CronogramaJSONSchema = z.object({
  versao: z.union([z.number(), z.string()]).optional(),
  titulo: z.string().optional(),
  descricao: z.string().optional(),
  dataAtualizacao: z.string().optional(),
  semanas: z.array(CronogramaSemanaSchema).min(1, 'O cronograma deve conter pelo menos uma semana.'),
});

// Tipagem inferida diretamente do Zod (Substitui as interfaces antigas se quiser)
export type ValidatedCronogramaData = z.infer<typeof CronogramaJSONSchema>;

