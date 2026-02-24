import { register, login, saveToken, saveUser, getToken } from './api/auth-api.js';

// Check if already logged in
if (getToken()) {
  window.location.href = '/dashboard.html';
}

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginFormContainer = document.getElementById('login-form');
const registerFormContainer = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Switch between login and register forms
showRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginFormContainer.style.display = 'none';
  registerFormContainer.style.display = 'block';
  loginError.classList.remove('show');
  registerError.classList.remove('show');
});

showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registerFormContainer.style.display = 'none';
  loginFormContainer.style.display = 'block';
  loginError.classList.remove('show');
  registerError.classList.remove('show');
});

// Handle login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  try {
    loginError.classList.remove('show');
    const response = await login(username, password);
    
    saveToken(response.token);
    saveUser(response.user);
    
    window.location.href = '/dashboard.html';
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.add('show');
  }
});

// Handle register
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  
  try {
    registerError.classList.remove('show');
    const response = await register(username, password);
    
    saveToken(response.token);
    saveUser(response.user);
    
    window.location.href = '/dashboard.html';
  } catch (error) {
    registerError.textContent = error.message;
    registerError.classList.add('show');
  }
});
