import { describe, expect, it } from 'vitest';
import { shouldQuarantine, validateAppeal } from './appeals';

describe('validateAppeal', () => {
  it('exige motivo válido e argumento mínimo', () => {
    expect(validateAppeal('', 'a'.repeat(30))).toBeTruthy();
    expect(validateAppeal('outro', 'curto')).toBeTruthy();
    expect(validateAppeal('outro', 'a'.repeat(1501))).toBeTruthy();
    expect(validateAppeal('gabarito_incorreto', 'a'.repeat(30))).toBeNull();
  });
});

describe('shouldQuarantine', () => {
  const d = (userId: string, confidence: number, verdict: 'deferido' | 'indeferido' = 'deferido') => ({
    userId,
    verdict,
    confidence,
  });
  it('3 usuários distintos deferidos com confiança ≥ 0,7', () => {
    expect(shouldQuarantine([d('a', 0.9), d('b', 0.8), d('c', 0.7)])).toBe(true);
  });
  it('não conta confiança baixa, indeferidos nem o mesmo usuário repetido', () => {
    expect(shouldQuarantine([d('a', 0.9), d('b', 0.5), d('c', 0.9)])).toBe(false);
    expect(shouldQuarantine([d('a', 0.9), d('b', 0.9), d('c', 0.9, 'indeferido')])).toBe(false);
    expect(shouldQuarantine([d('a', 0.9), d('a', 0.9), d('a', 0.9)])).toBe(false);
  });
});
