import { SparklesIcon } from './BillingIcons';

interface Props {
  monthlyPrice: number;
  period: number;
  discount: number;
}

export default function SavingsIllustration({ monthlyPrice, period, discount }: Props) {
  const total = monthlyPrice * period;
  const saved = Math.round(total * discount);
  const toPay = total - saved;
  const progress = discount * 100;

  return (
    <div style={{
      padding: '28px',
      background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, rgba(249,160,139,0.02) 100%)',
      border: '1px solid rgba(252,174,145,0.2)',
      borderRadius: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '-30px', right: '-30px',
        width: '120px', height: '120px',
        background: 'radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <SparklesIcon />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
          Ваша экономия при оплате вперёд
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Без скидки</span>
        <span style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'line-through' }}>
          ₽{total.toLocaleString('ru-RU')}
        </span>
      </div>

      <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', marginBottom: '8px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${100 - progress}%`,
          background: 'linear-gradient(90deg, var(--peach), #F9A08B)',
          borderRadius: '3px',
          transition: 'width 0.8s cubic-bezier(0.34,1.1,0.64,1)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.5px' }}>
            ₽{toPay.toLocaleString('ru-RU')}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pistachio)', fontWeight: 600 }}>
            За {period} {period === 1 ? 'месяц' : period < 5 ? 'месяца' : 'месяцев'}
          </div>
        </div>
        <div style={{
          padding: '10px 16px',
          background: 'rgba(163,201,168,0.15)',
          border: '1px solid rgba(163,201,168,0.3)',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--pistachio)' }}>
            −{progress}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            ₽{saved.toLocaleString('ru-RU')} экономия
          </div>
        </div>
      </div>

      <div style={{
        padding: '12px 16px',
        background: 'rgba(252,174,145,0.08)',
        borderRadius: '12px',
        fontSize: '12px',
        color: 'var(--muted)',
        lineHeight: '1.6',
      }}>
        💡 Это как <strong style={{ color: 'var(--onyx)' }}>
          {Math.round(saved / 990)} месяца бесплатно
        </strong> по сравнению с помесячной оплатой
      </div>
    </div>
  );
}
