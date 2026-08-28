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

  // Modal elements
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalSubject = document.getElementById('modalSubject');
  const modalSender = document.getElementById('modalSender');
  const modalBody = document.getElementById('modalBody');

  if (modalOverlay && modalClose) {
    modalClose.addEventListener('click', function() {
      modalOverlay.classList.remove('active');
    });
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });
  }

  // TempMail API (শুধু হোম পেজে)
  const tempEmailDisplay = document.getElementById('tempEmail');
  if (!tempEmailDisplay) return;

  const API_BASE = 'https://api.mail.gw';
  const PROXY_URL = 'https://api.allorigins.win/raw?url=';
  let currentAccount = null;
  let token = null;
  let refreshInterval = null;
  let isGenerating = false;
  let fetchInProgress = false;

  const inboxList = document.getElementById('inboxList');
  const mailCount = document.getElementById('mailCount');
  const copyEmailBtn = document.getElementById('copyEmailBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const generateNewBtn = document.getElementById('generateNewBtn');

  if (!inboxList || !mailCount || !copyEmailBtn || !refreshBtn || !generateNewBtn) return;

  // CORS সমস্যা সমাধানে fetch wrapper
  async function fetchWithProxy(url, options = {}) {
    // প্রথমে সরাসরি চেষ্টা করি
    try {
      const directResponse = await fetch(url, options);
      if (directResponse.ok) return directResponse;
    } catch (directError) {
      // সরাসরি ব্যর্থ হলে proxy ব্যবহার করি
    }
    // Proxy ব্যবহার
    const proxiedUrl = PROXY_URL + encodeURIComponent(url);
    const proxyResponse = await fetch(proxiedUrl, options);
    return proxyResponse;
  }

  let storedAccount = storage.get('tempmail_account_mailgw');
  let storedToken = storage.get('tempmail_token_mailgw');

  async function initialize() {
    if (storedAccount && storedToken) {
      try {
        currentAccount = JSON.parse(storedAccount);
        token = storedToken;
        tempEmailDisplay.textContent = currentAccount.address;
        await fetchMessages();
        startAutoRefresh();
        return;
      } catch (e) {
        console.warn('Stored account invalid, creating new one');
      }
    }
    await createNewAccount();
  }

  async function createNewAccount() {
    if (isGenerating) return;
    isGenerating = true;
    showLoading('Creating new email...');
    try {
      const domainsRes = await fetchWithProxy(`${API_BASE}/domains`);
      if (!domainsRes.ok) throw new Error('Failed to fetch domains');
      const domainsData = await domainsRes.json();
      const domains = domainsData['hydra:member'] || [];
      if (domains.length === 0) throw new Error('No domains available');
      const domain = domains[0].domain;

      const username = 'user_' + Math.random().toString(36).substring(2, 10);
      const password = 'Pass_' + Math.random().toString(36).substring(2, 12);
      const address = `${username}@${domain}`;

      const accountRes = await fetchWithProxy(`${API_BASE}/accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });
      if (!accountRes.ok) throw new Error('Account creation failed');
      const accountData = await accountRes.json();

      const tokenRes = await fetchWithProxy(`${API_BASE}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });
      if (!tokenRes.ok) throw new Error('Token fetch failed');
      const tokenData = await tokenRes.json();
      token = tokenData.token;

      currentAccount = { id: accountData.id, address: accountData.address, createdAt: new Date().toISOString() };
      storage.set('tempmail_account_mailgw', JSON.stringify(currentAccount));
      storage.set('tempmail_token_mailgw', token);

      tempEmailDisplay.textContent = currentAccount.address;
      await fetchMessages();
      startAutoRefresh();
    } catch (error) {
      console.error('Error creating account:', error);
      showError('Failed to create email. Please try again.');
      setTimeout(() => {
        if (!currentAccount) createNewAccount();
      }, 3000);
    } finally {
      isGenerating = false;
    }
  }

  async function fetchMessages() {
    if (fetchInProgress) return;
    if (!token) {
      await createNewAccount();
      return;
    }
    fetchInProgress = true;
    try {
      const res = await fetchWithProxy(`${API_BASE}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        storage.remove('tempmail_account_mailgw');
        storage.remove('tempmail_token_mailgw');
        currentAccount = null;
        token = null;
        await createNewAccount();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      const messages = data['hydra:member'] || [];
      await displayMessages(messages);
    } catch (error) {
      console.error('Fetch messages error:', error);
    } finally {
      fetchInProgress = false;
    }
  }

  function showLoading(message) {
    inboxList.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> ${message}</div>`;
  }

  function showError(message) {
    inboxList.innerHTML = `<div class="no-mails"><i class="fas fa-exclamation-triangle"></i><br>${message}</div>`;
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function enrichText(rawText) {
    let escaped = escapeHtml(rawText);
    let div = document.createElement('div');
    div.innerHTML = escaped;

    function highlightCodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const regex = /\b(\d{4,8}|[A-Z0-9]{6,10})\b/g;
        let match;
        let lastIndex = 0;
        let fragment = document.createDocumentFragment();
        while ((match = regex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
          }
          const span = document.createElement('span');
          span.className = 'clickable-code';
          span.setAttribute('data-code', match[1]);
          span.textContent = match[1];
          fragment.appendChild(span);
          lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        node.parentNode.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(child => highlightCodes(child));
      }
    }

    function linkifyTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        let match;
        let lastIndex = 0;
        let fragment = document.createDocumentFragment();
        while ((match = urlRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
          }
          const a = document.createElement('a');
          a.href = match[1];
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = match[1];
          fragment.appendChild(a);
          lastIndex = urlRegex.lastIndex;
        }
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        node.parentNode.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(child => linkifyTextNodes(child));
      }
    }

    linkifyTextNodes(div);
    highlightCodes(div);

    return div.innerHTML;
  }

  async function displayMessages(messages) {
    mailCount.textContent = messages.length;
    if (messages.length === 0) {
      inboxList.innerHTML = '<div class="no-mails"><i class="fas fa-envelope-open-text"></i></div>';
      return;
    }
    messages.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    let html = '';
    for (const msg of messages) {
      let fullText = msg.intro || msg.text || '';
      try {
        const res = await fetchWithProxy(`${API_BASE}/messages/${msg.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          fullText = data.text || data.intro || fullText;
        }
      } catch(e) {}

      const previewText = fullText.substring(0, 300);
      const enrichedPreview = enrichText(previewText);
      const subject = escapeHtml(msg.subject || '(No Subject)');
      const from = escapeHtml(msg.from?.address || 'Unknown');
      const date = new Date(msg.createdAt).toLocaleString();

      html += `
        <div class="email-item" data-id="${msg.id}" data-full="${encodeURIComponent(fullText)}">
          <div class="email-icon"><i class="fas fa-envelope"></i></div>
          <div class="email-content">
            <div class="email-subject">${subject}</div>
            <div class="email-sender"><i class="fas fa-user-circle"></i> ${from} <span>${date}</span></div>
            <div class="email-body-preview">${enrichedPreview}</div>
            ${fullText.length > 300 ? '<button class="read-more-btn" data-id="'+msg.id+'">Read Full Message</button>' : ''}
          </div>
        </div>
      `;
    }
    inboxList.innerHTML = html;

    document.querySelectorAll('.read-more-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        const msg = messages.find(m => m.id === id);
        if (msg) openModal(msg);
      });
    });

    document.querySelectorAll('.email-item').forEach(item => {
      item.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        const msg = messages.find(m => m.id === id);
        if (msg) openModal(msg);
      });
    });

    inboxList.querySelectorAll('.clickable-code').forEach(codeEl => {
      codeEl.addEventListener('click', function(e) {
        e.stopPropagation();
        const code = this.getAttribute('data-code');
        if (code) copyToClipboard(code, this);
      });
    });
  }

  async function openModal(msg) {
    if (!modalOverlay || !modalSubject || !modalSender || !modalBody) return;
    let fullText = msg.intro || msg.text || '';
    try {
      const res = await fetchWithProxy(`${API_BASE}/messages/${msg.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        fullText = data.text || data.intro || fullText;
      }
    } catch(e) {}

    modalSubject.textContent = msg.subject || '(No Subject)';
    modalSender.innerHTML = `<i class="fas fa-user-circle"></i> ${escapeHtml(msg.from?.address || 'Unknown')} · ${new Date(msg.createdAt).toLocaleString()}`;
    modalBody.innerHTML = enrichText(fullText);
    modalOverlay.classList.add('active');

    modalBody.querySelectorAll('.clickable-code').forEach(codeEl => {
      codeEl.addEventListener('click', function() {
        const code = this.getAttribute('data-code');
        if (code) copyToClipboard(code, this);
      });
    });
  }

  function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
      if (element) {
        const original = element.innerHTML;
        element.innerHTML = 'Copied! <i class="fas fa-check"></i>';
        setTimeout(() => {
          element.innerHTML = original;
        }, 2000);
      }
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      if (element) {
        const original = element.innerHTML;
        element.innerHTML = 'Copied! <i class="fas fa-check"></i>';
        setTimeout(() => {
          element.innerHTML = original;
        }, 2000);
      }
    });
  }

  copyEmailBtn.addEventListener('click', function() {
    const email = tempEmailDisplay.textContent;
    if (!email || email === 'Generating email...') return;
    copyToClipboard(email, this);
  });

  refreshBtn.addEventListener('click', function() {
    fetchMessages();
  });

  generateNewBtn.addEventListener('click', function() {
    if (isGenerating) return;
    storage.remove('tempmail_account_mailgw');
    storage.remove('tempmail_token_mailgw');
    currentAccount = null; token = null;
    if (refreshInterval) clearInterval(refreshInterval);
    tempEmailDisplay.textContent = 'Generating new email...';
    showLoading('Generating new email...');
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