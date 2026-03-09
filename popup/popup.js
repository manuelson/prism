// GitHub PR Viewer - Popup Script

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const loadingScreen = document.getElementById('loading-screen');
const mainScreen = document.getElementById('main-screen');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const repoSelect = document.getElementById('repo-select');
const tabs = document.querySelectorAll('.tab');
const prList = document.getElementById('pr-list');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');

// State
let currentTab = 'my-prs';
let currentUser = null;
let accessToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const stored = await chrome.storage.local.get(['accessToken', 'user']);

  if (stored.accessToken && stored.user) {
    accessToken = stored.accessToken;
    currentUser = stored.user;
    showScreen('main');
    await loadRepos();
  } else {
    showScreen('login');
  }

  // Event listeners
  loginBtn.addEventListener('click', handleLogin);
  refreshBtn.addEventListener('click', handleRefresh);
  logoutBtn.addEventListener('click', handleLogout);
  repoSelect.addEventListener('change', handleRepoChange);

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      loadPRs();
    });
  });
}

function showScreen(screen) {
  loginScreen.classList.add('hidden');
  loadingScreen.classList.add('hidden');
  mainScreen.classList.add('hidden');
  loginError.classList.add('hidden');

  switch (screen) {
    case 'login':
      loginScreen.classList.remove('hidden');
      break;
    case 'loading':
      loadingScreen.classList.remove('hidden');
      break;
    case 'main':
      mainScreen.classList.remove('hidden');
      userAvatar.src = currentUser.avatar_url;
      userName.textContent = currentUser.login;
      break;
  }
}

async function handleLogin() {
  showScreen('loading');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'login' });

    if (response.success) {
      accessToken = (await chrome.storage.local.get(['accessToken'])).accessToken;
      currentUser = response.user;
      showScreen('main');
      await loadRepos();
    } else {
      throw new Error(response.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    showScreen('login');
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['accessToken', 'user', 'selectedRepo']);
  accessToken = null;
  currentUser = null;
  repoSelect.innerHTML = '';
  prList.innerHTML = '';
  showScreen('login');
}

async function handleRefresh() {
  await loadRepos();
  if (repoSelect.value) {
    await loadPRs();
  }
}

// API Calls
async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await handleLogout();
      throw new Error('Session expired. Please login again.');
    }
    let errorMessage = `API error: ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) errorMessage = errorBody.message;
    } catch (_) {}
    throw new Error(errorMessage);
  }

  return response.json();
}

async function loadRepos() {
  try {
    showLoading();
    repoSelect.innerHTML = '<option value="__all__">All Repositories</option>';

    let allRepos = [];
    let page = 1;

    while (true) {
      const repos = await fetchAPI(`/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=full_name`);
      allRepos = allRepos.concat(repos);
      if (repos.length < 100) break;
      page++;
      if (page > 20) break;
    }

    allRepos.sort((a, b) => a.full_name.localeCompare(b.full_name));

    // Group by owner using optgroups
    const byOwner = {};
    allRepos.forEach(repo => {
      const owner = repo.owner.login;
      if (!byOwner[owner]) byOwner[owner] = [];
      byOwner[owner].push(repo);
    });

    Object.keys(byOwner).sort().forEach(owner => {
      const group = document.createElement('optgroup');
      group.label = owner;
      byOwner[owner].forEach(repo => {
        const opt = document.createElement('option');
        opt.value = `${repo.owner.login}/${repo.name}`;
        opt.textContent = repo.name + (repo.private ? ' 🔒' : '');
        group.appendChild(opt);
      });
      repoSelect.appendChild(group);
    });

    // Restore selection, default to "All Repositories"
    const stored = await chrome.storage.local.get(['selectedRepo']);
    repoSelect.value = stored.selectedRepo || '__all__';
    await loadPRs();
  } catch (error) {
    console.error('Error loading repos:', error);
    emptyMessage.textContent = 'Error loading repositories: ' + error.message;
    emptyState.classList.remove('hidden');
  } finally {
    hideLoading();
  }
}

async function handleRepoChange() {
  const fullRepo = repoSelect.value;
  prList.innerHTML = '';
  emptyState.classList.add('hidden');

  await chrome.storage.local.set({ selectedRepo: fullRepo });
  await loadPRs();
}

async function loadPRs() {
  const fullRepo = repoSelect.value;
  if (!fullRepo) return;

  const isAll = fullRepo === '__all__';
  const repoFilter = isAll ? '' : `repo:${fullRepo} `;

  showLoading();
  prList.innerHTML = '';
  emptyState.classList.add('hidden');

  try {
    let prs;

    if (currentTab === 'my-prs') {
      const searchQuery = `type:pr ${repoFilter}author:${currentUser.login} state:open`;
      const result = await fetchAPI(`/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=50`);
      prs = result.items;
    } else {
      const searchQuery = `type:pr ${repoFilter}review-requested:${currentUser.login} state:open`;
      const result = await fetchAPI(`/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=50`);
      prs = result.items;
    }

    if (prs.length === 0) {
      emptyMessage.textContent = currentTab === 'my-prs'
        ? 'No open PRs created by you'
        : 'No PRs awaiting your review';
      emptyState.classList.remove('hidden');
    } else {
      renderPRs(prs, isAll);
    }
  } catch (error) {
    console.error('Error loading PRs:', error);
    emptyMessage.textContent = 'Error loading pull requests';
    emptyState.classList.remove('hidden');
  } finally {
    hideLoading();
  }
}

function renderPRs(prs, showRepo = false) {
  prList.innerHTML = '';

  prs.forEach(pr => {
    const isDraft = pr.draft;
    const li = document.createElement('li');
    li.className = 'pr-item';
    li.onclick = () => chrome.tabs.create({ url: pr.html_url });

    const labelsHtml = pr.labels.map(label => {
      const bgColor = `#${label.color}`;
      const textColor = getContrastColor(label.color);
      return `<span class="label" style="background: ${bgColor}; color: ${textColor}">${escapeHtml(label.name)}</span>`;
    }).join('');

    const repoName = showRepo ? pr.repository_url.replace('https://api.github.com/repos/', '') : '';

    li.innerHTML = `
      <div class="pr-icon ${isDraft ? 'draft' : ''}">
        <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
          <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
        </svg>
      </div>
      <div class="pr-content">
        ${repoName ? `<div class="pr-repo">${escapeHtml(repoName)}</div>` : ''}
        <div class="pr-title">${escapeHtml(pr.title)}</div>
        <div class="pr-meta">
          <span class="pr-number">#${pr.number}</span>
          <span>opened ${formatDate(pr.created_at)}</span>
        </div>
        ${labelsHtml ? `<div class="pr-labels">${labelsHtml}</div>` : ''}
      </div>
    `;

    prList.appendChild(li);
  });
}

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getContrastColor(hexColor) {
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#24292f' : '#ffffff';
}
