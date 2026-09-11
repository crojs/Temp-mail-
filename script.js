document.addEventListener('DOMContentLoaded', function() {
  // ================= LocalStorage Helper =================
  const storage = {
    available: true,
    get(key) { try { return localStorage.getItem(key); } catch(e) { this.available = false; return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch(e) { this.available = false; } },
    remove(key) { try { localStorage.removeItem(key); } catch(e) { this.available = false; } }
  };

  // ================= Dynamic Year =================
  document.querySelectorAll('#year').forEach(el => el.textContent = new Date().getFullYear());

  // ================= Theme Toggle =================
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

  // ================= Mobile Menu =================
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

  // ================= Modal (Email Details) =================
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalSubject = document.getElementById('modalSubject');
  const modalSender = document.getElementById('modalSender');
  const modalBody = document.getElementById('modalBody');

  if (modalOverlay && modalClose) {
    modalClose.addEventListener('click', function() { modalOverlay.classList.remove('active'); });
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }

  // ================= Temp Mail Engine (using TempMailPortal) =================
  const tempEmailDisplay = document.getElementById('tempEmail');

  if (tempEmailDisplay) {
    const inboxList = document.getElementById('inboxList');
    const mailCount = document.getElementById('mailCount');
    const copyEmailBtn = document.getElementById('copyEmailBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const generateNewBtn = document.getElementById('generateNewBtn');

    if (inboxList && mailCount && copyEmailBtn && refreshBtn && generateNewBtn) {
      // TempMailPortal API - CORS enabled, no proxy needed
      const API_BASE = 'https://api.tempmailportal.com';

      let currentAccount = null; // { address, token }
      let refreshInterval = null;
      let isGenerating = false;
      let fetchInProgress = false;

      const storedAccount = storage.get('tempmail_account_portal');

      async function initialize() {
        if (storedAccount) {
          try {
            currentAccount = JSON.parse(storedAccount);
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
          // Create a new inbox
          const res = await fetch(API_BASE + '/api/inbox', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to create inbox');
          const data = await res.json();

          // Expected: { address: "xxx@domain.com", token: "..." }
          if (!data.address || !data.token) throw new Error('Invalid response from API');

          currentAccount = { address: data.address, token: data.token };
          storage.set('tempmail_account_portal', JSON.stringify(currentAccount));

          tempEmailDisplay.textContent = currentAccount.address;
          await fetchMessages();
          startAutoRefresh();
        } catch (error) {
          console.error('Error creating account:', error);
          showError('Failed to create email. Please try again.');
          setTimeout(function() { if (!currentAccount) createNewAccount(); }, 3000);
        } finally {
          isGenerating = false;
        }
      }

      async function fetchMessages() {
        if (fetchInProgress || !currentAccount) return;
        fetchInProgress = true;
        try {
          const res = await fetch(API_BASE + '/api/messages', {
            headers: { 'Authorization': 'Bearer ' + currentAccount.token }
          });
          if (res.status === 401) {
            // Token expired, create a new account
            storage.remove('tempmail_account_portal');
            currentAccount = null;
            await createNewAccount();
            return;
          }
          if (!res.ok) throw new Error('Failed to fetch messages');
          const messages = await res.json();
          await displayMessages(messages);
        } catch (error) {
          console.error('Fetch messages error:', error);
        } finally {
          fetchInProgress = false;
        }
      }

      function showLoading(message) {
        inboxList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> ' + message + '</div>';
      }

      function showError(message) {
        inboxList.innerHTML = '<div class="no-mails"><i class="fas fa-exclamation-triangle"></i><br>' + message + '</div>';
      }

      function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, function(m) {
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
        });
      }

      function enrichText(rawText) {
        const escaped = escapeHtml(rawText);
        const div = document.createElement('div');
        div.innerHTML = escaped;

        function linkifyTextNodes(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            let match, lastIndex = 0;
            const fragment = document.createDocumentFragment();
            while ((match = urlRegex.exec(text)) !== null) {
              if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
              const a = document.createElement('a');
              a.href = match[1];
              a.target = '_blank';
              a.rel = 'noopener';
              a.textContent = match[1];
              fragment.appendChild(a);
              lastIndex = urlRegex.lastIndex;
            }
            if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            node.parentNode.replaceChild(fragment, node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            Array.from(node.childNodes).forEach(linkifyTextNodes);
          }
        }

        function highlightCodes(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const regex = /\b(\d{4,8}|[A-Z0-9]{6,10})\b/g;
            let match, lastIndex = 0;
            const fragment = document.createDocumentFragment();
            while ((match = regex.exec(text)) !== null) {
              if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
              const span = document.createElement('span');
              span.className = 'clickable-code';
              span.setAttribute('data-code', match[1]);
              span.textContent = match[1];
              fragment.appendChild(span);
              lastIndex = regex.lastIndex;
            }
            if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            node.parentNode.replaceChild(fragment, node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            Array.from(node.childNodes).forEach(highlightCodes);
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

        // TempMailPortal returns messages with id, subject, from, text, etc.
        // We sort by id or a received timestamp if available.
        // For now, assume the API returns messages in chronological order; we reverse it.
        // A more robust sort would use a `receivedAt` field if the API provides one.
        messages.sort(function(a, b) { return (b.id || 0) - (a.id || 0); });

        let html = '';
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const fullText = msg.text || msg.intro || '';
          const previewText = fullText.substring(0, 300);
          const enrichedPreview = enrichText(previewText);
          const subject = escapeHtml(msg.subject || '(No Subject)');
          const from = escapeHtml(msg.from && msg.from.address ? msg.from.address : (msg.from || 'Unknown'));
          const date = msg.date ? new Date(msg.date).toLocaleString() : '';

          html += '<div class="email-item" data-id="' + msg.id + '">' +
            '<div class="email-icon"><i class="fas fa-envelope"></i></div>' +
            '<div class="email-content">' +
              '<div class="email-subject">' + subject + '</div>' +
              '<div class="email-sender"><i class="fas fa-user-circle"></i> ' + from + ' <span>' + date + '</span></div>' +
              '<div class="email-body-preview">' + enrichedPreview + '</div>' +
              (fullText.length > 300 ? '<button class="read-more-btn" data-id="' + msg.id + '">Read Full Message</button>' : '') +
            '</div>' +
          '</div>';
        }
        inboxList.innerHTML = html;

        // Store message data for modal access
        const messageMap = {};
        messages.forEach(function(m) { messageMap[m.id] = m; });

        document.querySelectorAll('.read-more-btn').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = this.getAttribute('data-id');
            const msg = messageMap[id];
            if (msg) openModal(msg);
          });
        });

        document.querySelectorAll('.email-item').forEach(function(item) {
          item.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const msg = messageMap[id];
            if (msg) openModal(msg);
          });
        });

        inboxList.querySelectorAll('.clickable-code').forEach(function(codeEl) {
          codeEl.addEventListener('click', function(e) {
            e.stopPropagation();
            const code = this.getAttribute('data-code');
            if (code) copyToClipboard(code, this);
          });
        });
      }

      async function openModal(msg) {
        if (!modalOverlay || !modalSubject || !modalSender || !modalBody) return;

        // TempMailPortal may have the full text in the message object already.
        // If not, we can fetch the individual message.
        let fullText = msg.text || msg.intro || '';
        if (!fullText || fullText.length < 100) {
          try {
            const res = await fetch(API_BASE + '/api/messages/' + msg.id, {
              headers: { 'Authorization': 'Bearer ' + currentAccount.token }
            });
            if (res.ok) {
              const data = await res.json();
              fullText = data.text || data.intro || fullText;
            }
          } catch (e) {}
        }

        modalSubject.textContent = msg.subject || '(No Subject)';
        const from = msg.from && msg.from.address ? msg.from.address : (msg.from || 'Unknown');
        modalSender.innerHTML = '<i class="fas fa-user-circle"></i> ' + escapeHtml(from) +
          (msg.date ? ' · ' + new Date(msg.date).toLocaleString() : '');
        modalBody.innerHTML = enrichText(fullText);
        modalOverlay.classList.add('active');

        modalBody.querySelectorAll('.clickable-code').forEach(function(codeEl) {
          codeEl.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            if (code) copyToClipboard(code, this);
          });
        });
      }

      function copyToClipboard(text, element) {
        function done() {
          if (element) {
            const original = element.innerHTML;
            element.innerHTML = 'Copied! <i class="fas fa-check"></i>';
            setTimeout(function() { element.innerHTML = original; }, 2000);
          }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function() {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
            done();
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch(e) {}
          document.body.removeChild(ta);
          done();
        }
      }

      copyEmailBtn.addEventListener('click', function() {
        const email = tempEmailDisplay.textContent;
        if (!email || email === 'Generating email...') return;
        copyToClipboard(email, this);
      });

      refreshBtn.addEventListener('click', function() { fetchMessages(); });

      generateNewBtn.addEventListener('click', function() {
        if (isGenerating) return;
        storage.remove('tempmail_account_portal');
        currentAccount = null;
        if (refreshInterval) clearInterval(refreshInterval);
        tempEmailDisplay.textContent = 'Generating new email...';
        showLoading('Generating new email...');
        createNewAccount();
      });

      function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(fetchMessages, 7000);
      }

      initialize();

      document.addEventListener('visibilitychange', function() {
        if (!document.hidden && currentAccount) fetchMessages();
      });
    }
  }
});