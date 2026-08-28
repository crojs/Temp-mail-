document.addEventListener('DOMContentLoaded', function() {
  const storage = {
    available: true,
    get(key) { 
      try { return localStorage.getItem(key); } 
      catch(e) { this.available = false; return null; } 
    },
    set(key, value) { 
      try { localStorage.setItem(key, value); } 
      catch(e) { this.available = false; } 
    },
    remove(key) { 
      try { localStorage.removeItem(key); } 
      catch(e) { this.available = false; } 
    }
  };

  // ডাইনামিক বছর
  document.querySelectorAll('#year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // থিম টগল
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggle && themeIcon) {
    let darkMode = storage.get('tempmail_theme') === 'dark';
    function applyTheme() {
      if (darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
      } else {
        document.documentElement.removeAttribute('data-theme');
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
      }
    }
    applyTheme();
    themeToggle.addEventListener('click', function() {
      darkMode = !darkMode;
      storage.set('tempmail_theme', darkMode ? 'dark' : 'light');
      applyTheme();
    });
  }

  // মেনু টগল
  const menuToggle = document.getElementById('menuToggle');
  const menuOverlay = document.getElementById('menuOverlay');
  if (menuToggle && menuOverlay) {
    menuToggle.addEventListener('click', function() {
      this.classList.toggle('active');
      menuOverlay.classList.toggle('active');
      this.setAttribute('aria-expanded', this.classList.contains('active'));
    });
    menuOverlay.addEventListener('click', function(e) {
      if (e.target === menuOverlay) {
        menuOverlay.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // TempMail API (শুধু হোম পেজে)
  const tempEmailDisplay = document.getElementById('tempEmail');
  if (!tempEmailDisplay) return;

  const API_BASE = 'https://api.mail.gw';
  let currentAccount = null;
  let token = null;
  let refreshInterval = null;
  let isGenerating = false;

  const inboxList = document.getElementById('inboxList');
  const mailCount = document.getElementById('mailCount');
  const copyEmailBtn = document.getElementById('copyEmailBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const generateNewBtn = document.getElementById('generateNewBtn');

  if (!inboxList || !mailCount || !copyEmailBtn || !refreshBtn || !generateNewBtn) return;

  let storedAccount = storage.get('tempmail_account_mailgw');
  let storedToken = storage.get('tempmail_token_mailgw');

  async function initialize() {
    if (storedAccount && storedToken) {
      try {
        currentAccount = JSON.parse(storedAccount);
        token = storedToken;
        tempEmailDisplay.textContent = currentAccount.address;
        fetchMessages();
        startAutoRefresh();
        return;
      } catch (e) {}
    }
    await createNewAccount();
  }

  async function createNewAccount() {
    if (isGenerating) return;
    isGenerating = true;
    inboxList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Creating new email...</div>';
    try {
      const domainsRes = await fetch(`${API_BASE}/domains`);
      const domainsData = await domainsRes.json();
      const domains = domainsData['hydra:member'] || [];
      const domain = domains[0].domain;
      const username = 'user_' + Math.random().toString(36).substring(2, 10);
      const password = 'Pass_' + Math.random().toString(36).substring(2, 12);
      const address = `${username}@${domain}`;

      const accountRes = await fetch(`${API_BASE}/accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });
      const accountData = await accountRes.json();

      const tokenRes = await fetch(`${API_BASE}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });
      const tokenData = await tokenRes.json();
      token = tokenData.token;

      currentAccount = { id: accountData.id, address: accountData.address, createdAt: new Date().toISOString() };
      storage.set('tempmail_account_mailgw', JSON.stringify(currentAccount));
      storage.set('tempmail_token_mailgw', token);

      tempEmailDisplay.textContent = currentAccount.address;
      fetchMessages();
      startAutoRefresh();
    } catch (error) {
      inboxList.innerHTML = '<div class="no-mails"><i class="fas fa-exclamation-triangle"></i><br>Failed to create email.</div>';
    } finally {
      isGenerating = false;
    }
  }

  async function fetchMessages() {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        storage.remove('tempmail_account_mailgw');
        storage.remove('tempmail_token_mailgw');
        await createNewAccount();
        return;
      }
      const data = await res.json();
      const messages = data['hydra:member'] || [];
      displayMessages(messages);
    } catch (error) {
      setTimeout(fetchMessages, 3000);
    }
  }

  function displayMessages(messages) {
    mailCount.textContent = messages.length;
    if (messages.length === 0) {
      inboxList.innerHTML = '<div class="no-mails"><i class="far fa-envelope-open"></i><br>No messages yet.</div>';
      return;
    }
    messages.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    let html = '';
    messages.forEach(msg => {
      const code = extractCode(msg.intro || msg.text || '');
      const preview = (msg.intro || msg.text || '').substring(0, 100);
      html += `
        <div class="email-item">
          <div class="email-icon"><i class="fas fa-envelope"></i></div>
          <div class="email-content">
            <div class="email-subject">${escapeHtml(msg.subject || '(No Subject)')}</div>
            <div class="email-sender"><i class="fas fa-user-circle"></i> ${escapeHtml(msg.from?.address || 'Unknown')} <span>${new Date(msg.createdAt).toLocaleString()}</span></div>
            <div class="email-body-preview">${escapeHtml(preview)}${code ? `<div class="verification-code" data-code="${escapeHtml(code)}">${escapeHtml(code)} <i class="fas fa-copy"></i></div>` : ''}</div>
          </div>
        </div>
      `;
    });
    inboxList.innerHTML = html;
  }

  inboxList.addEventListener('click', function(e) {
    const codeElement = e.target.closest('.verification-code');
    if (!codeElement) return;
    const code = codeElement.getAttribute('data-code');
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      const originalHtml = codeElement.innerHTML;
      codeElement.innerHTML = 'Copied! <i class="fas fa-check"></i>';
      setTimeout(() => codeElement.innerHTML = originalHtml, 1500);
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      const originalHtml = codeElement.innerHTML;
      codeElement.innerHTML = 'Copied! <i class="fas fa-check"></i>';
      setTimeout(() => codeElement.innerHTML = originalHtml, 1500);
    });
  });

  function extractCode(text) {
    const patterns = [/\b(\d{4,8})\b/, /\b([A-Z0-9]{6,10})\b/i, /verification code[:\s]*([A-Z0-9]+)/i, /code[:\s]*([A-Z0-9]+)/i, /OTP[:\s]*([A-Z0-9]+)/i];
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1] && m[1].length >= 4 && m[1].length <= 12) return m[1];
    }
    return null;
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  copyEmailBtn.addEventListener('click', function() {
    const email = tempEmailDisplay.textContent;
    if (!email || email === 'Generating email...') return;
    navigator.clipboard.writeText(email).then(() => {
      const btn = this;
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => btn.innerHTML = orig, 2000);
    });
  });

  refreshBtn.addEventListener('click', fetchMessages);

  generateNewBtn.addEventListener('click', function() {
    if (isGenerating) return;
    storage.remove('tempmail_account_mailgw');
    storage.remove('tempmail_token_mailgw');
    currentAccount = null; token = null;
    if (refreshInterval) clearInterval(refreshInterval);
    tempEmailDisplay.textContent = 'Generating new email...';
    inboxList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Generating...</div>';
    createNewAccount();
  });

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(fetchMessages, 5000);
  }

  initialize();
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && token) fetchMessages();
  });
});