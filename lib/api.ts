export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  const token = document.cookie
    .split('; ')
    .find(row => row.startsWith('access_token='))
    ?.split('=')[1];

  const fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
}