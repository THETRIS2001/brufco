import { describe, expect, it } from 'vitest';
import { calcola, giorno, giornoPrima } from '../src/serie';

const insieme = (...giorni: string[]) => new Set(giorni);

describe('i giorni della serie', () => {
  it("sono quelli di Roma, con l'ora legale e senza", () => {
    expect(giorno(Date.UTC(2026, 8, 30, 21, 59))).toBe('2026-09-30');
    expect(giorno(Date.UTC(2026, 8, 30, 22, 0))).toBe('2026-10-01');
    expect(giorno(Date.UTC(2026, 11, 31, 22, 59))).toBe('2026-12-31');
    expect(giorno(Date.UTC(2026, 11, 31, 23, 0))).toBe('2027-01-01');
  });

  it('il giorno prima passa mesi, anni e cambi d\'ora', () => {
    expect(giornoPrima('2026-10-01')).toBe('2026-09-30');
    expect(giornoPrima('2027-01-01')).toBe('2026-12-31');
    expect(giornoPrima('2027-03-29')).toBe('2027-03-28');
    expect(giornoPrima('2028-03-01')).toBe('2028-02-29');
  });
});

describe('la serie', () => {
  it('da soli, o senza disegni, non c\'e\'', () => {
    expect(calcola(insieme(), insieme(), '2026-10-05')).toEqual({ giorni: 0, oggi: { io: false, altro: false }, record: 0, persa: null });
    expect(calcola(insieme('2026-10-04', '2026-10-05'), insieme(), '2026-10-05').giorni).toBe(0);
  });

  it('oggi conta appena l\'avete fatto tutti e due', () => {
    const s = calcola(insieme('2026-10-04', '2026-10-05'), insieme('2026-10-04', '2026-10-05'), '2026-10-05');
    expect(s).toMatchObject({ giorni: 2, oggi: { io: true, altro: true }, record: 2, persa: null });
  });

  it('finche\' oggi non e\' finito non si perde: vale fino a ieri, e dice chi manca', () => {
    const s = calcola(insieme('2026-10-03', '2026-10-04', '2026-10-05'), insieme('2026-10-03', '2026-10-04'), '2026-10-05');
    expect(s).toMatchObject({ giorni: 2, oggi: { io: true, altro: false }, persa: null });
  });

  it('persa ieri: di chi quel giorno non ha disegnato, e quanto era lunga', () => {
    const mie = insieme('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04');
    const sue = insieme('2026-10-01', '2026-10-02', '2026-10-03');
    expect(calcola(mie, sue, '2026-10-05')).toEqual({
      giorni: 0,
      oggi: { io: false, altro: false },
      record: 3,
      persa: { giorno: '2026-10-04', durata: 3, chi: ['altro'] },
    });
    // Vista dall'altra parte, la colpa e' di "io".
    expect(calcola(sue, mie, '2026-10-05').persa?.chi).toEqual(['io']);
  });

  it('ricominciata dopo un buco di tutti e due: la nuova, il record e la colpa di entrambi', () => {
    const tutti = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25'];
    const s = calcola(insieme(...tutti), insieme(...tutti), '2026-09-26');
    expect(s).toEqual({
      giorni: 2,
      oggi: { io: false, altro: false },
      record: 3,
      persa: { giorno: '2026-09-23', durata: 3, chi: ['io', 'altro'] },
    });
  });

  it('attraverso il cambio di mese', () => {
    const giorni = insieme('2026-09-29', '2026-09-30', '2026-10-01');
    expect(calcola(giorni, giorni, '2026-10-01').giorni).toBe(3);
  });
});
