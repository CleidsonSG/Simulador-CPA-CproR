import type { ExamConfig } from '../types';
import type { Level, TopicStat } from './analysis';

export interface PlanInput {
  cfg: ExamConfig;
  stats: TopicStat[];
  daysPerWeek: number;
  minutesPerDay: number;
  /** AAAA-MM-DD, opcional */
  examDate?: string;
  today?: Date;
}

export interface Block {
  topic: string;
  minutes: number;
  level: Level;
  known: boolean;
  focus: string;
}
export interface DaySlot { topic: string; minutes: number }
export interface DayPlan {
  day: string;
  kind: 'estudo' | 'simulado';
  slots: DaySlot[];
  minutes: number;
  note?: string;
}
export interface Phase { name: string; goal: string; from?: Date; to?: Date }
export interface StudyPlan {
  weeklyMinutes: number;
  topicMinutes: number;
  cycle: Block[];
  week: DayPlan[];
  phases: Phase[];
  weeksLeft: number | null;
  warnings: string[];
}

export const DAY_SETS: Record<number, string[]> = {
  2: ['Terça', 'Sábado'],
  3: ['Segunda', 'Quarta', 'Sábado'],
  4: ['Segunda', 'Terça', 'Quinta', 'Sábado'],
  5: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sábado'],
  6: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  7: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

export function parseDate(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function focusText(level: Level, known: boolean): string {
  if (!known) return 'Sem dados ainda: estude o básico do tema e faça questões para diagnosticar';
  if (level === 'critico') return 'Teoria do tema + resolver questões + anotar cada erro';
  if (level === 'atencao') return 'Revisar os pontos fracos + questões do tema';
  return 'Revisão rápida + poucas questões para manter';
}

/** Tempo semanal de estudo dos temas, dividido em blocos de 5 min; mais tempo para os temas mais fracos. */
export function allocate(stats: TopicStat[], total: number): Block[] {
  if (stats.length === 0 || total <= 0) return [];
  const weights = stats.map((s) => 0.25 + (1 - s.acc));
  const sum = weights.reduce((a, b) => a + b, 0);
  const minBlock = clamp(Math.floor(total / stats.length / 5) * 5, 5, 15);
  const mins = weights.map((w) => Math.max(minBlock, Math.round(((w / sum) * total) / 5) * 5));
  let diff = total - mins.reduce((a, b) => a + b, 0);
  let guard = 500;
  while (diff !== 0 && guard-- > 0) {
    if (diff > 0) {
      const i = weights.indexOf(Math.max(...weights)); // sobra vai para o tema mais fraco
      mins[i] += 5;
      diff -= 5;
    } else {
      // tira do tema mais forte que ainda tenha folga
      let idx = -1;
      let best = Infinity;
      mins.forEach((m, i) => {
        if (m - 5 >= minBlock && weights[i] < best) {
          best = weights[i];
          idx = i;
        }
      });
      if (idx === -1) break;
      mins[idx] -= 5;
      diff += 5;
    }
  }
  return stats
    .map((s, i) => ({
      topic: s.topic,
      minutes: mins[i],
      level: s.level,
      known: s.known,
      focus: focusText(s.level, s.known),
    }))
    .sort((a, b) => b.minutes - a.minutes); // mais tempo (mais fraco) primeiro
}

function pack(blocks: Block[], dayNames: string[], cap: number): DayPlan[] {
  const days: DayPlan[] = dayNames.map((day) => ({ day, kind: 'estudo', slots: [], minutes: 0 }));
  let di = 0;
  for (const b of blocks) {
    let left = b.minutes;
    while (left > 0 && di < days.length) {
      const free = cap - days[di].minutes;
      if (free < 5) {
        di++;
        continue;
      }
      const take = Math.min(free, left);
      days[di].slots.push({ topic: b.topic, minutes: take });
      days[di].minutes += take;
      left -= take;
    }
  }
  return days;
}

export function buildPlan(input: PlanInput): StudyPlan {
  const { cfg, stats } = input;
  const today = startOfDay(input.today ?? new Date());
  const dayNames = DAY_SETS[clamp(Math.round(input.daysPerWeek), 2, 7)];
  const cap = clamp(Math.round(input.minutesPerDay / 5) * 5, 20, 480);
  const weeklyMinutes = dayNames.length * cap;
  const warnings: string[] = [];

  const hasSimDay = dayNames.length >= 3;
  const topicDayNames = hasSimDay ? dayNames.slice(0, -1) : dayNames;
  const topicMinutes = topicDayNames.length * cap;

  const cycle = allocate(stats, topicMinutes);
  const week = pack(cycle, topicDayNames, cap);

  if (hasSimDay) {
    const perQ = cfg.minutes / cfg.total; // min por questão na prova real
    let note: string;
    if (cap >= cfg.minutes) {
      note = `Simulado completo (${cfg.total} questões, ${fmtMin(cfg.minutes)}) e revisão dos erros nos dias seguintes`;
    } else {
      const n = Math.max(10, Math.floor((cap * 0.6) / perQ / 5) * 5);
      const simMin = Math.round(n * perQ);
      note = `Mini-simulado de ${n} questões (≈${fmtMin(simMin)}) + ${fmtMin(cap - simMin)} de revisão dos erros`;
    }
    week.push({ day: dayNames[dayNames.length - 1], kind: 'simulado', slots: [], minutes: cap, note });
  } else {
    warnings.push('Com 2 dias por semana, faça um mini-simulado a cada 2 semanas e revise os erros no fim de cada sessão.');
  }

  if (weeklyMinutes < 180) warnings.push('Menos de 3 h por semana costuma ser pouco para cobrir todos os temas. Se puder, aumente.');
  if (stats.every((s) => !s.known)) {
    warnings.push('Você ainda não fez simulados: este plano inicial é equilibrado. Faça um simulado e gere o plano de novo.');
  }

  // Fases até a prova
  const exam = parseDate(input.examDate);
  let weeksLeft: number | null = null;
  let phases: Phase[];
  if (exam && exam.getTime() > today.getTime()) {
    const daysLeft = Math.ceil((exam.getTime() - today.getTime()) / 86400000);
    weeksLeft = Math.ceil(daysLeft / 7);
    const finalStart = addDays(exam, -7).getTime() < today.getTime() ? today : addDays(exam, -7);
    const intensStart = addDays(finalStart, -21).getTime() < today.getTime() ? today : addDays(finalStart, -21);
    phases = [];
    if (intensStart.getTime() > today.getTime()) {
      phases.push({ name: 'Base', from: today, to: addDays(intensStart, -1), goal: 'Repetir o ciclo toda semana e subir todos os temas para 70% ou mais.' });
    }
    if (finalStart.getTime() > intensStart.getTime()) {
      phases.push({ name: 'Intensivo', from: intensStart, to: addDays(finalStart, -1), goal: 'Mesmo ciclo, com um simulado completo por semana e foco nos temas ainda abaixo de 70%.' });
    }
    phases.push({ name: 'Reta final', from: finalStart, to: exam, goal: 'Sem matéria nova: 2 simulados completos, revisão dos erros e descanso na véspera.' });
  } else {
    if (input.examDate) warnings.push('A data da prova já passou ou é hoje. Informe uma data futura para ver as fases.');
    phases = [
      { name: 'Base', goal: 'Repetir o ciclo toda semana até todos os temas chegarem a 70% ou mais.' },
      { name: 'Intensivo', goal: 'Um simulado completo por semana e foco nos temas ainda fracos.' },
      { name: 'Reta final', goal: 'Última semana: sem matéria nova, simulados e revisão dos erros.' },
    ];
  }

  return { weeklyMinutes, topicMinutes, cycle, week, phases, weeksLeft, warnings };
}

/** Revisão espaçada dos erros: 1, 7 e 30 dias depois do simulado. */
export const REVIEW_RULES: string[] = [
  'Dia seguinte ao simulado: releia cada questão errada e escreva em uma linha por que errou.',
  '7 dias depois: refaça as questões que errou, sem olhar a explicação.',
  '30 dias depois: refaça de novo as que ainda errar e leve-as para o próximo ciclo.',
];
