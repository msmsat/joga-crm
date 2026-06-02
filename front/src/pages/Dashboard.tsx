import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Типизация для наших данных
interface ChartData {
  name: string;
  sales: number;
  profit: number;
}

// Моковые данные для графика
const data: ChartData[] = [
  { name: 'Янв', sales: 4000, profit: 2400 },
  { name: 'Фев', sales: 3000, profit: 1398 },
  { name: 'Мар', sales: 2000, profit: 9800 },
  { name: 'Апр', sales: 2780, profit: 3908 },
  { name: 'Май', sales: 1890, profit: 4800 },
  { name: 'Июн', sales: 2390, profit: 3800 },
  { name: 'Июл', sales: 3490, profit: 4300 },
];

const App: React.FC = () => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>
        Статистика продаж за полгода
      </h1>
      
      {/* ResponsiveContainer делает график адаптивным под ширину экрана */}
      <div style={{ width: '100%', height: 400, marginTop: '40px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            {/* Сетка на фоне графика */}
            <CartesianGrid strokeDasharray="3 3" />
            
            {/* Оси */}
            <XAxis dataKey="name" />
            <YAxis />
            
            {/* Всплывающая подсказка при наведении */}
            <Tooltip />
            
            {/* Легенда (описание линий) */}
            <Legend />
            
            {/* Сами линии графика */}
            <Line 
              type="monotone" 
              dataKey="sales" 
              name="Продажи" 
              stroke="#8884d8" 
              activeDot={{ r: 8 }} 
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="profit" 
              name="Прибыль" 
              stroke="#82ca9d" 
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default App;