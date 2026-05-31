'use strict';
/**
 * financeDate.js — helpers de data para o módulo financeiro
 *
 * REGRA: TODO o sistema financeiro usa este módulo.
 * Timezone canônico: America/Sao_Paulo (UTC-3 / UTC-2 no horário de verão)
 *
 * Estratégia: passar datas como strings "YYYY-MM-DD" e deixar o PostgreSQL
 * fazer a conversão via AT TIME ZONE — zero dependências externas, imune ao
 * fuso do servidor.
 *
 * Uso nas queries:
 *   (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $start AND $end
 *   EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Sao_Paulo'))::int
 */

const TZ = 'America/Sao_Paulo';

/**
 * Retorna "YYYY-MM-DD" de hoje no horário de Brasília.
 */
function brazilToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Retorna { startDate, endDate } como strings "YYYY-MM-DD" para o período.
 *
 * @param {'today'|'week'|'month'} period
 * @returns {{ startDate: string, endDate: string }}
 */
function getPeriodDates(period = 'today') {
  const todayBR = brazilToday(); // "YYYY-MM-DD"

  if (period === 'today') {
    return { startDate: todayBR, endDate: todayBR };
  }

  if (period === 'week') {
    // Últimos 7 dias (hoje inclusive)
    const dt = new Date();
    dt.setDate(dt.getDate() - 6);
    const startBR = dt.toLocaleDateString('en-CA', { timeZone: TZ });
    return { startDate: startBR, endDate: todayBR };
  }

  if (period === 'month') {
    const [y, m] = todayBR.split('-');
    return { startDate: `${y}-${m}-01`, endDate: todayBR };
  }

  return { startDate: todayBR, endDate: todayBR };
}

/**
 * Retorna { startDate, endDate } para um mês "YYYY-MM".
 * Usado para filtros de gastos (expenses).
 *
 * @param {string} month  ex.: "2026-05"
 * @returns {{ startDate: string, endDate: string, year: number, month: number }}
 */
function getMonthDates(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const [y, mon] = m.split('-').map(Number);
  const lastDay  = new Date(y, mon, 0).getDate();
  const pad      = (n) => String(n).padStart(2, '0');
  return {
    startDate: `${y}-${pad(mon)}-01`,
    endDate:   `${y}-${pad(mon)}-${pad(lastDay)}`,
    year:  y,
    month: mon,
  };
}

/**
 * Retorna o período anterior equivalente como { startDate, endDate }.
 * Útil para comparativos "esta semana vs semana passada".
 *
 * @param {'today'|'week'|'month'} period
 */
function getPrevPeriodDates(period = 'today') {
  if (period === 'today') {
    const dt = new Date();
    dt.setDate(dt.getDate() - 1);
    const d = dt.toLocaleDateString('en-CA', { timeZone: TZ });
    return { startDate: d, endDate: d };
  }

  if (period === 'week') {
    const end = new Date();
    end.setDate(end.getDate() - 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return {
      startDate: start.toLocaleDateString('en-CA', { timeZone: TZ }),
      endDate:   end.toLocaleDateString('en-CA',   { timeZone: TZ }),
    };
  }

  if (period === 'month') {
    const todayBR = brazilToday();
    const [y, m]  = todayBR.split('-').map(Number);
    const prevMon = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const lastDay  = new Date(prevYear, prevMon, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return {
      startDate: `${prevYear}-${pad(prevMon)}-01`,
      endDate:   `${prevYear}-${pad(prevMon)}-${pad(lastDay)}`,
    };
  }

  return getPeriodDates(period);
}

module.exports = { TZ, brazilToday, getPeriodDates, getMonthDates, getPrevPeriodDates };
