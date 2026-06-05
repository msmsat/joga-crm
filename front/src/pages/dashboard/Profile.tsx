export default function Profile() {
  // Функция для выхода из аккаунта
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div style={{ maxWidth: '480px' }}>
      
      {/* ─── 1. ОСНОВНАЯ ИНФОРМАЦИЯ И НАСТРОЙКИ ─── */}
      <div className="card mb-20">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div className="user-avatar" style={{ width: '60px', height: '60px', fontSize: '18px' }}>
            АМ
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>Алексей Морозов</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>admin@velora.studio</div>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Email</div>
            <div className="sub">admin@velora.studio</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Телефон</div>
            <div className="sub">+7 (999) 123-45-67</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Пароль</div>
            <div className="sub">Последнее изменение: 30 дней назад</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Сменить</button>
        </div>
      </div>

      {/* ─── 2. ПЕРЕКЛЮЧЕНИЕ АККАУНТОВ ─── */}
      <div className="card mb-20">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Сменить аккаунт</div>
        
        {/* Текущий (Активный) аккаунт */}
        <div className="staff-item" style={{ padding: '10px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'rgba(252,174,145,0.06)' }}>
          <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#FCAE91,#f5887a)' }}>АМ</div>
          <div className="staff-info">
            <div className="name">Алексей Морозов</div>
            <div className="role">admin@velora.studio</div>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>Активен</div>
        </div>

        {/* Второй аккаунт */}
        <div className="staff-item" style={{ cursor: 'pointer', marginTop: '4px' }}>
          <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#4A80C4,#3a6ab0)' }}>ОС</div>
          <div className="staff-info">
            <div className="name">Ольга Смирнова</div>
            <div className="role">olga@velora.studio</div>
          </div>
        </div>

        <button className="topbar-ghost" style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}>
          + Добавить аккаунт
        </button>
      </div>

      {/* ─── 3. ВЫХОД ИЗ АККАУНТА ─── */}
      <button 
        onClick={handleLogout} 
        className="btn-ghost" 
        style={{ 
          width: '100%', 
          padding: '12px', 
          color: 'var(--rose)', // Делаем текст красным, чтобы подчеркнуть деструктивное действие
          borderColor: 'var(--border)' 
        }}
      >
        Выйти из аккаунта
      </button>

    </div>
  );
}