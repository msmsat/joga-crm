import { useNavigate } from "react-router-dom";
import { getActiveToken } from "../../../utils/auth";

/**
 * Куда ведут кнопки входа и регистрации лендинга.
 *
 * Вошедшему в аккаунт не нужна ни форма входа, ни регистрация — обе уводят его
 * в кабинет. Раньше «Попробовать 30 дней бесплатно» безусловно вело на
 * /register: человек с живым токеном попадал на форму создания аккаунта, хотя
 * аккаунт у него уже есть.
 *
 * Токен читается в момент клика, а не при отрисовке страницы: лендинг живёт
 * открытым подолгу, и за это время в соседней вкладке могли и войти, и выйти.
 */
export function useEntry() {
  const navigate = useNavigate();
  return {
    toLogin: () => navigate(getActiveToken() ? "/dashboard" : "/login"),
    toRegister: () => navigate(getActiveToken() ? "/dashboard" : "/register"),
  };
}
