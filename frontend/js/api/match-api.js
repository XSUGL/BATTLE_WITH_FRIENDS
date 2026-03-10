import { getToken, logout } from './auth-api.js';

const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000/api';

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    // Token expired or invalid - clear storage before redirecting
    logout();
    window.location.href = '/index.html';
    throw new Error('Authentication required');
  }
  
  return response;
}

export async function sendInvitation(username) {
  const response = await fetchWithAuth(`${API_BASE_URL}/matches/invite`, {
    method: 'POST',
    body: JSON.stringify({ username })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to send invitation');
  }
  
  return await response.json();
}

export async function getActiveInvitations() {
  const response = await fetchWithAuth(`${API_BASE_URL}/matches/invites/active`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch invitations');
  }
  
  return await response.json();
}

export async function acceptInvitation(invitationId) {
  const response = await fetchWithAuth(`${API_BASE_URL}/matches/invites/${invitationId}/accept`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to accept invitation');
  }
  
  return await response.json();
}

export async function getLeaderboard() {
  const response = await fetchWithAuth(`${API_BASE_URL}/leaderboard`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch leaderboard');
  }
  
  return await response.json();
}

export async function getMatchHistory() {
  const response = await fetchWithAuth(`${API_BASE_URL}/matches/history`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch match history');
  }
  
  return await response.json();
}

export async function getActiveMatch() {
  const response = await fetchWithAuth(`${API_BASE_URL}/matches/active`);
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch active match');
  }
  
  return await response.json();
}