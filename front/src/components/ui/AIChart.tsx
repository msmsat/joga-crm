import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatMoney } from '../../lib/money';
import { fmtInt } from '../../lib/format';
import type { AIChartSpec } from './aiChartSpec';

// Оформление — как у графиков Отчётов (persona ДС §6). Значения продублированы
// сюда намеренно: компонент кита не должен зависеть от папки страницы Отчётов.
const PEACH = '#F9A08B';
const PEACH_LIGHT = '#FCAE91';
const PISTACHIO = '#A3C9A8';
const ROSE = '#D88C9A';
const PIE_COLORS = [PEACH, PEACH_LIGHT, PISTACHIO, ROSE, '#4A80C4'];
const AXIS_X = { tick: { fontSize: 11, fill: 'var(--text3)', fontWeight: 600 }, axisLine: false, tickLine: false, dy: 6 } as const;
const TOOLTIP_STYLE = {
  borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px',
  background: 'var(--bg-card)', boxShadow: '0 8px 24px -4px rgba(26,26,26,0.12)', padding: '8px 12px',
} as const;
const BAR_CURSOR = { fill: 'rgba(249,160,139,0.10)', radius: 8 } as const;

// Высота — из токена плотности интерфейса (--chart-h), а не числом: на
// планшете и телефоне он уже уменьшен. В дровере (compact) график ужимается:
// панель 320-420px, полновысотный график вытеснил бы из неё сам разговор.
function chartHeight(compact: boolean): number {
  const token = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chart-h'), 10);
  const base = Number.isFinite(token) && token > 0 ? token : 300;
  return compact ? Math.round(base * 0.6) : base;
}

export interface AIChartProps {
  spec: AIChartSpec;
  /** Дровер: меньше высота и без легенды — там тесно. */
  compact?: boolean;
}

// График в ответе ассистента (эпик AI-6, задача 2). Модель отдаёт только
// данные — рисует их наш код нашей палитрой; ни SVG, ни HTML от модели
// не принимаем (решение 1 эпика).
export function AIChart({ spec, compact = false }: AIChartProps) {
  const height = chartHeight(compact);
  const fmt = (v: number) => (spec.currency ? formatMoney(v, spec.currency) : fmtInt(v));

  return (
    <div className="v-ai-chart">
      {spec.title && <div className="v-ai-chart-title">{spec.title}</div>}
      {/* height числом, а не '100%': recharts до первого ResizeObserver считает
          обе стороны равными -1 и предупреждает в консоль на каждый график. */}
      <div style={{ height, minWidth: 0, width: '100%' }}>
        <ResponsiveContainer width="100%" height={height}>
          {spec.type === 'pie' ? (
            <PieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} formatter={(v) => fmt(Number(v))} />
              {!compact && <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
              <Pie data={spec.data} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="80%" paddingAngle={2} animationDuration={400}>
                {spec.data.map((point, i) => <Cell key={point.label + i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
            </PieChart>
          ) : spec.type === 'line' ? (
            <LineChart data={spec.data}>
              <CartesianGrid vertical={false} stroke="rgba(var(--ink),0.05)" />
              <XAxis dataKey="label" {...AXIS_X} interval="preserveStartEnd" minTickGap={16} />
              <YAxis hide />
              <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} formatter={(v) => fmt(Number(v))} />
              <Line type="monotone" dataKey="value" stroke={PEACH} strokeWidth={2} dot={false} animationDuration={400} />
            </LineChart>
          ) : (
            <BarChart data={spec.data}>
              <XAxis dataKey="label" {...AXIS_X} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip contentStyle={TOOLTIP_STYLE} isAnimationActive={false} cursor={BAR_CURSOR} formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="value" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} animationDuration={400} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
