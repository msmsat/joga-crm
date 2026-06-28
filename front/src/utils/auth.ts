export function getUserRoleFromToken(): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    // JWT состоит из 3 частей через точку. Нам нужна вторая часть (payload)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload).role || null;
  } catch (e) {
    return null;
  }
}