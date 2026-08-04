/** Фирменная палитра конфетти: персик, светлый персик, фисташка, молочный, белый. */
const COLORS = ['#F9A08B', '#FCAE91', '#A3C9A8', '#F4D9CE', '#FFFFFF'];

/**
 * Конфетти после успешной записи.
 *
 * Лежало копией в home и shedule — одна и та же функция на 20 строк в двух
 * файлах. Классы `.petal` и кадры `petal-rise` живут в App.css.
 */
export function spawnPetals() {
  for (let i = 0; i < 22; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'petal';
      const size = 5 + Math.random() * 6;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      p.style.left = `${Math.random() * (window.innerWidth - 20)}px`;
      p.style.bottom = '70px';
      p.style.borderRadius = Math.random() > 0.5 ? '50% 50% 0 50%' : '50%';
      p.style.animation = `petal-rise ${1.8 + Math.random()}s ease forwards`;
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }, i * 60);
  }
}
