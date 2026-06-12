let globalAvatarVersion = localStorage.getItem('avatar_version') || Date.now().toString();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'avatar_version' && event.newValue) {
      globalAvatarVersion = event.newValue;
      window.dispatchEvent(new CustomEvent('avatar-version-changed', { 
        detail: { version: event.newValue } 
      }));
    }
  });
}

export const bumpAvatarVersion = () => {
  const newVersion = Date.now().toString();
  globalAvatarVersion = newVersion;
  localStorage.setItem('avatar_version', newVersion);
  return newVersion;
};

export const getCurrentAvatarVersion = () => {
  return localStorage.getItem('avatar_version') || globalAvatarVersion;
};

export const addVersionToAvatarUrl = (url: string | null): string | null => {
  if (!url) return null;
  const version = getCurrentAvatarVersion();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
};

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  const token = document.cookie
    .split('; ')
    .find(row => row.startsWith('access_token='))
    ?.split('=')[1];

  let finalUrl = url;
  if (url.includes('/auth/me') || url.includes('/files/avatar')) {
    const version = getCurrentAvatarVersion();
    const separator = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${separator}_cb=${version}`;
  }

  const fullUrl = finalUrl.startsWith('http') ? finalUrl : `${apiUrl}${finalUrl}`;

  const isFormData = options.body instanceof FormData;
  
  const headers: HeadersInit = {
    ...(token && { 'Authorization': `Bearer ${token}` }),
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
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
    localStorage.removeItem('avatar_version');
    
    if (!window.location.pathname.includes('/login') && 
        !window.location.pathname.includes('/register')) {
      window.location.href = '/login';
    }
    return false;
  }
  
  return true;
}