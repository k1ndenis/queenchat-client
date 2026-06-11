export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  const token = document.cookie
    .split('; ')
    .find(row => row.startsWith('access_token='))
    ?.split('=')[1];

  const fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`;

  const isFormData = options.body instanceof FormData;
  
  const headers: HeadersInit = {
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers,
  });

  return response;
}

export async function checkAuthAndRedirect() {
  const response = await fetchWithAuth('/auth/me');
  
  if (!response.ok && response.status === 401) {
    document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    localStorage.removeItem('access_token');
    
    if (!window.location.pathname.includes('/login') && 
        !window.location.pathname.includes('/register')) {
      window.location.href = '/login';
    }
    return false;
  }
  
  return true;
}