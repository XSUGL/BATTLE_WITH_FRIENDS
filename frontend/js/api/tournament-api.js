import { getToken, logout } from './auth-api.js';

const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/webapp2/api`;

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    logout();
    window.location.href = '/webapp2/index.html';
    throw new Error('Authentication required');
  }
  return response;
}

export async function listTournaments() {
  const res = await fetchWithAuth(`${API_BASE_URL}/tournaments`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to load tournaments');
  }
  return res.json();
}

export async function createTournament({ name, size }) {
  const res = await fetchWithAuth(`${API_BASE_URL}/tournaments`, {
    method: 'POST',
    body: JSON.stringify({ name, size })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create tournament');
  }
  return res.json();
}

export async function joinTournament(id) {
  const res = await fetchWithAuth(`${API_BASE_URL}/tournaments/${id}/join`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to join tournament');
  }
  return res.json();
}

export async function getTournament(id) {
  const res = await fetchWithAuth(`${API_BASE_URL}/tournaments/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to load tournament');
  }
  return res.json();
}
