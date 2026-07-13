// ---- Supabase Config
    const SUPABASE_URL = 'https://vvdkslzqhqhatcesxwqu.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2ZGtzbHpxaHFoYXRjZXN4d3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDcxMzMsImV4cCI6MjA4NzUyMzEzM30.I4-RwiYNhwUtX6EPyp8U-zQ0Z6Uvk5novSD1I5X-Ge4';
    let supabaseClient = null;
    let githubUser = null;
    let lastSyncedAt = null;

    function getAuthRedirectUrl() {
      return window.location.origin + window.location.pathname;
    }

    function setAuthFeedback(message, tone = 'info') {
      const el = document.getElementById('auth-feedback');
      if (!el) return;
      if (!message) {
        el.classList.add('hidden');
        el.textContent = '';
        el.classList.remove('text-red-400', 'text-emerald-400', 'text-blue-400', 'text-neutral-500');
        return;
      }
      el.classList.remove('hidden');
      el.textContent = message;
      el.classList.remove('text-red-400', 'text-emerald-400', 'text-blue-400', 'text-neutral-500');
      if (tone === 'error') el.classList.add('text-red-400');
      else if (tone === 'success') el.classList.add('text-emerald-400');
      else if (tone === 'info') el.classList.add('text-blue-400');
      else el.classList.add('text-neutral-500');
    }

    function getEmailAuthFormValues() {
      const name = (document.getElementById('auth-name')?.value || '').trim();
      const email = (document.getElementById('auth-email')?.value || '').trim();
      const password = document.getElementById('auth-password')?.value || '';
      return { name, email, password };
    }

    function hashStringToSafeInt(input) {
      const str = String(input || '');
      let h1 = 2166136261;
      let h2 = 5381;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 ^= ch;
        h1 = Math.imul(h1, 16777619);
        h2 = ((h2 << 5) + h2) ^ ch;
      }
      const a = (h1 >>> 0);
      const b = (h2 >>> 0) & 0xffff;
      const combined = (a * 65536) + b;
      return combined || 1;
    }

    function makeChatId() {
      return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    function normalizeChatId(rawId) {
      if (typeof rawId === 'number' && Number.isFinite(rawId)) {
        return Math.trunc(Math.abs(rawId));
      }

      if (typeof rawId === 'string') {
        const trimmed = rawId.trim();
        if (/^\d+$/.test(trimmed)) {
          const num = Number(trimmed);
          if (Number.isFinite(num)) return Math.trunc(Math.abs(num));
        }
        return hashStringToSafeInt(trimmed);
      }

      return makeChatId();
    }

    function normalizeChatsArray(inputChats) {
      const source = Array.isArray(inputChats) ? inputChats : [];
      const seen = new Set();
      return source.map((chat) => {
        const normalizedId = normalizeChatId(chat?.id);
        let finalId = normalizedId;
        while (seen.has(finalId)) finalId += 1;
        seen.add(finalId);
        return {
          ...chat,
          id: finalId,
          messages: Array.isArray(chat?.messages) ? chat.messages : []
        };
      });
    }

    function updateSyncBadge() {
      const el = document.getElementById('sync-badge');
      if (!el) return;
      if (!lastSyncedAt || !githubUser) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const mins = Math.floor((Date.now() - lastSyncedAt) / 60000);
      const span = el.querySelector('span');
      const text = mins < 1 ? 'Son senkronize: az once' : mins === 1 ? 'Son senkronize: 1 dk once' : `Son senkronize: ${mins} dk once`;
      if (span) span.textContent = text;
    }
    setInterval(updateSyncBadge, 30000);

    function initSupabase() {
      if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseClient.auth.onAuthStateChange((event, session) => {
          (() => {
            githubUser = session?.user || null;
            updateGithubAuthUI(githubUser);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
              if (githubUser) loadChatsFromSupabase();
            } else if (event === 'SIGNED_OUT') {
              _loadingChats = false;
              clearChatsFromUI();
              lastSyncedAt = null;
              updateSyncBadge();
            }
          })();
        });
        supabaseClient.auth.getSession().then(({ data }) => {
          githubUser = data?.session?.user || null;
          updateGithubAuthUI(githubUser);
          if (githubUser) loadChatsFromSupabase();
        });
      }
    }

    let _loadingChats = false;
    async function loadChatsFromSupabase() {
      if (!supabaseClient || !githubUser) return;
      if (_loadingChats) return;
      _loadingChats = true;
      const userId = githubUser.id;
      try {
        const { data, error } = await supabaseClient
          .from('chats')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (error) { console.error('Supabase load error:', error); return; }
        if (!githubUser || githubUser.id !== userId) return;
        const remoteChats = normalizeChatsArray((data || []).map(r => ({
          id: r.id,
          title: r.title,
          messages: r.messages || [],
          pinned: r.pinned || false,
          folder: r.folder || undefined,
          canvas: r.canvas || null
        })));

        if (remoteChats.length > 0) {
          chats = remoteChats;
          currentChatId = remoteChats[0].id;
          localStorage.setItem(KEY_CHATS, JSON.stringify(chats));
          renderChatList();
          loadChat(currentChatId);
        } else {
          const localBackup = normalizeChatsArray(JSON.parse(localStorage.getItem(KEY_CHATS) || '[]'));
          if (localBackup.length > 0) {
            chats = localBackup;
            currentChatId = localBackup[0].id;
            renderChatList();
            loadChat(currentChatId);
            await syncChatsToSupabase();
          } else {
            chats = [];
            currentChatId = null;
            localStorage.setItem(KEY_CHATS, '[]');
            renderChatList();
            renderMessages([]);
            showWelcome();
          }
        }
      } finally {
        _loadingChats = false;
      }
    }

    async function syncChatsToSupabase() {
      if (!supabaseClient || !githubUser) return;
      const rows = chats.map(c => ({
        id: normalizeChatId(c.id),
        user_id: githubUser.id,
        title: c.title || '',
        messages: (c.messages || []).filter(m => !(typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__'))),
        pinned: c.pinned || false,
        folder: c.folder || null,
        canvas: c.canvas || null,
        updated_at: new Date().toISOString()
      }));
      if (rows.length === 0) {
        lastSyncedAt = Date.now();
        updateSyncBadge();
        return;
      }
      const { error } = await supabaseClient.from('chats').upsert(rows, { onConflict: 'id' });
      if (error) { console.error('Supabase sync error:', error); return; }
      lastSyncedAt = Date.now();
      updateSyncBadge();
    }

    async function deleteChatFromSupabase(id) {
      if (!supabaseClient || !githubUser) return;
      await supabaseClient.from('chats').delete().eq('id', normalizeChatId(id)).eq('user_id', githubUser.id);
    }

    async function deleteAllChatsFromSupabase() {
      if (!supabaseClient || !githubUser) return;
      await supabaseClient.from('chats').delete().eq('user_id', githubUser.id);
    }

    function clearChatsFromUI() {
      chats = [];
      currentChatId = null;
      if (typeof renderChatList === 'function') renderChatList();
      if (typeof renderMessages === 'function') renderMessages([]);
      if (typeof showWelcome === 'function') showWelcome();
    }

    async function signInWithGoogle() {
      if (!supabaseClient) { alert('Supabase baslatılamadı.'); return; }
      setAuthFeedback('Google yonlendiriliyor...', 'info');
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl(), queryParams: { access_type: 'offline', prompt: 'consent' } }
      });
      if (error) { console.error('Google OAuth error:', error); alert('Giris hatasi: ' + error.message); }
    }

    async function signInWithGithub() {
      if (!supabaseClient) { alert('Supabase baslatılamadı.'); return; }
      setAuthFeedback('GitHub yonlendiriliyor...', 'info');
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: getAuthRedirectUrl() }
      });
      if (error) { console.error('GitHub OAuth error:', error); alert('Giris hatasi: ' + error.message); }
    }

    async function signInWithEmail() {
      if (!supabaseClient) { alert('Supabase baslatılamadı.'); return; }
      const { email, password } = getEmailAuthFormValues();
      if (!email || !password) { setAuthFeedback('E-posta ve sifre zorunludur.', 'error'); return; }

      setAuthFeedback('E-posta ile giris yapiliyor...', 'info');
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Email sign-in error:', error);
        setAuthFeedback('E-posta giris hatasi: ' + error.message, 'error');
        return;
      }
      setAuthFeedback('Giris basarili.', 'success');
    }

    let _otpEmail = '';
    let _otpPassword = '';

    function showOtpPanel(email) {
      _otpEmail = email;
      document.getElementById('github-signin-panel').classList.add('hidden');
      const otpPanel = document.getElementById('otp-verify-panel');
      otpPanel.classList.remove('hidden');
      const display = document.getElementById('otp-email-display');
      if (display) display.textContent = email;
      const digits = document.querySelectorAll('.otp-digit');
      digits.forEach(d => d.value = '');
      if (digits[0]) digits[0].focus();
      const otpContainer = document.getElementById('otp-inputs');
      if (otpContainer && !otpContainer._pasteAttached) {
        otpContainer._pasteAttached = true;
        otpContainer.addEventListener('paste', function (e) {
          e.preventDefault();
          const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          const allDigits = document.querySelectorAll('.otp-digit');
          allDigits.forEach((d, i) => { d.value = pasted[i] || ''; });
          if (pasted.length > 0) allDigits[Math.min(pasted.length, 5)].focus();
          if (pasted.length === 6) verifyEmailOtp();
        });
      }
      setOtpFeedback('');
    }

    function backToSignin() {
      document.getElementById('otp-verify-panel').classList.add('hidden');
      document.getElementById('github-signin-panel').classList.remove('hidden');
      _otpEmail = '';
      _otpPassword = '';
    }

    function setOtpFeedback(msg, type) {
      const el = document.getElementById('otp-feedback');
      if (!el) return;
      if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
      el.classList.remove('hidden');
      el.className = 'text-[10px] px-1 text-center ' + (type === 'error' ? 'text-red-400' : type === 'success' ? 'text-emerald-400' : 'text-neutral-400');
      el.textContent = msg;
    }

    function otpInput(event, input) {
      const val = input.value.replace(/[^0-9]/g, '');
      input.value = val;
      if (val && input.nextElementSibling && input.nextElementSibling.classList.contains('otp-digit')) {
        input.nextElementSibling.focus();
      }
      const digits = document.querySelectorAll('.otp-digit');
      const code = Array.from(digits).map(d => d.value).join('');
      if (code.length === 6) verifyEmailOtp();
    }

    function otpKeydown(event, input) {
      if (event.key === 'Backspace' && !input.value && input.previousElementSibling && input.previousElementSibling.classList.contains('otp-digit')) {
        input.previousElementSibling.focus();
      }
      if (event.key === 'Enter') verifyEmailOtp();
    }

    async function verifyEmailOtp() {
      if (!supabaseClient || !_otpEmail) return;
      const digits = document.querySelectorAll('.otp-digit');
      const code = Array.from(digits).map(d => d.value).join('');
      if (code.length < 6) { setOtpFeedback('6 haneli kodu eksiksiz gir.', 'error'); return; }
      setOtpFeedback('Dogrulaniyor...', 'info');
      const { data, error } = await supabaseClient.auth.verifyOtp({ email: _otpEmail, token: code, type: 'signup' });
      if (error) {
        setOtpFeedback('Kod hatali veya suresi dolmus: ' + error.message, 'error');
        digits.forEach(d => d.value = '');
        if (digits[0]) digits[0].focus();
        return;
      }
      setOtpFeedback('Dogrulama basarili! Giris yapiliyor...', 'success');
      document.getElementById('otp-verify-panel').classList.add('hidden');
    }

    async function resendOtp() {
      if (!supabaseClient || !_otpEmail || !_otpPassword) { setOtpFeedback('Tekrar göndermek için geri dön ve tekrar kayit ol.', 'error'); return; }
      setOtpFeedback('Yeni kod gonderiliyor...', 'info');
      const { error } = await supabaseClient.auth.signUp({ email: _otpEmail, password: _otpPassword });
      if (error) { setOtpFeedback('Gönderilemedi: ' + error.message, 'error'); return; }
      setOtpFeedback('Yeni kod gonderildi. E-postani kontrol et.', 'success');
      const digits = document.querySelectorAll('.otp-digit');
      digits.forEach(d => d.value = '');
      if (digits[0]) digits[0].focus();
    }

    async function signUpWithEmail() {
      if (!supabaseClient) { alert('Supabase baslatılamadı.'); return; }
      const { name, email, password } = getEmailAuthFormValues();
      if (!email || !password) { setAuthFeedback('E-posta ve sifre zorunludur.', 'error'); return; }
      if (password.length < 6) { setAuthFeedback('Sifre en az 6 karakter olmalidir.', 'error'); return; }

      setAuthFeedback('Kayit olusturuluyor...', 'info');
      try {
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: name ? { full_name: name, name } : {} }
        });
        if (signUpError) {
          setAuthFeedback('Kayit hatasi: ' + signUpError.message, 'error');
          return;
        }
        _otpPassword = password;
        if (signUpData?.user && !signUpData.session) {
          setAuthFeedback('');
          showOtpPanel(email);
          return;
        }
        setAuthFeedback('Kayit ve giris basarili.', 'success');
      } catch (err) {
        setAuthFeedback('Kayit hatasi: ' + err.message, 'error');
      }
    }

    async function signOutGithub() {
      if (!supabaseClient) return;
      closeGithubMenu();
      await syncChatsToSupabase();
      await supabaseClient.auth.signOut();
      githubUser = null;
      setAuthFeedback('', 'neutral');
      updateGithubAuthUI(null);
    }

    function updateGithubAuthUI(user) {
      const userPanel = document.getElementById('github-user-panel');
      const signinPanel = document.getElementById('github-signin-panel');
      const headerGithubBtn = document.getElementById('header-github-btn');
      const headerAvatarBtn = document.getElementById('header-avatar-btn');

      if (user) {
        const name = user.user_metadata?.full_name || user.user_metadata?.user_name || user.user_metadata?.name || user.email || '';
        const email = user.email || '';
        const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

        const nameEl = document.getElementById('github-user-name');
        const emailEl = document.getElementById('github-user-email');
        const hmenuName = document.getElementById('hmenu-name');
        const hmenuEmail = document.getElementById('hmenu-email');
        if (nameEl) nameEl.textContent = name;
        if (emailEl) emailEl.textContent = email;
        if (hmenuName) hmenuName.textContent = name;
        if (hmenuEmail) hmenuEmail.textContent = email;

        const avatarImg = document.getElementById('auth-avatar-img');
        const avatarFallback = document.getElementById('auth-avatar-fallback');
        const headerAvatarImg = document.getElementById('header-avatar-img');
        const headerAvatarFallback = document.getElementById('header-avatar-fallback');
        if (avatar) {
          if (avatarImg) { avatarImg.src = avatar; avatarImg.classList.remove('hidden'); }
          if (avatarFallback) avatarFallback.classList.add('hidden');
          if (headerAvatarImg) { headerAvatarImg.src = avatar; headerAvatarImg.classList.remove('hidden'); }
          if (headerAvatarFallback) headerAvatarFallback.classList.add('hidden');
        } else {
          if (avatarImg) avatarImg.classList.add('hidden');
          if (avatarFallback) avatarFallback.classList.remove('hidden');
          if (headerAvatarImg) headerAvatarImg.classList.add('hidden');
          if (headerAvatarFallback) headerAvatarFallback.classList.remove('hidden');
        }

        if (userPanel) userPanel.classList.remove('hidden');
        if (signinPanel) signinPanel.classList.add('hidden');
        if (headerGithubBtn) headerGithubBtn.style.display = 'none';
        if (headerAvatarBtn) headerAvatarBtn.style.display = 'flex';

        const welcomeTitle = document.getElementById('welcome-title');
        if (welcomeTitle) {
          const firstName = (name || '').split(' ')[0];
          welcomeTitle.textContent = firstName ? `Merhaba, ${firstName}!` : 'Merhaba!';
        }
      } else {
        if (userPanel) userPanel.classList.add('hidden');
        if (signinPanel) signinPanel.classList.remove('hidden');
        if (headerGithubBtn) headerGithubBtn.style.display = 'flex';
        if (headerAvatarBtn) headerAvatarBtn.style.display = 'none';

        const welcomeTitle = document.getElementById('welcome-title');
        if (welcomeTitle) welcomeTitle.textContent = 'Nasil yardimci olabilirim?';
      }
    }

    function toggleGithubMenu() {
      const menu = document.getElementById('header-github-menu');
      if (menu) menu.classList.toggle('hidden');
    }

    function closeGithubMenu() {
      const menu = document.getElementById('header-github-menu');
      if (menu) menu.classList.add('hidden');
    }

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('header-github-menu');
      const avatarBtn = document.getElementById('header-avatar-btn');
      if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !avatarBtn?.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // ---- State
    const KEY_CHATS = 'p_chats_v11';
    const KEY_PROVIDERS = 'p_providers_v11';
    const KEY_PREFS = 'prefs_v11';
    const KEY_STYLE = 'style_v11';
    const KEY_CANVAS_STATE = 'canvas_state_v1';

    const PRECONFIGURED_PROVIDERS = {
      "google": "https://generativelanguage.googleapis.com/v1beta/openai",
      "claude": "https://api.anthropic.com/v1",
      "chatgpt": "https://api.openai.com/v1",
      "kimi": "https://api.moonshot.cn/v1",
      "deepseek": "https://api.deepseek.com",
      "openrouter": "https://openrouter.ai/api/v1",
      "z.ai": "https://api.zeroone.ai/v1",
      "minimax": "https://api.minimax.chat/v1",
      "gemini-local": "http://localhost:8080/v1",
      "codex-local": "http://localhost:3000/v1"
    }

      ;

    const IMAGE_MODELS = [
      'gemini-2.5-flash-image-preview',
      'gpt-image-1.5',
      'gpt-image-1',
      'gpt-image-1-mini',
      'dall-e-3',
      'dall-e-2',
      'ByteDance-Seed/Seedream-3.0',
      'ByteDance-Seed/Seedream-4.0',
      'HiDream-ai/HiDream-I1-Dev',
      'HiDream-ai/HiDream-I1-Fast',
      'HiDream-ai/HiDream-I1-Full',
      'Lykon/DreamShaper',
      'Qwen/Qwen-Image',
      'RunDiffusion/Juggernaut-pro-flux',
      'Rundiffusion/Juggernaut-Lightning-Flux',
      'black-forest-labs/FLUX.1-Canny-pro',
      'black-forest-labs/FLUX.1-dev',
      'black-forest-labs/FLUX.1-dev-lora',
      'black-forest-labs/FLUX.1-kontext-dev',
      'black-forest-labs/FLUX.1-kontext-max',
      'black-forest-labs/FLUX.1-kontext-pro',
      'black-forest-labs/FLUX.1-krea-dev',
      'black-forest-labs/FLUX.1-pro',
      'black-forest-labs/FLUX.1-schnell',
      'black-forest-labs/FLUX.1-schnell-Free',
      'black-forest-labs/FLUX.1.1-pro',
      'google/flash-image-2.5',
      'google/imagen-4.0-fast',
      'google/imagen-4.0-preview',
      'google/imagen-4.0-ultra',
      'ideogram/ideogram-3.0',
      'stabilityai/stable-diffusion-3-medium',
      'stabilityai/stable-diffusion-xl-base-1.0',
      'openrouter:google/gemini-3.1-flash-image-preview',
      'openrouter:google/gemini-3-pro-image-preview'
    ];

    const VIDEO_MODELS = ['sora-2',
      'sora-2-pro',
      'luma-dream-machine',
      'runway-gen-3',
      'kling-1.5',
      'pika-2.0',
      'stable-video-diffusion',
      'cogvideo-5b',
      'haiper-video-v2'
    ];

    let chats = normalizeChatsArray(JSON.parse(localStorage.getItem(KEY_CHATS) || '[]'));
    let currentChatId = null;

    let providerSettings = JSON.parse(localStorage.getItem(KEY_PROVIDERS) || JSON.stringify({

      active: 'puter',
      authMode: 'local',
      custom: {
        token: '', baseUrl: '', modelId: ''
      }

      ,
      anthropic: {
        token: '', baseUrl: 'http://localhost:8080', modelId: 'claude-3-5-sonnet-20241022'
      }
    }));

    if (!providerSettings.anthropic) providerSettings.anthropic = {
      token: '', baseUrl: 'http://localhost:8080', modelId: 'claude-3-5-sonnet-20241022'
    }

      ;

    if (!providerSettings.custom) providerSettings.custom = {
      token: '', baseUrl: '', modelId: ''
    }

      ;

    // Migrate: if old active provider was removed, default to puter
    if (['copilot', 'hf', 'g4f'].includes(providerSettings.active)) {
      providerSettings.active = 'puter';
    }

    let prefs = JSON.parse(localStorage.getItem(KEY_PREFS) || '{"modelA":"gpt-4o-mini","stream":true,"maxTokens":4096,"fontSize":"md","accent":"blue","notifySound":false,"showThinking":true}');
    // Migrate: ensure showThinking exists in saved prefs
    if (prefs.showThinking === undefined) prefs.showThinking = true;
    let _noCanvas = false;
    let _pptxMode = false;
    let stylePrefs = JSON.parse(localStorage.getItem(KEY_STYLE) || '{"short":true,"noLecture":true,"turkish":true,"custom":"","voiceStyle":"samimi"}');
    let availableModels = [];
    let customModels = [];
    let puterReady = false;
    let selectedFiles = [];
    let currentAbortController = null;
    let isGenerating = false;
    let compareActive = false;
    let compareMessagesA = [];
    let compareMessagesB = [];
    let memory = JSON.parse(localStorage.getItem('ai_memory') || '{}');
    let bookmarks = JSON.parse(localStorage.getItem('ai_bookmarks') || '[]');
    let canvasTerminal = null;
    let canvasTerminalFit = null;
    let lastCanvasPreviewSrcdoc = '';

    const PROMPT_TEMPLATES = [{
      icon: '🌐', title: 'Ceviri', color: 'text-cyan-400', prompt: 'Su metni Ingilizceye cevir: '
    }

      ,
    {
      icon: '📝', title: 'Ozet Cikar', color: 'text-blue-400', prompt: 'Su metni ozetle: '
    }

      ,
    {
      icon: '🔍', title: 'Kod Review', color: 'text-green-400', prompt: 'Su kodu incele, hatalari ve iyilestirme noktalarini bul: '
    }

      ,
    {
      icon: '🐛', title: 'Bug Fix', color: 'text-red-400', prompt: 'Bu koddaki hatayi bul ve duzelt: '
    }

      ,
    {
      icon: '📧', title: 'Email Yaz', color: 'text-purple-400', prompt: 'Profesyonel bir email yaz. Konu: '
    }

      ,
    {
      icon: '📊', title: 'Analiz', color: 'text-amber-400', prompt: 'Detayli bir analiz yap. Konu: '
    }

      ,
    {
      icon: '🎨', title: 'UI/UX', color: 'text-pink-400', prompt: 'Modern bir arayuz tasarla (HTML/Tailwind): '
    }

      ,
    {
      icon: '📚', title: 'Acikla', color: 'text-indigo-400', prompt: 'Su konuyu basit ve anlasilir sekilde acikla: '
    }

      ,
    {
      icon: '🧪', title: 'Test Yaz', color: 'text-teal-400', prompt: 'Su kod icin unit test yaz: '
    }

      ,
    {
      icon: '⚡', title: 'Optimize Et', color: 'text-yellow-400', prompt: 'Su kodu performans acisindan optimize et: '
    }

      ,
    {
      icon: '🔒', title: 'Guvenlik', color: 'text-rose-400', prompt: 'Su koddaki guvenlik acikliklaarini bul: '
    }

      ,
    {
      icon: '📋', title: 'Liste Olustur', color: 'text-emerald-400', prompt: 'Su konu hakkinda detayli bir liste olustur: '
    }

      ,
    ];

    const PERSONAS = [
      { icon: '👨‍💻', title: 'Senior Developer', prompt: 'Sen cok tecrubeli bir Senior Software Engineer\'sin. Yazdigin kodlar her zaman best-practice\'lere uygun, optimize edilmis ve temizdir. Kod verirken her zaman tam ve calisan hallerini ver. Daima TypeScript, SOLID prensipler ve Clean Code kullan.' },
      { icon: '🎨', title: 'UI/UX Tasarimcisi', prompt: 'Sen dunyaca taninmis bir UI/UX tasarimcisin. Her tasarimda kullanici deneyimini, erisilebilirligi ve gorsel hiyerarsiyi on plana cikarsin. Figma, design systems ve modern web standartlarinda uzmansin. Onerilerini her zaman kullanici perspektifinden ver.' },
      { icon: '🇬🇧', title: 'Ingilizce Ogretmeni', prompt: 'Sen native seviyesinde bir Ingilizce ogretmenisin. Kullaniciya sadece istedigi ceviri veya gramer kuralini vermekle kalma, ayni zamanda kelimenin etimolojisini, kolokasyonlarini ve dogal ornek cumlelerini de ver. Aciklamalarini B2/C1 seviyesinde yap.' },
      { icon: '✍️', title: 'Metin Yazari (Copywriter)', prompt: 'Sen dahi bir reklam ve metin yazarisin. Urettigin metinler ikna edici, akici ve dikkat cekicidir. AIDA ve PAS formulleri kullanarak hedef kitleyi harekete geciren icerikler olusturursun. Slogan, e-posta, sosyal medya ve landing page metinlerinde uzmansin.' },
      { icon: '🕵️', title: 'Siber Guvenlik Uzmani', prompt: 'Sen siber guvenlik ve penetrasyon testi uzmanisin. Inceledigin her sistemde guvenlik aciklari (OWASP Top 10: SQLi, XSS, CSRF, IDOR vb.) arar ve en guvenli mimarileri onerirsin. CVE\'leri takip eder, tehdit modellemesi yapabilirsin.' },
      { icon: '🧑‍🏫', title: 'Universite Profesoru', prompt: 'Sen akademik duzeyde bilgili, multidisipliner bir profesorsun. Aciklamalarin yuzeyel degil, derinlemesine, bilimsel temellere dayanan ve gerektiginde kaynak gosteren nitelikte olmali. Karmasik kavramlari basit analojilerle de anlatirsın.' },
      { icon: '💡', title: 'Urun Yoneticisi (PM)', prompt: 'Sen tecrubeli bir Product Manager ve startup mentoru\'sun. Fikirleri is modeline, kullanici deneyimine ve pazara sunma stratejisine (GTM) donusturmekte uzmansin. OKR, user story, roadmap ve A/B test konularinda rehberlik edersin.' },
      { icon: '📊', title: 'Veri Bilimcisi', prompt: 'Sen ileri seviye bir veri bilimcisi ve makine ogrenmesi uzmanisın. Pandas, sklearn, PyTorch, SQL ve istatistiksel analiz konularinda uzmansin. Verileri analiz ederken net icgoru ve gorsellestirilmis aciklamalar sunarsin.' },
      { icon: '💰', title: 'Finansal Analist', prompt: 'Sen Wall Street deneyimli bir finansal analist ve yatirim danismanisın. Borsalar, degerleme yontemleri (DCF, P/E, EV/EBITDA), makroekonomik gostergeler ve portfoy yonetimi konularinda uzmansin. Tavsiyelerin her zaman risk/odul dengesi gozeterek verilmeli.' },
      { icon: '⚖️', title: 'Hukuk Danismani', prompt: 'Sen deneyimli bir hukuk danismanisin. Sozlesmeler, ticaret hukuku, fikri mulkiyet ve KVKK/GDPR gibi konularda rehberlik edersin. Cevaplarini anlasilir bir dille ver; teknik hukuki jargonu gerektiginde acikla. Her zaman profesyonel bir avukana danismalarini da hatırlat.' },
      { icon: '🚀', title: 'Girisimci Mentor', prompt: 'Sen basarili seriyel girisimci ve hizlandirici mentoru\'sun. Pitch deck hazirlamak, yatirimci bulmak, MVP gelistirmek, burn rate hesaplamak ve urun-pazar uyumu saglamak konularinda somut tavsiyeler verirsin. Gercekci ve aksiyon odaklisin.' },
      { icon: '🧠', title: 'Psikoloji Uzmani', prompt: 'Sen klinik psikolog ve bilissel davranisci terapi (BDT) uzmanisın. Kullanicinin duygusal durumunu empatik ve yargi koymadan dinlersin. Pratik bas etme stratejileri, mindfulness teknikleri ve oz farkindalik egzersizleri onerirsin. Her zaman gerektiginde profesyonel destek almalarini tavsiye et.' },
      { icon: '🏋️', title: 'Fitness & Yasam Kocu', prompt: 'Sen sertifikali kisisel antrenor ve yasam kocusun. Kisi ozelinde antrenman programlari, beslenme planlari ve uyku optimizasyonu konularinda veri odakli oneriler verirsin. Motivasyon, hedef belirleme ve aliskanlik olusturma konularinda da rehberlik edersin.' },
      { icon: '🎮', title: 'Oyun Gelistirici', prompt: 'Sen deneyimli bir oyun gelistiricisin. Unity, Unreal Engine, Godot ve web tabanli oyun gelistirme (Phaser, Three.js) konularinda uzmansin. Oyun tasarim kaliplari, performans optimizasyonu, level design ve monetizasyon stratejileri konularinda somut oneriler verirsin.' }
    ];

    // ---- Utils
    function debounce(fn, ms) {
      let t;

      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      }

        ;
    }

    function throttle(fn, ms) {
      let lock;

      return (...a) => {
        if (!lock) {
          fn(...a);
          lock = true;
          setTimeout(() => lock = false, ms);
        }
      }

        ;
    }

    const $ = (id) => document.getElementById(id);

    const setStatus = (t) => {
      if ($('status')) $('status').textContent = t;
    }

      ;

    const hideWelcome = () => {
      if ($('welcome-msg')) $('welcome-msg').style.display = 'none';
    }

      ;

    const showWelcome = () => {
      if ($('welcome-msg')) $('welcome-msg').style.display = 'flex';
    }

      ;
    const throttledRenderMessages = throttle((msgs) => renderMessages(msgs), 100);

    function saveAll() {
      debouncedSaveAll();
    }

    function _realSaveAll() {
      const chatsToSave = chats.map(c => ({
        ...c,
        messages: (c.messages || []).filter(m => !(typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__')))
      }));
      localStorage.setItem(KEY_CHATS, JSON.stringify(chatsToSave));
      localStorage.setItem(KEY_PROVIDERS, JSON.stringify(providerSettings));
      localStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
      localStorage.setItem(KEY_STYLE, JSON.stringify(stylePrefs));
      if (githubUser) syncChatsToSupabase();
    }

    const debouncedSaveAll = debounce(() => _realSaveAll(), 500);

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }

    function escapeJs(s) {
      return String(s).replace(/'/g, "\\'").replace(/\n/g, "\\n");
    }

    function sanitizeHtml(html) {
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      template.content.querySelectorAll('script, iframe, object, embed, link, meta, base, form, style').forEach(el => el.remove());
      template.content.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          const value = String(attr.value || '');
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            return;
          }
          if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction') && /^\s*javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
            return;
          }
          if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
          }
        });
      });
      return template.innerHTML;
    }

    function renderMarkdownHtml(content) {
      let html = String(content || '');
      if (typeof marked !== 'undefined') {
        try {
          html = marked.parse(html);
        }

        catch (e) {
          html = escapeHtml(html).replace(/\n/g, '<br>');
        }
      }

      else {
        html = escapeHtml(html).replace(/\n/g, '<br>');
      }
      return sanitizeHtml(html);
    }


    // ---- Response Format
    let activeFormat = null;
    const FORMAT_INSTRUCTIONS = {
      bullets: 'Cevabini madde madde, liste seklinde ver.',
      summary: 'Cevabini cok kisaca ve ozet olarak ver. Gereksiz detay ekleme.',
      detailed: 'Cevabini detayli, kapsamli ve aciklamali ver.'
    };

    function toggleFormat(fmt) {
      activeFormat = activeFormat === fmt ? null : fmt;
      document.querySelectorAll('.fmt-btn').forEach(btn => {
        const on = btn.dataset.fmt === activeFormat;
        btn.classList.toggle('active', on);
      });
    }

    // ---- System Prompt
    function buildSystemPrompt() {
      const r = [];
      if (stylePrefs.turkish) r.push("Turkce cevap ver.");
      if (stylePrefs.short) r.push("Kisa ve direkt cevap ver.");
      if (stylePrefs.noLecture) r.push("Kullanici kod istiyorsa sadece kodu ver, uzun aciklamalar yapma.");
      r.push("Kod verirken ```kod_dili``` formatini kullan.");
      const vs = stylePrefs.voiceStyle || 'samimi';
      if (vs === 'samimi') r.push("Samimi, sicak ve dogal bir dille yaz. Resmi olmayan ama saygi cercevesinde bir ton kullan.");
      if (vs === 'profesyonel') r.push("Profesyonel, net ve guvende veren bir dil kullan. Duzgunce yapi kurulmus, odakli cevaplar ver.");
      if (vs === 'zkusagi') r.push("Gen Z / Z kusagi gibi yaz: rahat, eglenceli, guncel slang kullan. Mesela 'ya', 'be', 'bro', 'literally', 'no cap', 'fr', 'slay' gibi. Ama anlasılır kal.");
      if (stylePrefs.custom && stylePrefs.custom.trim()) r.push(stylePrefs.custom.trim());
      if (activeFormat && FORMAT_INSTRUCTIONS[activeFormat]) r.push(FORMAT_INSTRUCTIONS[activeFormat]);
      const memCtx = buildMemoryContext();
      if (memCtx) r.push(memCtx);
      return r.join(" ");
    }

    // ---- Theme
    function toggleTheme() {
      const isLight = document.body.classList.toggle('light-mode');
      const icon = $('theme-icon');

      if (isLight) {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        document.body.style.backgroundColor = '#ffffff';
      }

      else {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        document.body.style.backgroundColor = '';
      }

      // Update gradient overlay for input area
      const inputGradient = document.querySelector('.absolute.bottom-0 .bg-gradient-to-t, [class*="from-"]');

      if (inputGradient) {
        const parent = document.querySelector('.absolute.bottom-0');
        if (parent) parent.style.background = isLight ? 'linear-gradient(to top, #ffffff, rgba(255,255,255,0.95), transparent)' : '';
      }

      // Update model selector bg
      const modelSel = document.querySelector('.top-header [class*="bg-[#1a1a1a]"]');

      if (modelSel) {
        modelSel.style.background = isLight ? '#f0f0f0' : '';
        modelSel.style.borderColor = isLight ? '#ddd' : '';
      }

      localStorage.setItem('theme_mode', isLight ? 'light' : 'dark');
    }

    function applyAutoTheme() {
      if (!prefs.autoTheme) return;
      const hour = new Date().getHours();
      const wantLight = (hour >= 7 && hour < 20);
      const isLight = document.body.classList.contains('light-mode');
      if (wantLight !== isLight) toggleTheme();
    }

    // ---- Search
    function searchChats() {
      renderChatList($('search-input').value.toLowerCase());
    }

    // ---- Speech
    let recognition = null;
    let voiceConvMode = false;

    function setVoiceOverlayState(state) {
      const overlay = $('voice-overlay');
      const label = $('voice-overlay-label');
      if (!overlay) return;
      overlay.classList.remove('voice-overlay-state-listening', 'voice-overlay-state-speaking', 'voice-overlay-state-thinking');
      if (state === 'listening') {
        overlay.classList.add('voice-overlay-state-listening');
        if (label) label.textContent = 'Dinleniyor...';
      } else if (state === 'speaking') {
        overlay.classList.add('voice-overlay-state-speaking');
        if (label) label.textContent = 'Yapay Zeka Konusuyor';
      } else if (state === 'thinking') {
        if (label) label.textContent = 'Yanit Hazirlaniyor...';
      } else {
        if (label) label.textContent = 'Sesli Asistan Aktif';
      }
    }

    function toggleVoiceConv() {
      voiceConvMode = !voiceConvMode;
      const btn = $('voice-conv-btn');
      const overlay = $('voice-overlay');
      if (voiceConvMode) {
        btn.classList.add('vc-active');
        btn.classList.remove('text-neutral-500');
        if (overlay) overlay.classList.add('visible');
        setVoiceOverlayState('listening');
        setStatus('Sesli konusma modu aktif - Konusmaya baslayin');
        try { recognition && recognition.start(); } catch (e) { }
      } else {
        btn.classList.remove('vc-active');
        btn.classList.add('text-neutral-500');
        if (overlay) overlay.classList.remove('visible');
        setStatus('Sesli konusma modu kapandi');
        if (currentUtterance) { speechSynthesis.cancel(); currentUtterance = null; }
        try { recognition && recognition.stop(); } catch (e) { }
        const interim = $('voice-interim');
        if (interim) interim.textContent = '';
      }
    }

    function initSpeech() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        $('mic-btn').style.display = 'none';
        const vcBtn = $('voice-conv-btn');
        if (vcBtn) {
          vcBtn.style.opacity = '0.4';
          vcBtn.onclick = () => setStatus('Tarayiciniz ses tanima desteklemiyor. Chrome veya Edge kullanin.');
        }
        return;
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = stylePrefs.turkish ? 'tr-TR' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        $('mic-btn').classList.add('text-red-500');
        if (voiceConvMode) {
          $('voice-conv-btn').classList.add('vc-listening');
          setVoiceOverlayState('listening');
        }
        setStatus('Dinleniyor...');
      }

      recognition.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        const interimEl = $('voice-interim');
        if (interimEl && voiceConvMode) {
          interimEl.textContent = interim || final || '';
        }
        if (final) {
          const inp = $('user-input');
          inp.value += (inp.value ? ' ' : '') + final;
          inp.dispatchEvent(new Event('input'));
          if (interimEl) interimEl.textContent = '';
          if (voiceConvMode && final.trim()) {
            setVoiceOverlayState('thinking');
            setTimeout(() => handleSend(), 300);
          }
        }
      }

      recognition.onerror = (e) => {
        if (e.error === 'no-speech' && voiceConvMode) {
          try { recognition.start(); } catch (err) { }
          return;
        }
        setStatus('Ses hatasi: ' + e.error);
        $('voice-conv-btn').classList.remove('vc-listening');
      }

      recognition.onend = () => {
        $('mic-btn').classList.remove('text-red-500');
        $('voice-conv-btn').classList.remove('vc-listening');
        if (voiceConvMode && !speechSynthesis.speaking && !isGenerating) {
          setTimeout(() => { try { recognition.start(); } catch (e) { } }, 300);
        }
      }

      $('mic-btn').onclick = () => {
        try {
          recognition.start();
        }
        catch (e) {
          if (e.name === 'InvalidStateError') recognition.stop();
        }
      }

      $('voice-conv-btn').onclick = toggleVoiceConv;
    }
    // ---- Puter Auth - Mobil WebView Redirect Yaklaşımı ----
    // Popup ve iframe WebView'de çalışmıyor, bu yüzden tüm sayfayı puter.com'a yönlendiriyoruz.
    // Kullanıcı puter.com'da giriş yapıp geri tuşuyla app'e döndüğünde SDK auth durumunu otomatik algılar.

    function openPuterAuthModal() {
      // Dönüş için flag kaydet
      localStorage.setItem('_puter_auth_pending', '1');
      // Tüm sayfayı puter.com'a yönlendir
      window.location.href = 'https://puter.com';
    }

    // Kullanıcı puter.com'dan geri döndüğünde auth kontrolü
    function checkPuterAuthReturn() {
      const pending = localStorage.getItem('_puter_auth_pending');
      if (pending) {
        localStorage.removeItem('_puter_auth_pending');
        // Kısa bir gecikme ile auth kontrolü yap
        setTimeout(() => {
          try {
            if (typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn()) {
              setStatus('Puter giriş başarılı!');
              let loginBtn = document.getElementById('login-btn');
              if (loginBtn) loginBtn.style.display = 'none';
            } else {
              setStatus('Puter girişi tamamlanmadı. Tekrar deneyin.');
            }
          } catch (e) {
            console.error('Puter auth return check error:', e);
          }
        }, 2000);
      }
    }

    // Sayfa tekrar görünür olduğunda auth kontrolü (uygulamaya geri dönüldüğünde)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          try {
            if (typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn()) {
              let loginBtn = document.getElementById('login-btn');
              if (loginBtn && loginBtn.style.display !== 'none') {
                loginBtn.style.display = 'none';
                setStatus('Puter giriş başarılı!');
              }
            }
          } catch (e) { }
        }, 1500);
      }
    });

    // ---- Boot
    async function boot() {
      initSupabase();
      checkPuterAuthReturn(); // Puter.com'dan geri dönüş kontrolü
      setStatus('Baslatiliyor...');
      loadSavedPrompts();
      initSpeech();
      initDragDrop();
      initKeyboardShortcuts();
      initClipboardPaste();
      initSelectionMenu();
      if (prefs.fontSize) setFontSize(prefs.fontSize);
      if (prefs.accent && prefs.accent !== 'blue') setAccent(prefs.accent);
      else updateAccentButtons('blue');
      if (!prefs.showThinking) document.body.classList.add('hide-thinking');

      if (typeof marked !== 'undefined') {
        marked.setOptions({
          highlight: function (code, lang) {
            if (typeof hljs !== 'undefined' && lang) {
              try {
                return hljs.highlight(code, {
                  language: lang
                }).value;
              }

              catch (e) { }
            }

            return code;
          }

          ,
          breaks: true, gfm: true
        });
      }

      if (prefs.autoTheme) { applyAutoTheme(); }
      else if (localStorage.getItem('theme_mode') === 'light') toggleTheme();
      loadSharedChat();

      if (providerSettings.authMode === 'puter') {
        if (!puter.auth.isSignedIn()) {
          setStatus('Puter ile giriş yapmanız gerekiyor.');
          let loginBtn = document.getElementById('login-btn');
          if (loginBtn) {
            loginBtn.style.display = 'flex';
            loginBtn.onclick = () => openPuterAuthModal();
          }
        } else {
          let loginBtn = document.getElementById('login-btn');
          if (loginBtn) loginBtn.style.display = 'none';
        }
      }

      try {
        const modelPromise = (typeof puter !== 'undefined' && puter.ai) ? puter.ai.listModels() : Promise.reject('puter not loaded');
        const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej('timeout'), 8000));
        availableModels = await Promise.race([modelPromise, timeoutPromise]);

        if (!availableModels || availableModels.length === 0) {
          availableModels = [{
            id: 'gpt-4o-mini', name: 'GPT-4o Mini'
          }

            , {
            id: 'gpt-4o', name: 'GPT-4o'
          }

            , {
            id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet'
          }

          ];
        }

        puterReady = true;
        setStatus('Puter.ai hazir.');
      }

      catch (e) {
        availableModels = [{
          id: 'gpt-4o-mini', name: 'GPT-4o Mini'
        }

          , {
          id: 'gpt-4o', name: 'GPT-4o'
        }

        ];
        puterReady = true;
        setStatus('Puter baglanti hatasi (Fallback).');

        // Retry loading models in background after 3s
        setTimeout(async () => {
          try {
            if (typeof puter !== 'undefined' && puter.ai) {
              const models = await puter.ai.listModels();

              if (models && models.length > 0) {
                availableModels = models; await refreshModelDropdowns(); setStatus('Puter.ai hazir.');
              }
            }
          }

          catch (e2) { }
        }

          , 3000);
      }

      await refreshModelDropdowns();
      renderChatList();
      if (chats.length > 0) loadChat(chats[chats.length - 1].id);
      else showWelcome();

      // Restore canvas panel state after page refresh
      try {
        const savedCanvasState = JSON.parse(localStorage.getItem(KEY_CANVAS_STATE) || 'null');
        if (savedCanvasState && savedCanvasState.open && Object.keys(canvasFiles).length > 0) {
          openCanvas();
          renderCanvasFileTree();
          const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
          if (htmlFile) { selectCanvasFile(htmlFile); updateCanvasPreview(canvasFiles[htmlFile]); switchCanvasTab('preview'); }
          else if (canvasActiveFile) selectCanvasFile(canvasActiveFile);
        }
      } catch (_) { }

      // Save canvas data before page unloads
      window.addEventListener('beforeunload', () => {
        const curChat = chats.find(x => x.id === currentChatId);
        if (curChat && Object.keys(canvasFiles).length > 0) {
          curChat.canvas = JSON.parse(JSON.stringify(canvasFiles));
          const chatsToSave = chats.map(c => ({
            ...c,
            messages: (c.messages || []).filter(m => !(typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__')))
          }));
          localStorage.setItem(KEY_CHATS, JSON.stringify(chatsToSave));
          if (canvasOpen) {
            localStorage.setItem(KEY_CANVAS_STATE, JSON.stringify({ open: true, chatId: currentChatId }));
          }
        }
      });

      $('menu-btn')?.addEventListener('click', toggleMobileSidebar);
      $('close-sidebar-btn')?.addEventListener('click', toggleMobileSidebar);
      $('sidebar-overlay')?.addEventListener('click', toggleMobileSidebar);

      // ---- Adaptive Viewport System ----
      initAdaptiveViewport();
    }

    function toggleMobileSidebar() {
      const s = $('sidebar'), o = $('sidebar-overlay');

      if (s.classList.contains('mobile-open')) {
        s.classList.remove('mobile-open'); o.classList.add('hidden');
      }

      else {
        s.classList.add('mobile-open'); o.classList.remove('hidden');
      }
    }

    // ---- Adaptive Viewport System ----
    function initAdaptiveViewport() {

      // 1) Set --vh custom property for accurate mobile viewport height
      function setVH() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', vh + 'px');
        document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
      }

      setVH();
      window.addEventListener('resize', setVH);

      // 2) Use VisualViewport API for keyboard handling (iOS/Android)
      if (window.visualViewport) {
        let lastVPHeight = window.visualViewport.height;
        const inputArea = document.querySelector('.absolute.bottom-0');
        const chatWindow = $('chat-window');

        function onViewportResize() {
          const vp = window.visualViewport;
          const keyboardOpen = vp.height < window.innerHeight * 0.75;
          const offset = window.innerHeight - vp.height;

          if (inputArea) {
            if (keyboardOpen) {
              inputArea.style.transform = `translateY(-${offset - vp.offsetTop
                }

                px)`;

              // Scroll chat to bottom when keyboard opens
              if (chatWindow) {
                requestAnimationFrame(() => chatWindow.scrollTop = chatWindow.scrollHeight);
              }
            }

            else {
              inputArea.style.transform = '';
            }
          }

          lastVPHeight = vp.height;
        }

        window.visualViewport.addEventListener('resize', onViewportResize);
        window.visualViewport.addEventListener('scroll', onViewportResize);
      }

      // 3) Orientation change handler
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          setVH();
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }

          , 200);
      });

      // 4) Prevent bounce scrolling on iOS
      document.body.addEventListener('touchmove', function (e) {
        if (e.target.closest('#chat-window, #sidebar, .canvas-body, .compare-live-body, .modal-scroll, [class*="overflow-y-auto"]')) return;
        if (e.target.closest('.input-box')) return;
        e.preventDefault();
      }

        , {
          passive: false
        });

      // 5) Log screen dimensions for debugging (can be removed later)
      if (window.innerWidth <= 768) {
        console.log('[AdaptiveViewport]', {
          innerW: window.innerWidth,
          innerH: window.innerHeight,
          screenW: screen.width,
          screenH: screen.height,
          dpr: window.devicePixelRatio,
          orientation: screen.orientation?.type || 'unknown'
        });
      }
    }

    async function refreshModelDropdowns() {
      const sel = $('model-a');
      if (!sel) return;
      sel.innerHTML = '<option disabled selected>Yukleniyor...</option>';
      let oldA = prefs.modelA || 'gpt-4o-mini';
      if (oldA === 'open_provider') oldA = 'gpt-4o-mini';
      const prov = providerSettings.active || 'puter';
      let html = '';

      if (prov === 'puter') {
        html += (availableModels.length > 0 ? availableModels : [{
          id: 'gpt-4o-mini'
        }

        ]).map(m => `<option value="${escapeHtml(m.id)}" >${escapeHtml(m.name || m.id)
          }

          </option>`).join('');
        html += '<option disabled>──────────</option><option disabled>GORSEL MODELLERI</option>';

        html += IMAGE_MODELS.map(m => `<option value="${escapeHtml(m)}" >${escapeHtml(m)
          }

          </option>`).join('');
        html += '<option disabled>──────────</option><option disabled>VIDEO MODELLERI</option>';

        html += VIDEO_MODELS.map(m => `<option value="${escapeHtml(m)}" >${escapeHtml(m)
          }

          </option>`).join('');
      }

      else if (prov === 'custom') {
        if (customModels.length === 0 && providerSettings.custom?.baseUrl) await fetchCustomModels();
        let optionsHtml = '';
        const savedId = providerSettings.custom?.modelId || 'gpt-4o';

        let modelsToRender = [...customModels];

        if (savedId && !modelsToRender.some(m => m.id === savedId)) {
          modelsToRender.unshift({
            id: savedId, name: savedId + ' (Manuel)'
          });
        }

        if (modelsToRender.length > 0) {
          optionsHtml += modelsToRender.map(m => `<option value="${escapeHtml(m.id)}" >${escapeHtml(m.name || m.id)
            }

          </option>`).join('');
        }

        else {
          optionsHtml += `<option value="${escapeHtml(savedId)}" >${escapeHtml(savedId)
            }

        </option>`;
        }

        optionsHtml += '<option disabled>──────────</option><option value="custom_manual_input">Yeni Model Ekle...</option>';
        html += optionsHtml;
      }

      else if (prov === 'anthropic') {
        const mId = providerSettings.anthropic?.modelId || 'claude-3-5-sonnet-20241022';

        html += `<option value="${escapeHtml(mId)}" >${escapeHtml(mId)
          }

      </option>`;
        html += '<option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>';
        html += '<option value="claude-3-opus-20240229">claude-3-opus</option>';
        html += '<option value="claude-3-haiku-20240307">claude-3-haiku</option>';
      }

      html += '<option disabled>──────────</option><option value="open_provider">Provider Degistir...</option>';
      sel.innerHTML = html;

      const exists = [...sel.options].some(o => o.value === oldA && !o.disabled);
      if (exists) sel.value = oldA;

      else {
        const fv = [...sel.options].find(o => !o.disabled && o.value !== 'open_provider'); if (fv) sel.value = fv.value;
      }

      prefs.modelA = sel.value;
      saveAll();

      sel.onchange = () => {
        if (sel.value === 'custom_manual_input') {
          const m = prompt('Manuel Model ID girin:');

          if (m) {
            providerSettings.custom.modelId = m.trim();
            saveAll();

            refreshModelDropdowns().then(() => {
              $('model-a').value = m.trim(); prefs.modelA = m.trim(); saveAll();
            });
          }

          else {
            sel.value = prefs.modelA;
          }

          return;
        }

        if (sel.value === 'open_provider') {
          sel.value = prefs.modelA; openProvider(); return;
        }

        prefs.modelA = sel.value;
        saveAll();
      }

        ;
    }

    // ---- Chat Management
    function createNewChat() {
      if (compareActive) exitCompareMode();
      const prevChat = chats.find(x => x.id === currentChatId);
      if (prevChat) prevChat.canvas = Object.keys(canvasFiles).length > 0 ? JSON.parse(JSON.stringify(canvasFiles)) : null;
      canvasFiles = {};
      canvasActiveFile = null;
      if (canvasOpen) closeCanvas();
      const c = { id: makeChatId(), title: 'Yeni Sohbet', messages: [] };
      chats.push(c);
      currentChatId = c.id;
      saveAll(); renderChatList(); renderMessages([]); showWelcome();
      updateCanvasToggleBtn();
      $('user-input')?.focus();
    }

    function loadChat(id) {
      if (compareActive) exitCompareMode();
      const prevChat = chats.find(x => x.id === currentChatId);
      if (prevChat) prevChat.canvas = Object.keys(canvasFiles).length > 0 ? JSON.parse(JSON.stringify(canvasFiles)) : null;
      currentChatId = id;
      const c = chats.find(x => x.id === id);
      if (!c) return;
      canvasFiles = c.canvas ? JSON.parse(JSON.stringify(c.canvas)) : {};
      canvasActiveFile = Object.keys(canvasFiles)[0] || null;
      if (canvasOpen) {
        if (Object.keys(canvasFiles).length > 0) {
          renderCanvasFileTree();
          const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
          if (htmlFile) { selectCanvasFile(htmlFile); updateCanvasPreview(canvasFiles[htmlFile]); switchCanvasTab('preview'); }
          else if (canvasActiveFile) selectCanvasFile(canvasActiveFile);
        } else {
          closeCanvas();
        }
      }
      updateCanvasToggleBtn();
      renderMessages(c.messages); renderChatList();
      if (c.messages.length === 0) showWelcome(); else hideWelcome();
      $('user-input')?.focus();
    }

    function deleteChat(id) {
      chats = chats.filter(c => c.id !== id);
      if (currentChatId === id) currentChatId = null;
      deleteChatFromSupabase(id);
      saveAll(); renderChatList();
      if (chats.length > 0) loadChat(chats[chats.length - 1].id);
      else {
        renderMessages([]); showWelcome();
      }
    }

    function renderChatList(query = "") {
      const list = $('chat-list');
      if (!list) return;
      list.innerHTML = '';
      const filtered = chats.filter(c => c.title.toLowerCase().includes(query) || (c.messages[0]?.content || "").toLowerCase().includes(query));
      const pinned = filtered.filter(c => c.pinned);
      const unpinned = filtered.filter(c => !c.pinned);

      // Pinned section
      if (pinned.length > 0) {
        const pinHeader = document.createElement('div');
        pinHeader.className = 'folder-header';
        pinHeader.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="text-amber-500"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg> Sabitlenmis';
        list.appendChild(pinHeader);
      }

      [...pinned].reverse().forEach(c => list.appendChild(createChatRow(c)));

      // Folders
      const folders = [...new Set(unpinned.filter(c => c.folder).map(c => c.folder))];

      folders.forEach(folder => {
        const fHeader = document.createElement('div');
        fHeader.className = 'folder-header';

        fHeader.innerHTML = `<span>📁</span> ${escapeHtml(folder)
          }

          `;
        list.appendChild(fHeader);
        unpinned.filter(c => c.folder === folder).reverse().forEach(c => list.appendChild(createChatRow(c)));
      });

      // Unfoldered
      const noFolder = unpinned.filter(c => !c.folder);

      if (folders.length > 0 && noFolder.length > 0) {
        const gHeader = document.createElement('div');
        gHeader.className = 'folder-header';
        gHeader.innerHTML = 'Genel';
        list.appendChild(gHeader);
      }

      [...noFolder].reverse().forEach(c => list.appendChild(createChatRow(c)));
    }

    function createChatRow(c) {
      const row = document.createElement('div');

      row.className = `sidebar-item flex justify-between items-center group text-[12px] ${c.id === currentChatId ? 'active text-neutral-200' : 'text-neutral-500'
        }

      `;

      row.innerHTML = `<span class="truncate font-medium flex items-center gap-1" >${c.pinned ? '<span class="pin-icon">📌</span>' : ''
        }

      ${escapeHtml(c.title)
        }

      </span> <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" > <button onclick="event.stopPropagation(); togglePin(${c.id})" class="text-neutral-700 hover:text-amber-400 text-[10px] px-1" title="Sabitle" >${c.pinned ? '📌' : '📍'
        }

      </button> <button onclick="event.stopPropagation(); promptFolder(${c.id})" class="text-neutral-700 hover:text-blue-400 text-[10px] px-1" title="Klasor" >📁</button> <button onclick="event.stopPropagation(); shareChat(${c.id})" class="text-neutral-700 hover:text-green-400 text-[10px] px-1" title="Paylasim Linki Olustur"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button> <button onclick="event.stopPropagation(); deleteChat(${c.id})" class="text-neutral-700 hover:text-red-400 text-xs px-1" >&times; </button> </div>`;
      row.onclick = () => loadChat(c.id);
      return row;
    }

    // ---- Render Messages
    function renderMessages(msgs) {
      const win = $('chat-window');
      if (!win) return;
      win.innerHTML = '';
      if (msgs.length > 0) hideWelcome();

      (msgs || []).forEach((m, idx) => {
        const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('tr-TR', {
          hour: '2-digit', minute: '2-digit'
        }) : '';
        const isBookmarked = bookmarks.includes(currentChatId + '-' + idx);
        const tokenEst = typeof m.content === 'string' ? Math.ceil(m.content.length / 4) : 0;

        if (m.role === 'user') {
          const div = document.createElement('div');
          div.className = 'flex flex-col items-end animate-in msg-wrap';

          div.innerHTML = `<div class="msg-user-bubble px-5 py-3 text-sm text-white max-w-[80%] leading-relaxed" >${escapeHtml(m.content)
            }

          </div> <div class="msg-actions justify-end mt-1" > ${ts ? `< span class="msg-timestamp" > ${ts
              }

            </span > ` : ''
            }

          <span class="token-count" >${tokenEst
            }

          t</span> <button class="msg-action-btn msg-bookmark ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${idx})" title="Yer Imi" ><svg viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" ><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></button> <button class="msg-action-btn" onclick="copyMessage(${idx})" title="Kopyala" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Kopyala</button> <button class="msg-action-btn" onclick="openEditModal(${idx})" title="Duzenle" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Duzenle</button> </div>`;
          win.appendChild(div);
        }

        else if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__')) {
          const parts = m.content.match(/__PPTX_DOWNLOAD__(blob:.*?)__FILENAME__(.*?)__TITLE__(.*?)__SLIDES__(\d+)/);
          if (parts) {
            const [, blobUrl, fileName, titleText, slidesCount] = parts;
            const card = document.createElement('div');
            card.className = 'flex justify-start animate-in msg-wrap';
            card.innerHTML = `<div style="max-width:420px;background:linear-gradient(135deg,#0f2027,#1a3a4a);border:1px solid rgba(56,189,248,0.25);border-radius:20px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <div style="width:44px;height:44px;background:linear-gradient(135deg,#0ea5e9,#38bdf8);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    </div>
    <div>
      <div style="font-size:15px;font-weight:700;color:#f1f5f9">Sunum hazır! 🎉</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${slidesCount} slayt · PowerPoint (.pptx)</div>
    </div>
  </div>
  <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 14px;margin-bottom:14px;border:1px solid rgba(255,255,255,0.06)">
    <div style="font-size:13px;color:#94a3b8;margin-bottom:2px">Dosya adı</div>
    <div style="font-size:14px;font-weight:600;color:#e2e8f0;word-break:break-all">${fileName}</div>
  </div>
  <div style="font-size:13px;color:#94a3b8;margin-bottom:12px">İşte yaptım! Buradan indirebilirsin ⬇️</div>
  <a href="${blobUrl}" download="${fileName}" style="display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    PowerPoint İndir
  </a>
</div>`;
            win.appendChild(card);
          }
        }

        else if (m.role === 'assistant') {
          let contentHtml = m.content || '';
          let thinkingHtml = '';

          // Extract thinking/reasoning seamlessly (handles unclosed tags during streaming too)
          if (typeof contentHtml === 'string' && contentHtml.length > 0) {
            const thinkRegex = /<(?:thinking|thought|think)>([\s\S]*?)(?:<\/(?:thinking|thought|think)>|$)/i;
            const thinkMatch = contentHtml.match(thinkRegex);
            const reasonMatch = contentHtml.match(/<reasoning>([\s\S]*?)(?:<\/reasoning>|$)/i);
            const reflectMatch = contentHtml.match(/<reflection>([\s\S]*?)(?:<\/reflection>|$)/i);

            let thinkText = '';
            let isThinkingStreaming = false;

            if (thinkMatch) {
              thinkText = thinkMatch[1].trim();
              contentHtml = contentHtml.replace(thinkMatch[0], '');
              if (!thinkMatch[0].match(/<\/(?:thinking|thought|think)>/i)) isThinkingStreaming = true;
            }

            if (reasonMatch) {
              thinkText += (thinkText ? '\n\n' : '') + reasonMatch[1].trim();
              contentHtml = contentHtml.replace(reasonMatch[0], '');
              if (!reasonMatch[0].match(/<\/reasoning>/i)) isThinkingStreaming = true;
            }

            if (reflectMatch) {
              thinkText += (thinkText ? '\n\n' : '') + reflectMatch[1].trim();
              contentHtml = contentHtml.replace(reflectMatch[0], '');
              if (!reflectMatch[0].match(/<\/reflection>/i)) isThinkingStreaming = true;
            }

            // Estimate thinking duration from text length
            const thinkDuration = thinkText ? Math.max(1, Math.ceil(thinkText.length / 200)) : 0;

            const thinkDurationLabel = thinkDuration >= 60 ? `${Math.floor(thinkDuration / 60)
              }

            m ${thinkDuration % 60
              }

            s` : `${thinkDuration
            }

            s`;

            const headerText = isThinkingStreaming ? 'Dusunuyor...' : `Dusundu · ${thinkDurationLabel
              }

            `;
            const spinIcon = isThinkingStreaming ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-purple-400 shrink-0 animate-spin" ><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-purple-400 shrink-0" ><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>`;

            if (thinkText) {
              thinkingHtml = ` <details class="thinking-block mb-4"${isThinkingStreaming ? 'open' : ''
                }

              > <summary class="px-4 py-2.5 flex items-center gap-2 text-[12px] font-medium text-neutral-400 hover:text-neutral-300 transition-colors" > ${spinIcon
                }

              <span>${headerText
                }

              </span> <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ml-auto transition-transform" ><path d="M6 9l6 6 6-6" /></svg> </summary> <div class="px-4 py-3 text-[12px] text-neutral-500 leading-relaxed border-t border-[#222] max-h-60 overflow-y-auto" > ${escapeHtml(thinkText).replace(/\n/g, '<br>')
                }

              </div> </details>`;
            }
          }

          // Markdown (contentHtml must be string at this point)
          if (typeof contentHtml !== 'string') contentHtml = String(contentHtml || '');

          contentHtml = renderMarkdownHtml(contentHtml);

          // Code blocks: replace pre>code with clean code containers
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = contentHtml;

          tempDiv.querySelectorAll('pre code').forEach(codeEl => {
            const lang = (Array.from(codeEl.classList).find(c => c.startsWith('language-')) || '').replace('language-', '') || 'code';
            const code = codeEl.textContent;
            const codeId = 'c-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

            const container = document.createElement('div');
            container.id = codeId;

            container.className = 'code-block-inline mt-2 mb-2 rounded-xl overflow-hidden border border-[#222] bg-[#0d0d0d]';
            const highlighted = (typeof hljs !== 'undefined' && lang !== 'code') ? (() => { try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch(e) { return escapeHtml(code); } })() : escapeHtml(code);
            container.innerHTML = `<div class="flex items-center justify-between px-3 py-2 bg-[#111] border-b border-[#1a1a1a]"><span class="text-[11px] font-mono font-semibold text-neutral-500 uppercase tracking-wider">${escapeHtml(lang)}</span><button onclick="navigator.clipboard.writeText(this.closest('.code-block-inline').querySelector('code').textContent)" class="text-[11px] text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Kopyala</button></div><pre class="p-3 overflow-x-auto text-[13px] leading-relaxed m-0"><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>`;

            const pre = codeEl.closest('pre');
            if (pre) pre.replaceWith(container);
          });

          tempDiv.querySelectorAll('table').forEach(table => {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper my-4 border border-[#222] rounded-xl overflow-hidden bg-[#0a0a0a]';

            const header = document.createElement('div');
            header.className = 'bg-[#111] px-4 py-2 flex items-center justify-between border-b border-[#222]';
            header.innerHTML = ` <div class="flex items-center gap-2 text-xs font-bold text-neutral-400" > <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg> Veri Tablosu </div> <button onclick="renderTableChart(this)" class="text-[11px] bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-2 py-1 rounded transition-all flex items-center gap-1" > <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg> Grafiğe Çevir </button> `;

            const tableContainer = document.createElement('div');
            tableContainer.className = 'overflow-x-auto p-2';
            const clone = table.cloneNode(true);
            tableContainer.appendChild(clone);

            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container hidden p-4 border-t border-[#222] bg-[#111]';
            chartContainer.innerHTML = '<canvas></canvas>';

            wrapper.appendChild(header);
            wrapper.appendChild(tableContainer);
            wrapper.appendChild(chartContainer);
            table.replaceWith(wrapper);
          });

          contentHtml = tempDiv.innerHTML;

          // Images & videos
          const hasImage = / !\[.*?\]\(.*?\)|(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg))/i.test(m.content);
          const hasVideo = / !\[video\]\(.*?\)|(https?:\/\/.*\.(?:mp4|webm|ogg|mov))/i.test(m.content);

          if (hasImage) {
            contentHtml = contentHtml.replace(/ !\[.*?\]\((.*?)\)/g, '<br><img src="$1" class="mt-3 rounded-xl max-h-80 w-auto object-cover border border-[#222]">');
            contentHtml = contentHtml.replace(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?.*)?)/gi, '<br><img src="$1" class="mt-3 rounded-xl max-h-80 w-auto object-cover border border-[#222]">');
          }

          if (hasVideo) {
            contentHtml = contentHtml.replace(/ !\[video\]\((.*?)\)/g, '<br><video src="$1" controls class="mt-3 rounded-xl max-h-80 w-full border border-[#222]"></video>');
          }

          const div = document.createElement('div');
          div.className = 'flex flex-col gap-2 w-full animate-in msg-wrap';

          div.innerHTML = ` <div class="flex items-center gap-2.5 px-1" > <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white" >AI</div> <span class="text-[11px] text-neutral-500 font-semibold" >${escapeHtml(m.model || 'Assistant')
            }

          </span> </div> <div class="msg-ai-block text-sm leading-relaxed prose max-w-none pl-[34px]" > ${prefs.showThinking ? thinkingHtml : ''
            }

          ${contentHtml
            }

          </div> <div class="msg-actions pl-[34px]" > ${m.branches && m.branches.length > 0 ? ` < div class="flex items-center gap-1 mr-2" > <button class="msg-action-btn px-1" onclick="switchBranch(${idx},-1)" title="Onceki varyant" ><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" ><path d="M15 18l-6-6 6-6" /></svg></button> <span class="text-[9px] text-neutral-500 font-mono" >${m.activeBranch || (m.branches.length + 1)
              }

            /${m.branches.length + 1
              }

            </span> <button class="msg-action-btn px-1" onclick="switchBranch(${idx},1)" title="Sonraki varyant" ><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" ><path d="M9 18l6-6-6-6" /></svg></button> </div > ` : ''
            }

          ${ts ? `< span class="msg-timestamp" > ${ts
              }

            </span > ` : ''
            }

          <span class="token-count" >${tokenEst
            }

          t</span> <button class="msg-action-btn msg-bookmark ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${idx})" title="Yer Imi" ><svg viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" ><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></button> <button class="msg-action-btn" onclick="copyMessage(${idx})" title="Kopyala" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Kopyala</button> <button class="msg-action-btn" onclick="regenerateMessage(${idx})" title="Yeniden Olustur" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>Yeniden</button> <button class="msg-action-btn" onclick="speakMessage(${idx})" title="Sesli Oku" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>Sesli</button> <button class="msg-action-btn" onclick="addMsgToNote(${idx})" title="Not Defterine Ekle" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>Not</button> </div>`;
          win.appendChild(div);
        }
      });
      win.scrollTop = win.scrollHeight;
      // Attach lightbox to new images
      requestAnimationFrame(() => attachLightbox());
    }

    function copyCode(id) {
      const code = document.querySelector('#' + id + ' .code-raw').value;

      navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('#' + id + ' .code-btn');

        if (btn) {
          const orig = btn.innerHTML; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Kopyalandi'; setTimeout(() => btn.innerHTML = orig, 1500);
        }
      });
    }

    function downloadCode(id, lang) {
      const code = document.querySelector('#' + id + ' .code-raw').value;

      const blob = new Blob([code], {
        type: 'text/plain'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url; a.download = `code.${lang || 'txt'
        }

    `; a.click();
      URL.revokeObjectURL(url);
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => setStatus('Kopyalandi.'));
    }

    // ---- File Handling
    async function handleFileSelect(e) {
      const files = Array.from(e.target.files);

      if (selectedFiles.length + files.length > 20) {
        alert("Max 20 dosya."); return;
      }

      // Collect document files to auto-add to RAG
      const ragCandidates = [];

      for (const file of files) {
        const fd = {
          id: Date.now() + Math.random(), name: file.name, type: file.type, file, size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }

          ;
        if (file.type.startsWith('image/')) fd.preview = await readFileAsDataURL(file);
        else if (file.type.startsWith('video/')) fd.preview = URL.createObjectURL(file);
        else fd.preview = null;
        selectedFiles.push(fd);
        if (ocrMode && file.type.startsWith('image/')) {
          performOCR(file);
        }

        // Auto-add PDF, TXT, MD, CSV, JSON files to RAG module for persistent access
        const ragTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];
        const ragExts = ['.pdf', '.txt', '.md', '.csv', '.json'];
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        if (ragTypes.includes(file.type) || ragExts.includes(fileExt)) {
          ragCandidates.push(file);
        }
      }

      renderFilePreviews();
      e.target.value = '';

      // Auto-add document files to RAG in background (non-blocking)
      if (ragCandidates.length > 0 && window.RAGModule) {
        const alreadyInRAG = (window.RAGModule.documents || []).map(d => d.name);
        const newFiles = ragCandidates.filter(f => !alreadyInRAG.includes(f.name));
        if (newFiles.length > 0) {
          setStatus(`${newFiles.length} dosya Bilgi Bankasina (RAG) ekleniyor...`);
          window.RAGModule._handleFiles(newFiles).then(() => {
            setStatus(`${newFiles.length} dosya RAG'e eklendi. Sonraki mesajlarda da erisebilirsiniz.`);
          }).catch(() => { });
        }
      }
    }

    // ---- OCR Mode
    let ocrMode = false;

    function toggleOcr() {
      ocrMode = !ocrMode;
      const btn = $('ocr-btn');
      if (!btn) return;
      if (ocrMode) {
        btn.classList.add('ocr-active');
        btn.title = 'OCR Modu Aktif - Resim yukleyince metin cikarilir';
        setStatus('OCR modu aktif. Resim yukleyince metin otomatik cikarilir.');
      } else {
        btn.classList.remove('ocr-active');
        btn.title = 'OCR Modu - Resimden Metin Cikar';
        setStatus('OCR modu kapandi.');
      }
    }

    async function performOCR(file) {
      const btn = $('ocr-btn');
      try {
        btn && btn.classList.add('ocr-processing');
        setStatus('OCR: Resimden metin cikartiliyor...');
        const result = await Tesseract.recognize(file, 'tur+eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              const pct = Math.round((m.progress || 0) * 100);
              setStatus(`OCR isleniyor... %${pct}`);
            }
          }
        });
        const text = result.data.text.trim();
        if (!text) { setStatus('OCR: Metin bulunamadi.'); return; }
        const inp = $('user-input');
        const prefix = inp.value ? inp.value + '\n\n' : '';
        inp.value = prefix + '[Resimden cikarilan metin]:\n' + text;
        inp.dispatchEvent(new Event('input'));
        setStatus(`OCR tamamlandi. ${text.length} karakter cikartildi.`);
      } catch (err) {
        setStatus('OCR hatasi: ' + (err.message || err));
      } finally {
        btn && btn.classList.remove('ocr-processing');
      }
    }

    let liveScreenStream = null;
    let liveScreenTrack = null;

    async function handleScreenCapture() {
      if (liveScreenStream) { stopLiveScreen(); return; }
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
        liveScreenStream = stream;
        liveScreenTrack = stream.getVideoTracks()[0];
        liveScreenTrack.onended = () => stopLiveScreen();
        updateScreenBtn(true);
        showLiveScreenPreview(stream);
        setStatus('Ekran paylasimi aktif. Mesaj yazinca ekran otomatik eklenir.');
      } catch (err) {
        console.warn('Ekran yakalama basarisiz:', err);
      }
    }

    function stopLiveScreen() {
      if (liveScreenTrack) liveScreenTrack.stop();
      if (liveScreenStream) liveScreenStream.getTracks().forEach(t => t.stop());
      liveScreenStream = null;
      liveScreenTrack = null;
      updateScreenBtn(false);
      hideLiveScreenPreview();
      setStatus('Ekran paylasimi durduruldu.');
    }

    function updateScreenBtn(active) {
      const btn = $('screen-capture-btn');
      if (!btn) return;
      if (active) {
        btn.classList.add('text-emerald-400', 'bg-emerald-500/10');
        btn.classList.remove('text-neutral-500');
        btn.title = 'Ekran Paylasimini Durdur';
      } else {
        btn.classList.remove('text-emerald-400', 'bg-emerald-500/10');
        btn.classList.add('text-neutral-500');
        btn.title = 'Canli Ekran Paylasimi Baslat';
      }
    }

    function showLiveScreenPreview(stream) {
      const preview = $('live-screen-preview');
      if (!preview) return;
      const video = $('live-screen-video');
      if (video) video.srcObject = stream;
      preview.classList.remove('hidden');
    }

    function hideLiveScreenPreview() {
      const preview = $('live-screen-preview');
      if (preview) preview.classList.add('hidden');
      const video = $('live-screen-video');
      if (video) video.srcObject = null;
    }

    async function captureLiveScreenFrame() {
      if (!liveScreenStream || !liveScreenTrack || liveScreenTrack.readyState !== 'live') return null;
      try {
        const imageCapture = new ImageCapture(liveScreenTrack);
        const bitmap = await imageCapture.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const bCtx = canvas.getContext('bitmaprenderer');
        if (bCtx) { bCtx.transferFromImageBitmap(bitmap); }
        else { canvas.getContext('2d').drawImage(bitmap, 0, 0); }
        return canvas.toDataURL('image/jpeg', 0.82);
      } catch (e) { return null; }
    }

    function readFileAsDataURL(file) {
      return new Promise(r => {
        const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file);
      });
    }

    async function extractPdfText(file) {
      try {
        const ab = await file.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({
          data: ab
        }).promise;
        let t = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const p = await pdf.getPage(i); const tc = await p.getTextContent(); t += tc.items.map(x => x.str).join(" ") + "\n";
        }

        return t;
      }

      catch (e) {
        return "[PDF metni cikarilamadi]";
      }
    }

    function miniRAG(docText, query, maxTokens = 8000) {
      if (docText.length < maxTokens * 4) return docText;
      const chunks = docText.split(/\n\s*\n/).filter(c => c.trim().length > 10);
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
      if (keywords.length === 0) return docText.substring(0, maxTokens * 4);

      const scored = chunks.map(chunk => {
        let score = 0; const cLow = chunk.toLowerCase();

        keywords.forEach(kw => {
          if (cLow.includes(kw)) score++;
        });

        return {
          chunk, score
        }

          ;
      });
      scored.sort((a, b) => b.score - a.score);
      let out = "";

      for (const s of scored) {
        if (out.length + s.chunk.length > maxTokens * 4) break;

        if (s.score > 0 || out.length < (maxTokens * 2)) {
          out += s.chunk + "\n\n";
        }
      }

      return out.trim() || docText.substring(0, maxTokens * 4);
    }

    function renderFilePreviews() {
      const c = $('file-preview-container');
      if (!c) return;

      if (selectedFiles.length === 0) {
        c.classList.add('hidden'); return;
      }

      c.classList.remove('hidden');

      c.innerHTML = selectedFiles.map(f => {
        let preview = '';
        if (f.type.startsWith('image/') && f.preview) preview = `<img src="${f.preview}" class="w-full h-full object-cover rounded-lg" />`;
        else if (f.type.startsWith('video/') && f.preview) preview = `<video src="${f.preview}" class="w-full h-full object-cover rounded-lg" ></video>`;

        else preview = `<span class="text-xs text-neutral-500 truncate px-1" >${escapeHtml(f.name)
          }

          </span>`;

        return `<div class="relative group w-16 h-16 rounded-lg overflow-hidden border border-[#222] bg-[#0a0a0a] flex items-center justify-center" > ${preview
          }

          <button onclick="removeFile(${f.id})" class="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" >&times; </button> </div>`;
      }).join('');
    }

    function removeFile(id) {
      const f = selectedFiles.find(x => x.id === id);
      if (f && f.type.startsWith('video/') && f.preview) URL.revokeObjectURL(f.preview);
      selectedFiles = selectedFiles.filter(x => x.id !== id);
      renderFilePreviews();
    }

    // ---- Prompt Injection
    function injectPrompt(type) {
      const input = $('user-input');
      const modA = $('model-a')?.value;
      const prov = providerSettings.active || 'puter';
      let prefix = "";

      if (type === 'web-search') {
        prefix = "Bu web sitesini oku ve analiz et: "; setStatus('URL girin.');
      }

      else if (type === 'deep-research') {
        prefix = "Derin arastirma modu: "; setStatus('Arastirma konusu girin.');
      }

      else if (type === 'image-gen') {
        if (prov === 'puter' && !IMAGE_MODELS.includes(modA)) {
          alert('Lutfen bir gorsel modeli secin.'); return;
        }

        prefix = "Resim uret: ";
      }

      else if (type === 'video-gen') {
        if (!VIDEO_MODELS.includes(modA)) {
          alert('Lutfen bir video modeli secin.'); return;
        }

        prefix = "Video uret: ";
      }

      input.value = input.value ? prefix + input.value : prefix;
      input.focus();
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    }

    // ---- Web Content Fetching
    function withTimeout(promise, ms, label) {
      let t;
      const timeout = new Promise((_, rej) => t = setTimeout(() => rej(new Error(label + ' timeout')), ms));
      return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
    }

    // Smart fetch: Directly uses puter.net.fetch for remote APIs to bypass CORS
    async function smartFetch(url, options, timeoutMs) {
      const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0');

      if (isLocal) {
        // Local: only window.fetch works (puter proxy can't reach user's localhost)
        return await withTimeout(window.fetch(url, options), timeoutMs || 15000, 'local-fetch');
      }

      // Remote: use puter.net.fetch directly for CORS-free requests
      try {
        const resp = await withTimeout(puter.net.fetch(url, options), timeoutMs || 300000, 'puter-fetch');
        return resp;
      }

      catch (puterErr) {
        throw new Error(`Baglanti Hatasi (Puter CORS-Free Fetch): ${puterErr.message
          }

          `);
      }
    }

    async function fetchWebContent(url) {
      try {
        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) cleanUrl = 'https://' + cleanUrl;

        const resp = await withTimeout(puter.net.fetch(cleanUrl, {
          method: 'GET', headers: {
            'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml,*/*'
          }
        }), 30000, 'web-fetch');

        if (!resp.ok) throw new Error(`HTTP ${resp.status
          }

        `);
        const ct = resp.headers.get('content-type') || '';

        if (ct.includes('application/json')) {
          const j = await resp.json(); return {
            success: true, type: 'json', content: JSON.stringify(j, null, 2), url: cleanUrl
          }

            ;
        }

        const html = await resp.text();

        return {
          success: true, type: 'html', content: extractTextFromHtml(html), url: cleanUrl
        }

          ;
      }

      catch (e) {
        return {
          success: false, error: e.message, url
        }

          ;
      }
    }

    function extractTextFromHtml(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      ['script', 'style', 'nav', 'footer', 'aside', 'header', 'noscript', 'iframe', 'svg', 'form', 'button'].forEach(s => doc.querySelectorAll(s).forEach(el => el.remove()));
      const title = doc.querySelector('title')?.textContent?.trim() || '';
      const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const main = doc.querySelector('main, article, .content, .post, #content, #main') || doc.body;
      let parts = [];

      if (title) parts.push(`# ${title
        }

        \n`);

      if (metaDesc) parts.push(`> ${metaDesc
        }

        \n`);

      main.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
        const t = h.textContent.trim(); if (t) parts.push(`${'#'.repeat(parseInt(h.tagName[1]))
          }

            ${t
          }

            `);
      });

      main.querySelectorAll('p').forEach(p => {
        const t = p.textContent.trim(); if (t && t.length > 20) parts.push(t);
      });

      main.querySelectorAll('li').forEach(li => {
        const t = li.textContent.trim(); if (t && t.length > 10) parts.push(`- ${t
          }

            `);
      });
      let result = parts.join('\n\n');
      if (result.length > 15000) result = result.substring(0, 15000) + '\n\n[... kisaltildi ...]';

      return result.replace(/\n{3,}/g, '\n\n').trim() || doc.body?.textContent?.trim()?.substring(0, 10000) || '[Icerik cikarilamadi]';
    }

    function extractUrlsFromText(text) {
      const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
      return [...new Set(matches.map(u => u.replace(/[., ; : !?)]+$/, '')))];
    }

    async function processUrlsInMessage(text) {
      const urls = extractUrlsFromText(text);

      if (urls.length === 0) return {
        originalText: text, webContents: [], hasUrls: false
      }

        ;

      setStatus(`${urls.length
        }

        site aliniyor...`);
      const wc = [];
      for (const url of urls.slice(0, 3)) wc.push(await fetchWebContent(url));

      return {
        originalText: text, webContents: wc, hasUrls: true
      }

        ;
    }

    // ---- API Calls
    async function callPuterStream(modelId, history, onToken) {
      try {
        const streamOpts = {
          model: modelId, stream: true
        }

          ;

        // Enable thinking/reasoning for supported models if user enabled it
        if (prefs.showThinking) {
          const thinkingModels = /claude-3|claude-4|deepseek|qwq|o1|o3|o4|gemini|r1/i;

          if (thinkingModels.test(modelId)) {
            try {
              streamOpts.thinking = true;
            }

            catch (e) { }
          }
        }

        const it = await puter.ai.chat(history, streamOpts);
        let inThinkingStructured = false;

        for await (const part of it) {
          if (part?.type === 'thinking' || part?.thinking) {
            let chunk = String(part?.thinking || part?.text || part?.content || '');

            if (!inThinkingStructured) {
              chunk = '<thinking>\n' + chunk;
              inThinkingStructured = true;
            }

            if (onToken) onToken(chunk);
            continue;
          }

          if (inThinkingStructured) {
            if (onToken) onToken('\n</thinking>\n');
            inThinkingStructured = false;
          }

          let chunk = (part?.text ?? part?.message?.content ?? part?.content ?? '');
          if (Array.isArray(chunk)) chunk = chunk.map(c => c.text || '').join('');
          chunk = String(chunk);
          if (onToken) onToken(chunk);
        }

        if (inThinkingStructured) {
          if (onToken) onToken('\n</thinking>\n');
        }
      }

      catch (e) {
        if (e.message && e.message.includes('multimodal')) {
          if (onToken) onToken("\n[Bu model dosya analizi ile stream desteklemiyor.]");
        }

        else {
          if (onToken) onToken("\n[Baglanti hatasi: " + e.message + "]");
        }
      }
    }

    async function callPuterOnce(modelId, history) {
      const callOpts = {
        model: modelId
      }

        ;

      // Enable thinking for supported models if user enabled it
      if (prefs.showThinking) {
        const thinkingModels = /claude-3|claude-4|deepseek|qwq|o1|o3|o4|gemini.*think|r1/i;

        if (thinkingModels.test(modelId)) {
          try {
            callOpts.thinking = true;
          }

          catch (e) { }
        }
      }

      const r = await withTimeout(puter.ai.chat(history, callOpts), 300000, 'puter.ai.chat');
      if (typeof r === 'string') return r;

      // Extract thinking from structured response
      let thinkingText = '';
      let responseText = '';

      // Handle thinking content blocks (Anthropic/Claude style)
      if (r?.message?.content && Array.isArray(r.message.content)) {
        for (const block of r.message.content) {
          if (block.type === 'thinking' && block.thinking) thinkingText += block.thinking;
          else if (block.type === 'text' && block.text) responseText += block.text;
        }

        if (thinkingText && responseText) return `<thinking>${thinkingText
          }

        </thinking>\n${responseText
          }

        `;
        if (responseText) return responseText;
      }

      // Handle thinking field directly
      if (r?.thinking || r?.message?.thinking) {
        thinkingText = r?.thinking || r?.message?.thinking;
      }

      // Handle image responses from puter
      const rMsg = r?.message || r;

      if (rMsg?.images && rMsg.images.length > 0) {
        const parts = [];
        if (rMsg.content) parts.push(typeof rMsg.content === 'string' ? rMsg.content : rMsg.content.map(c => c.text || '').join(''));

        rMsg.images.forEach(img => {
          const u = img?.image_url?.url || img?.url || '';

          if (u) parts.push(` ![Gorsel](${u
            })`);
        });

        if (parts.length > 0) {
          const content = parts.join('\n\n');

          return thinkingText ? `<thinking>${thinkingText
            }

          </thinking>\n${content
            }

          ` : content;
        }
      }

      let content = '';
      if (r?.message?.content) content = typeof r.message.content === 'string' ? r.message.content : r.message.content.map(c => c.text || '').join('');
      else if (r?.content) content = typeof r.content === 'string' ? r.content : r.content.map(c => c.text || '').join('');
      else if (r?.choices?.[0]?.message?.content) content = r.choices[0].message.content;

      else {
        // Check choices for images too
        const choiceMsg = r?.choices?.[0]?.message;

        if (choiceMsg?.images && choiceMsg.images.length > 0) {
          const parts = [];
          if (choiceMsg.content) parts.push(choiceMsg.content);

          choiceMsg.images.forEach(img => {
            const u = img?.image_url?.url || img?.url || '';

            if (u) parts.push(` ![Gorsel](${u
              })`);
          });
          if (parts.length > 0) content = parts.join('\n\n');
        }

        // Check choices for thinking
        if (r?.choices?.[0]?.message?.thinking) thinkingText = r.choices[0].message.thinking;
        if (!content) content = JSON.stringify(r);
      }

      return thinkingText ? `<thinking>${thinkingText
        }

      </thinking>\n${content
        }

      ` : content;
    }

    async function callCustomRouter(modelId, history) {
      const {
        token, baseUrl
      }

        = providerSettings.custom;
      if (!baseUrl || !modelId) return 'Custom Provider ayarlari eksik.';
      let url = baseUrl.trim();
      if (!url.toLowerCase().startsWith('http')) url = 'http://' + url;
      if (!url.toLowerCase().includes('/chat/completions')) url = url.endsWith('/') ? url + 'chat/completions' : url + '/chat/completions';

      const cleanHistory = history.map(m => ({
        role: m.role, content: Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n').trim() : m.content
      }));

      try {
        const resp = await smartFetch(url, {
          method: 'POST', headers: {
            'Authorization': `Bearer ${token
              }

          `, 'Content-Type': 'application/json'
          }

          , body: JSON.stringify({
            model: modelId, messages: cleanHistory, stream: false
          })
        }

          , 300000);

        if (!resp.ok) {
          const t = await resp.text(); throw new Error(`HTTP ${resp.status
            }

        : ${t || resp.statusText
            }

        `);
        }

        const data = await resp.json();
        const msg = data?.choices?.[0]?.message;

        // Extract thinking/reasoning from response
        let thinkingText = '';
        if (msg?.reasoning_content) thinkingText = msg.reasoning_content;
        else if (msg?.thinking) thinkingText = msg.thinking;
        else if (data?.choices?.[0]?.reasoning_content) thinkingText = data.choices[0].reasoning_content;

        // Handle image responses (e.g. gemini-3-pro-image, gpt-image models)
        if (msg?.images && msg.images.length > 0) {
          const parts = [];
          if (msg.content) parts.push(msg.content);

          msg.images.forEach(img => {
            const imgUrl = img?.image_url?.url || img?.url || '';

            if (imgUrl) parts.push(` ![Gorsel](${imgUrl
              })`);
          });
          const content = parts.join('\n\n') || JSON.stringify(data);

          return thinkingText ? `<thinking>${thinkingText
            }

      </thinking>\n${content
            }

      ` : content;
        }

        const content = msg?.content || JSON.stringify(data);

        return thinkingText ? `<thinking>${thinkingText
          }

    </thinking>\n${content
          }

    ` : content;
      }

      catch (e) {
        throw new Error(`Custom Provider Hatasi: ${e.message
          }

        `);
      }
    }

    async function fetchCustomModels() {
      const {
        token, baseUrl
      }

        = providerSettings.custom;
      if (!baseUrl) return;
      let url = baseUrl.trim();
      if (!url.toLowerCase().startsWith('http')) url = 'http://' + url;
      url = url.replace(/\/chat\/completions\/?$/i, '');
      url = url.endsWith('/') ? url + 'models' : url + '/models';

      try {
        const resp = await smartFetch(url, {
          method: 'GET', headers: {
            'Authorization': `Bearer ${token
              }

            `, 'Content-Type': 'application/json'
          }
        }

          , 10000);

        if (!resp.ok) throw new Error(`HTTP ${resp.status
          }

        `);
        const data = await resp.json();

        if (data && Array.isArray(data.data)) customModels = data.data.map(m => ({
          id: m.id, name: m.id
        }));

        else if (data && Array.isArray(data.models)) customModels = data.models.map(m => ({
          id: m.id || m.name, name: m.id || m.name
        }));

        else if (Array.isArray(data)) customModels = data.map(m => ({
          id: m.id || m.name || m, name: m.id || m.name || m
        }));
      }

      catch (e) {
        console.error("[Custom Models]", e); setStatus('Model listesi alinamadi: ' + (e.message || '').substring(0, 40));
      }
    }

    async function manualFetchCustomModels(btn) {
      if (btn) {
        btn.textContent = '...'; btn.disabled = true;
      }

      providerSettings.custom.baseUrl = $('custom-url').value.trim();
      providerSettings.custom.token = $('custom-token').value.trim();
      await fetchCustomModels();
      const list = $('custom-models-list');

      if (list) list.innerHTML = customModels.map(m => `<option value="${m.id}" >${m.id
        }

        </option>`).join('');

      if (btn) {
        btn.textContent = customModels.length > 0 ? 'OK' : 'Hata';
        if (customModels.length > 0 && !$('custom-model-id').value) $('custom-model-id').value = customModels[0].id;

        setTimeout(() => {
          btn.textContent = 'Yenile'; btn.disabled = false;
        }

          , 1500);
      }
    }

    async function callAnthropicRouter(modelId, history) {
      const {
        token, baseUrl
      }

        = providerSettings.anthropic;
      if (!baseUrl || !modelId) return 'Anthropic ayarlari eksik.';
      let url = baseUrl.trim();
      if (!url.toLowerCase().startsWith('http')) url = 'http://' + url;
      if (!url.toLowerCase().includes('/v1/messages')) url = url.endsWith('/') ? url + 'v1/messages' : url + '/v1/messages';

      const cleanHistory = history.filter(m => m.role !== 'system').map(m => ({
        role: m.role, content: Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n').trim() : String(m.content)
      }));
      const sysMsg = history.find(m => m.role === 'system');
      const sysPrompt = sysMsg ? (Array.isArray(sysMsg.content) ? sysMsg.content.map(c => c.text || '').join('\n') : sysMsg.content) : buildSystemPrompt();

      const headers = {
        'Content-Type': 'application/json', 'anthropic-version': '2023-06-01'
      }

        ;
      if (token) headers['x-api-key'] = token;

      // Build request body - enable thinking for extended thinking models
      const reqBody = {
        model: modelId, messages: cleanHistory, system: sysPrompt, max_tokens: prefs.maxTokens || 4096, stream: false
      }

        ;

      // Extended thinking for Claude 3.5/4 models that support it
      if (prefs.showThinking) {
        const thinkingCapable = /claude-3-5-sonnet|claude-3\.5|claude-3-opus|claude-4|claude-sonnet-4|claude-opus-4/i.test(modelId);

        if (thinkingCapable) {
          try {
            reqBody.thinking = {
              type: 'enabled', budget_tokens: Math.min(prefs.maxTokens || 4096, 8192)
            }

              ;
          }

          catch (e) { }
        }
      }

      try {
        const resp = await smartFetch(url, {
          method: 'POST', headers, body: JSON.stringify(reqBody)
        }

          , 300000);

        if (!resp.ok) {
          const t = await resp.text(); throw new Error(`HTTP ${resp.status
            }

        : ${t || resp.statusText
            }

        `);
        }

        const data = await resp.json();

        // Parse thinking + text content blocks
        let thinkingText = '';
        let responseText = '';

        if (data.content && Array.isArray(data.content)) {
          for (const block of data.content) {
            if (block.type === 'thinking' && block.thinking) thinkingText += block.thinking;
            else if (block.type === 'text' && block.text) responseText += block.text;
          }

          if (thinkingText && responseText) return `<thinking>${thinkingText
            }

      </thinking>\n${responseText
            }

      `;
          if (responseText) return responseText;
          return data.content.map(c => c.text || '').join('\n');
        }

        return JSON.stringify(data);
      }

      catch (e) {
        throw new Error(`Anthropic Hatasi: ${e.message
          }

        `);
      }
    }

    async function checkAnthropicHealth(btn) {
      const base = $('anthropic-url').value.trim(); if (!base) return;
      const orig = btn.textContent; btn.textContent = '...';

      try {
        let root = base.split('/v1/')[0];
        const url = root.endsWith('/') ? root + 'health' : root + '/health';
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

        const resp = await smartFetch(url, {}

          , 10000);

        if (resp.ok) {
          const d = await resp.json(); alert("OK\n" + JSON.stringify(d, null, 2));
        }

        else alert("Hata " + resp.status);
      }

      catch (e) {
        alert("Erisim Hatasi: " + e.message);
      }

      finally {
        btn.textContent = orig;
      }
    }

    async function checkAnthropicLimits(btn) {
      const base = $('anthropic-url').value.trim(); if (!base) return;
      const orig = btn.textContent; btn.textContent = '...';

      try {
        let root = base.split('/v1/')[0];
        const url = root.endsWith('/') ? root + 'account-limits' : root + '/account-limits';

        const resp = await smartFetch(url, {}

          , 10000);

        if (resp.ok) {
          const d = await resp.json(); alert("Limitler:\n" + JSON.stringify(d, null, 2));
        }

        else alert("Hata " + resp.status);
      }

      catch (e) {
        alert("Hata: " + e.message);
      }

      finally {
        btn.textContent = orig;
      }
    }

    async function manualFetchAnthropicModels(btn) {
      const base = $('anthropic-url').value.trim(); if (!base) return;
      const orig = btn.textContent; btn.textContent = '...';

      try {
        let root = base.split('/v1/')[0];
        const url = root.endsWith('/') ? root + 'v1/models' : root + '/v1/models';

        const resp = await smartFetch(url, {}

          , 10000);

        if (resp.ok) {
          const data = await resp.json();
          const models = data.data || data.models || [];

          $('anthropic-models-list').innerHTML = models.map(m => `<option value="${m.id || m.name || m}" >${m.id || m.name || m
            }

          </option>`).join('');

          alert(`${models.length
            }

          model yuklendi.`);
        }

        else alert("Hata " + resp.status);
      }

      catch (e) {
        alert("Hata: " + e.message);
      }

      finally {
        btn.textContent = orig;
      }
    }

    async function refreshTokenAnthropic(btn) {
      const base = $('anthropic-url').value.trim(); if (!base) return;
      const orig = btn.textContent; btn.textContent = '...';

      try {
        let root = base.split('/v1/')[0];
        const url = root.endsWith('/') ? root + 'refresh-token' : root + '/refresh-token';

        const resp = await smartFetch(url, {
          method: 'POST'
        }

          , 10000);
        if (resp.ok) alert("Token yenilendi."); else alert("Basarisiz: " + resp.status);
      }

      catch (e) {
        alert("Hata: " + e.message);
      }

      finally {
        btn.textContent = orig;
      }
    }

    function buildHistoryForModel(chat) {
      const sys = buildSystemPrompt() || "Sen yardimci bir yapay zeka asistanisin.";

      const history = [{
        role: 'system', content: sys
      }

      ];

      (chat.messages || []).forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          const has = Array.isArray(m.content) ? m.content.length > 0 : (m.content && String(m.content).trim() !== '');

          if (has) history.push({
            role: m.role, content: m.content
          });
        }
      });
      return history;
    }

    // ---- Main Send
    let lastSendTime = 0;
    const SEND_COOLDOWN = 1000;

    async function handleSend() {
      const now = Date.now();

      if (now - lastSendTime < SEND_COOLDOWN) {
        setStatus('Bekleyin...'); return;
      }

      lastSendTime = now;

      const input = $('user-input'), sendBtn = $('send-btn'), stopBtn = $('stop-btn');
      const text = input ? input.value.trim() : '';
      if (!text) return;

      if (!puterReady && providerSettings.active === 'puter') {
        setStatus('Puter yukleniyor, lutfen bekleyin...');

        // Try waiting up to 5 seconds
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500));
          if (puterReady) break;
        }

        if (!puterReady) {
          puterReady = true; setStatus('Fallback ile devam ediliyor...');
        }
      }

      // Compare mode: send to both panels
      if (compareActive) {
        input.value = '';
        input.style.height = 'auto';
        await handleCompareSend(text);
        return;
      }

      if (!currentChatId) createNewChat();
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) return;
      if (chat.messages.length === 0) chat.title = text.slice(0, 30);

      chat.messages.push({
        role: 'user', content: text, timestamp: Date.now()
      });
      saveAll();
      input.value = '';
      hideWelcome();
      renderMessages(chat.messages);

      // Show stop button, hide send
      isGenerating = true;
      currentAbortController = new AbortController();
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'flex';

      const win = $('chat-window');
      const loader = document.createElement('div');
      loader.className = "flex flex-col gap-2 w-full animate-in";
      loader.id = "thinking-loader";
      let thinkingStartTime = Date.now();
      loader.innerHTML = ` <div class="flex items-center gap-2.5 px-1" > <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white" >AI</div> <span class="text-[11px] text-neutral-500 font-semibold" >Yanit olusturuluyor...</span> </div> <div id="thinking-dots" class="pl-[34px] flex gap-1.5 py-2" > <div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse" ></div> <div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse" ></div> <div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse" ></div> </div>`;
      win.appendChild(loader);
      win.scrollTop = win.scrollHeight;
      sendBtn.disabled = true;

      const modA = $('model-a')?.value || 'gpt-4o-mini';
      prefs.modelA = modA;
      saveAll();

      try {
        let history = buildHistoryForModel(chat);
        const activeProv = providerSettings.active || 'puter';

        // Web content
        const urls = extractUrlsFromText(text);
        let enhancedText = text;

        if (urls.length > 0) {
          setStatus('Web icerigi aliniyor...');
          const urlResult = await processUrlsInMessage(text);

          if (urlResult.hasUrls && urlResult.webContents.length > 0) {
            let webCtx = '\n\n--- WEB ICERIGI ---\n';

            urlResult.webContents.forEach(wc => {
              if (wc.success) webCtx += `\nKaynak: ${wc.url
                }

              \n${wc.content
                }

              \n---\n`;

              else webCtx += `\n${wc.url
                }

              - Erisilemedi: ${wc.error
                }

              \n`;
            });
            enhancedText = text + webCtx;

            for (let i = history.length - 1; i >= 0; i--) {
              if (history[i].role === 'user') {
                if (typeof history[i].content === 'string') history[i].content = enhancedText;

                else if (Array.isArray(history[i].content)) {
                  const tp = history[i].content.find(c => c.type === 'text'); if (tp) tp.text = enhancedText;
                }

                break;
              }
            }
          }
        }

        // Live screen auto-capture
        if (liveScreenStream) {
          const frameUrl = await captureLiveScreenFrame();
          if (frameUrl) {
            selectedFiles.unshift({ id: Date.now() + Math.random(), name: 'ekran-canli.jpg', type: 'image/jpeg', preview: frameUrl, _liveCapture: true });
          }
        }

        // Files
        if (selectedFiles.length > 0) {
          setStatus('Dosyalar isleniyor...');

          let userContent = [{
            type: 'text', text: enhancedText
          }

          ];

          for (const f of selectedFiles) {
            if (f.type.startsWith('image/')) userContent.push({
              type: 'image_url', image_url: {
                url: f.preview
              }
            });

            else if (f.type === 'application/pdf') {
              const pt = await extractPdfText(f.file); const ragText = miniRAG(pt, text, 8000); userContent[0].text += `\n\n[PDF: ${f.name
                }

          ]\n${ragText
                }

          `;
            }

            else if (f.type.startsWith('video/')) userContent[0].text += `\n\n[Video: ${f.name
              }

        ]`;
          }

          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') {
              history[i].content = userContent; break;
            }
          }

          chat.messages[chat.messages.length - 1].content = text + ` (${selectedFiles.length
            }

        dosya)`;
        }

        selectedFiles.forEach(f => {
          if (f.type.startsWith('video/') && f.preview) URL.revokeObjectURL(f.preview);
        });
        selectedFiles = [];
        renderFilePreviews();

        // Deep Research mode
        if (text.startsWith("Derin arastirma modu: ")) {
          const query = text.replace("Derin arastirma modu: ", "").trim();
          if (loader?.parentNode) loader.parentNode.removeChild(loader);
          sendBtn.disabled = false;
          await deepResearch(query);
          return;
        }

        // Agent mode
        if (text.startsWith("Ajan modu: ")) {
          const query = text.replace("Ajan modu: ", "").trim();
          if (!query) return;
          if (loader?.parentNode) loader.parentNode.removeChild(loader);
          sendBtn.disabled = false;
          isGenerating = false;
          sendBtn.style.display = 'flex';
          stopBtn.style.display = 'none';
          await runAgent(query);
          return;
        }

        setStatus('Yanit olusturuluyor...');

        const assistantMsg = {
          role: 'assistant', model: modA, content: '', timestamp: Date.now()
        }

          ;
        chat.messages.push(assistantMsg);

        // Detect if user is asking for code -> show canvas building
        const _skipCanvasThisTime = _noCanvas; _noCanvas = false;
        const isCodeRequest = !_skipCanvasThisTime && /\b(kod|code|uygulama|app|html|css|javascript|react|game|oyun|hesap|calculator|website|site|sayfa|program|yaz|olustur|create|build|make|python|py|c\+\+|cpp|java|rust|golang|script|fonksiyon|function|class|algoritma|algorithm)\b/i.test(text);
        assistantMsg.usedCanvas = isCodeRequest;
        if (isCodeRequest) showCanvasBuilding();

        // Image gen
        if (text.startsWith("Resim uret: ")) {
          const imgPrompt = text.replace("Resim uret: ", "").trim();

          if (activeProv === 'puter') {
            if (!IMAGE_MODELS.includes(modA)) throw new Error('Gorsel modeli secin.');
            setStatus('Gorsel uretiliyor...');

            try {
              const img = await puter.ai.txt2img(imgPrompt, {
                model: modA
              });
              const imgSrc = img?.src || img?.url || (typeof img === 'string' ? img : null);
              if (!imgSrc) throw new Error('Gorsel verisi alinamadi.');

              assistantMsg.content = ` ![Gorsel](${imgSrc
                })`;
            }

            catch (imgErr) {

              // Fallback: try via puter.ai.chat for image-capable models
              try {
                const r = await withTimeout(puter.ai.chat([{
                  role: 'user', content: imgPrompt
                }

                ], {
                  model: modA
                }), 60000, 'puter-image-chat');
                const rMsg = r?.message || r;

                if (rMsg?.images && rMsg.images.length > 0) {
                  const parts = [];
                  if (rMsg.content) parts.push(rMsg.content);

                  rMsg.images.forEach(im => {
                    const u = im?.image_url?.url || im?.url || '';

                    if (u) parts.push(` ![Gorsel](${u
                      })`);
                  });
                  assistantMsg.content = parts.join('\n\n');
                }

                else if (typeof rMsg?.content === 'string' && rMsg.content) {
                  assistantMsg.content = rMsg.content;
                }

                else {
                  throw imgErr;
                }
              }

              catch (e2) {
                throw new Error(imgErr.message || 'Gorsel uretilemedi.');
              }
            }

            closeCanvas();
            saveAll(); renderMessages(chat.messages); return;
          }

          else if (activeProv === 'custom') {
            setStatus('Gorsel uretiliyor...');
            assistantMsg.content = await callCustomRouter(modA, history) || 'Gorsel uretilemedi.';
            closeCanvas();
            saveAll(); renderMessages(chat.messages); return;
          }
        }

        // Video gen
        if (text.startsWith("Video uret: ")) {
          const vidPrompt = text.replace("Video uret: ", "").trim();

          if (activeProv === 'puter') {
            if (!VIDEO_MODELS.includes(modA)) throw new Error('Video modeli secin.');
            setStatus('Video uretiliyor...');

            try {
              const vid = await puter.ai.txt2vid(vidPrompt, {
                model: modA
              });
              const vidSrc = vid?.src || vid?.url || (typeof vid === 'string' ? vid : null);
              if (!vidSrc) throw new Error('Video verisi alinamadi.');

              assistantMsg.content = ` ![video](${vidSrc
                })`;
            }

            catch (vidErr) {
              try {
                const r = await withTimeout(puter.ai.chat([{
                  role: 'user', content: vidPrompt
                }

                ], {
                  model: modA
                }), 120000, 'puter-video-chat');
                const rMsg = r?.message || r;

                if (rMsg?.images && rMsg.images.length > 0) {
                  const parts = [];
                  if (rMsg.content) parts.push(rMsg.content);

                  rMsg.images.forEach(im => {
                    const u = im?.image_url?.url || im?.url || '';

                    if (u) parts.push(` ![video](${u
                      })`);
                  });
                  assistantMsg.content = parts.join('\n\n');
                }

                else if (typeof rMsg?.content === 'string' && rMsg.content) {
                  assistantMsg.content = rMsg.content;
                }

                else {
                  throw vidErr;
                }
              }

              catch (e2) {
                throw new Error(vidErr.message || 'Video uretilemedi.');
              }
            }

            closeCanvas();
            saveAll(); renderMessages(chat.messages); return;
          }

          else if (activeProv === 'custom') {
            setStatus('Video uretiliyor...');
            assistantMsg.content = await callCustomRouter(modA, history) || 'Video uretilemedi.';
            closeCanvas();
            saveAll(); renderMessages(chat.messages); return;
          }
        }

        if (activeProv === 'custom') {
          assistantMsg.content = await callCustomRouter(modA, history) || 'Bos yanit.';
        }

        else if (activeProv === 'anthropic') {
          assistantMsg.content = await callAnthropicRouter(modA, history) || 'Bos yanit.';
        }

        else if (prefs.stream) {
          setStatus('Stream...');
          assistantMsg.content = '';

          // Thinking timer updater (only if thinking is enabled)
          let thinkTimerInterval = null;

          if (prefs.showThinking) {
            thinkTimerInterval = setInterval(() => {
              const el = document.getElementById('live-thinking-timer');

              if (el && streamThinkingText) {
                const secs = Math.floor((Date.now() - thinkingStartTime) / 1000);

                el.textContent = `Dusunuyor... ${secs
                  }

              s`;
              }
            }

              , 1000);
          }

          await callPuterStream(modA, history, tok => {
            const dots = document.getElementById('thinking-dots');
            if (dots) dots.style.display = 'none';
            assistantMsg.content += tok;
            throttledRenderMessages(chat.messages);
            if (voiceConvMode) queueVoiceStreamChunk(tok);
          });
        }

        else {
          assistantMsg.content = await callPuterOnce(modA, history) || 'Bos yanit.';
        }

        saveAll();
        renderMessages(chat.messages);

        if (voiceConvMode && assistantMsg.content) {
          if (stylePrefs.streamMode && voiceStreamBuffer.trim()) {
            flushVoiceStreamBuffer();
          } else if (!stylePrefs.streamMode) {
            voiceConvSpeak(assistantMsg.content);
          }
          const waitForSpeech = () => {
            if (speechSynthesis.speaking) {
              setTimeout(waitForSpeech, 300);
            } else {
              voiceStreamBuffer = '';
              setVoiceOverlayState('listening');
              setTimeout(() => { try { recognition && recognition.start(); } catch (e) { } }, 600);
            }
          };
          if (stylePrefs.streamMode) setTimeout(waitForSpeech, 400);
        }

        // Finalize canvas if code was detected
        if (_pptxMode && assistantMsg.content) { generatePptxFromContent(assistantMsg.content); _pptxMode = false; }
        else if (_htmlSlideMode && assistantMsg.content) { generateHTMLFromContent(assistantMsg.content); _htmlSlideMode = false; }
        else if (isCodeRequest && assistantMsg.content) finalizeCanvas(assistantMsg.content);
        else if (canvasOpen && !isCodeRequest) closeCanvas();
      }

      catch (e) {
        if (canvasOpen) closeCanvas();
        let errText = e.message || String(e);
        const last = chat.messages[chat.messages.length - 1];

        if (last && last.role === 'assistant' && !last.content) {
          last.model = 'System'; last.content = `Hata: ${errText
            }

        `;
        }

        else {
          chat.messages.push({
            role: 'assistant', model: 'System', content: `Hata: ${errText
              }

          `
          });
        }

        saveAll(); renderMessages(chat.messages);
        setStatus('Hata: ' + errText.substring(0, 40));
      }

      finally {
        if (loader?.parentNode) loader.parentNode.removeChild(loader);
        sendBtn.disabled = false;
        isGenerating = false;
        currentAbortController = null;
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        $('user-input')?.focus();
        playNotificationSound();

        // Auto-title after first exchange
        if (chat && chat.messages.length === 2 && chat.title === text.slice(0, 30)) {
          autoGenerateTitle(chat);
        }
      }
    }

    // ---- Modals
    function openProvider() {
      openSettings();
    }

    function closeProvider() {
      closeSettings();
    }

    function updateProviderFields() {
      const val = $('provider-select').value;
      document.querySelectorAll('.provider-fields').forEach(el => el.classList.add('hidden'));
      const target = $('fields-' + val);
      if (target) target.classList.remove('hidden');
    }

    async function saveProviderSettings() {
      await saveSettings();
    }

    function openSettings() {
      const m = $('settings-modal'), c = m.querySelector('div');
      m.classList.remove('hidden');

      setTimeout(() => {
        m.classList.remove('opacity-0'); c.classList.remove('scale-95');
      }

        , 10);
      $('pref-stream').checked = ! !prefs.stream;
      $('pref-theme').checked = document.body.classList.contains('light-mode');
      if ($('pref-auto-theme')) $('pref-auto-theme').checked = ! !prefs.autoTheme;

      // Font size buttons
      ['sm', 'md', 'lg'].forEach(s => {
        const btn = $('font-' + s + '-btn');

        if (btn) {
          btn.style.borderColor = s === (prefs.fontSize || 'md') ? '#2563eb' : ''; btn.style.color = s === (prefs.fontSize || 'md') ? '#fff' : '';
        }
      });

      // Max tokens
      if ($('pref-max-tokens')) {
        $('pref-max-tokens').value = prefs.maxTokens || 4096; $('max-token-val').textContent = prefs.maxTokens || 4096;
      }

      if ($('pref-notify-sound')) $('pref-notify-sound').checked = ! !prefs.notifySound;
      if ($('pref-show-thinking')) $('pref-show-thinking').checked = ! !prefs.showThinking;
      updateAccentButtons(prefs.accent || 'blue');
      $('pref-short').checked = ! !stylePrefs.short;
      $('pref-no-lecture').checked = ! !stylePrefs.noLecture;
      $('pref-turkish').checked = ! !stylePrefs.turkish;
      selectVoiceStyle(stylePrefs.voiceStyle || 'samimi');
      $('pref-auth-mode').value = providerSettings.authMode || 'local';
      $('pref-custom').value = stylePrefs.custom || '';
      // Provider fields
      $('provider-select').value = providerSettings.active || 'puter';
      $('custom-url').value = providerSettings.custom?.baseUrl || '';
      $('custom-token').value = providerSettings.custom?.token || '';
      $('custom-model-id').value = providerSettings.custom?.modelId || '';
      $('anthropic-url').value = providerSettings.anthropic?.baseUrl || 'http://localhost:8080';
      $('anthropic-token').value = providerSettings.anthropic?.token || '';
      $('anthropic-model-id').value = providerSettings.anthropic?.modelId || 'claude-3-5-sonnet-20241022';
      updateProviderFields();
      renderPromptLibrary();
      _populateSettingsAccount();
      _populateSettingsStats();
    }

    function _populateSettingsAccount() {
      const panel = $('settings-account-panel');
      if (!panel) return;
      const userPanel = document.getElementById('github-user-panel');
      const isLoggedIn = userPanel && !userPanel.classList.contains('hidden');
      if (isLoggedIn) {
        const name = (document.getElementById('github-user-name')?.textContent || '').trim();
        const email = (document.getElementById('github-user-email')?.textContent || '').trim();
        const avatarImg = document.getElementById('auth-avatar-img');
        const avatarSrc = avatarImg && !avatarImg.classList.contains('hidden') ? avatarImg.src : '';
        panel.innerHTML = `<div class="flex items-center gap-3 mb-2.5">
          ${avatarSrc ? `<img src="${avatarSrc}" class="w-10 h-10 rounded-full object-cover" alt="avatar">` : `<div class="w-10 h-10 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-neutral-400 text-base font-bold">${(name[0] || '?').toUpperCase()}</div>`}
          <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-white truncate">${name || 'Kullanici'}</div><div class="text-[10px] text-neutral-500 truncate">${email}</div></div>
        </div>
        <button onclick="signOutGithub();closeSettings();" class="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/40 hover:text-red-400 text-neutral-400 transition-all text-left">Cikis Yap</button>`;
      } else {
        panel.innerHTML = `<div class="text-xs text-neutral-500 mb-2.5">Henuz giris yapilmadi.</div>
        <button onclick="closeSettings();document.getElementById('header-github-btn')?.click();" class="w-full text-xs font-bold py-2 px-3 rounded-lg text-white transition-all" style="background:#0d9488">Giris Yap / Kayit Ol</button>`;
      }
    }

    function _populateSettingsStats() {
      const panel = $('settings-stats-panel');
      if (!panel) return;
      let totalMsgs = 0, totalWords = 0, totalTokens = 0;
      chats.forEach(ch => {
        (ch.messages || []).forEach(msg => {
          totalMsgs++;
          const text = typeof msg.content === 'string' ? msg.content : '';
          totalWords += text.split(/\s+/).filter(Boolean).length;
          totalTokens += Math.ceil(text.length / 4);
        });
      });
      const stat = (label, val) => `<div class="flex justify-between items-center"><span class="text-xs text-neutral-500">${label}</span><span class="text-xs font-bold text-white">${val}</span></div>`;
      panel.innerHTML = [
        stat('Toplam Sohbet', chats.length),
        stat('Toplam Mesaj', totalMsgs.toLocaleString()),
        stat('Toplam Kelime', totalWords.toLocaleString()),
        stat('Tahmini Token', totalTokens.toLocaleString()),
        stat('Yer Imleri', (typeof bookmarks !== 'undefined' ? bookmarks.length : 0))
      ].join('');
    }

    function closeSettings() {
      const m = $('settings-modal'), c = m.querySelector('div');
      m.classList.add('opacity-0'); c.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    async function saveSettings() {
      // Stream
      prefs.stream = $('pref-stream').checked;
      prefs.autoTheme = $('pref-auto-theme')?.checked || false;
      // Max tokens
      prefs.maxTokens = parseInt($('pref-max-tokens')?.value || 4096);
      prefs.notifySound = $('pref-notify-sound')?.checked || false;
      prefs.showThinking = ! !$('pref-show-thinking')?.checked;
      document.body.classList.toggle('hide-thinking', !prefs.showThinking);
      // Theme
      if (prefs.autoTheme) {
        applyAutoTheme();
      } else {
        const wantLight = $('pref-theme').checked;
        const isLight = document.body.classList.contains('light-mode');
        if (wantLight !== isLight) toggleTheme();
      }

      // Style prefs
      stylePrefs = {
        short: $('pref-short').checked, noLecture: $('pref-no-lecture').checked, turkish: $('pref-turkish').checked, custom: $('pref-custom').value || '',
        voiceStyle: $('pref-voice-style').value || 'samimi'
      }

        ;
      // Auth mode
      const newAuth = $('pref-auth-mode').value;

      if (newAuth !== providerSettings.authMode) {
        if (newAuth === 'puter' && !puter.auth.isSignedIn()) {
          openPuterAuthModal();
          return; // Modal kapaninca reload olacak
        }

        providerSettings.authMode = newAuth;
        saveAll();
        if (confirm('Oturum modu degisti. Sayfa yenilensin mi?')) location.reload();
      }

      // Provider
      const active = $('provider-select').value;
      providerSettings.active = active;

      if (!providerSettings.custom) providerSettings.custom = {}

        ;

      if (!providerSettings.anthropic) providerSettings.anthropic = {}

        ;
      providerSettings.custom.baseUrl = $('custom-url')?.value.trim() || '';
      providerSettings.custom.token = $('custom-token')?.value.trim() || '';
      providerSettings.custom.modelId = $('custom-model-id')?.value.trim() || '';
      providerSettings.anthropic.baseUrl = $('anthropic-url')?.value.trim() || 'http://localhost:8080';
      providerSettings.anthropic.token = $('anthropic-token')?.value.trim() || '';
      providerSettings.anthropic.modelId = $('anthropic-model-id')?.value.trim() || 'claude-3-5-sonnet-20241022';
      if (active === 'custom' && providerSettings.custom.modelId) prefs.modelA = providerSettings.custom.modelId;
      if (active === 'anthropic' && providerSettings.anthropic.modelId) prefs.modelA = providerSettings.anthropic.modelId;
      customModels = [];
      saveAll();
      closeSettings();
      await refreshModelDropdowns();
      setStatus('Ayarlar kaydedildi.');
    }

    function clearAllData() { openResetModal(); }

    function openResetModal() {
      const m = document.getElementById('reset-modal');
      if (!m) return;
      m.classList.remove('hidden');
      requestAnimationFrame(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); });
    }

    function closeResetModal() {
      const m = document.getElementById('reset-modal');
      if (!m) return;
      m.classList.add('opacity-0');
      m.querySelector('div').classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function resetLocalOnly() {
      closeResetModal();
      const keysToKeep = [KEY_PROVIDERS, KEY_PREFS, KEY_STYLE];
      const saved = {};
      keysToKeep.forEach(k => { const v = localStorage.getItem(k); if (v) saved[k] = v; });
      localStorage.clear();
      keysToKeep.forEach(k => { if (saved[k]) localStorage.setItem(k, saved[k]); });
      chats = [];
      currentChatId = null;
      renderChatList();
      renderMessages([]);
      showWelcome();
    }

    async function resetEverything() {
      if (!confirm('Tum sohbetler kalici olarak silinecek. Emin misin?')) return;
      closeResetModal();
      await deleteAllChatsFromSupabase();
      localStorage.clear();
      location.reload();
    }

    let savedSystemPrompts = [];
    function loadSavedPrompts() {
      try { savedSystemPrompts = JSON.parse(localStorage.getItem('saved_sys_prompts') || '[]'); } catch (e) { savedSystemPrompts = []; }
    }
    function saveSavedPrompts() {
      localStorage.setItem('saved_sys_prompts', JSON.stringify(savedSystemPrompts));
    }
    function saveSystemPromptToLibrary() {
      const text = ($('pref-custom')?.value || '').trim();
      if (!text) { setStatus('Once bir sistem promptu yazin.'); return; }
      const name = prompt('Bu promptun adi:', text.substring(0, 40));
      if (!name) return;
      savedSystemPrompts.push({ id: Date.now(), name: name.trim(), prompt: text });
      saveSavedPrompts();
      renderPromptLibrary();
      setStatus('Prompt kaydedildi: ' + name.trim());
    }
    function applySystemPromptFromLibrary(id) {
      const p = savedSystemPrompts.find(x => x.id === id);
      if (!p) return;
      const ta = $('pref-custom');
      if (ta) ta.value = p.prompt;
      setStatus('Prompt yuklendi: ' + p.name);
    }
    function deleteSystemPromptFromLibrary(id) {
      savedSystemPrompts = savedSystemPrompts.filter(x => x.id !== id);
      saveSavedPrompts();
      renderPromptLibrary();
    }
    function renderPromptLibrary() {
      const list = $('prompt-library-list');
      const count = $('prompt-library-count');
      if (!list) return;
      if (count) count.textContent = savedSystemPrompts.length + ' prompt';
      if (savedSystemPrompts.length === 0) {
        list.innerHTML = '<div style="font-size:11px;color:#555;text-align:center;padding:12px 0">Henuz kaydedilmis prompt yok.<br>Yukardaki alana yaz ve &quot;+ Kutuphanye Kaydet&quot;e bas.</div>';
        return;
      }
      list.innerHTML = savedSystemPrompts.map(p => `
        <div style="display:flex;align-items:center;gap:6px;padding:7px 8px;background:rgba(255,255,255,0.03);border:1px solid #1e1e1e;border-radius:8px">
          <div style="flex:1;min-width:0;cursor:pointer" onclick="applySystemPromptFromLibrary(${p.id})">
            <div style="font-size:12px;font-weight:600;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name.replace(/</g, '&lt;')}</div>
            <div style="font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.prompt.substring(0, 60).replace(/</g, '&lt;')}${p.prompt.length > 60 ? '...' : ''}</div>
          </div>
          <button onclick="applySystemPromptFromLibrary(${p.id})" title="Uygula" style="padding:4px 8px;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.3);border-radius:6px;color:#60a5fa;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">Sec</button>
          <button onclick="deleteSystemPromptFromLibrary(${p.id})" title="Sil" style="padding:4px 6px;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);border-radius:6px;color:#f87171;font-size:11px;cursor:pointer">&#xd7;</button>
        </div>
      `).join('');
    }

    // ---- Stop Generation
    function stopGeneration() {
      if (currentAbortController) currentAbortController.abort();
      isGenerating = false;
      $('send-btn').style.display = 'flex';
      $('stop-btn').style.display = 'none';
      setStatus('Durduruldu.');
    }

    // ---- Message Actions
    function copyMessage(idx) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      const text = chat.messages[idx].content;
      navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text)).then(() => setStatus('Kopyalandi.'));
    }

    function editMessage(idx) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      const oldText = chat.messages[idx].content;
      const newText = prompt('Mesaji duzenle:', typeof oldText === 'string' ? oldText : '');
      if (newText === null || newText === oldText) return;
      // Remove this and all messages after it
      chat.messages = chat.messages.slice(0, idx);
      saveAll();
      // Set input and re-send
      $('user-input').value = newText;
      renderMessages(chat.messages);
      if (chat.messages.length === 0) showWelcome();
      handleSend();
    }

    function regenerateMessage(idx) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      // Find the user message before this assistant message
      let userIdx = idx - 1;
      while (userIdx >= 0 && chat.messages[userIdx].role !== 'user') userIdx--;
      if (userIdx < 0) return;
      const userText = chat.messages[userIdx].content;

      // Branch: save current response as a branch variant
      const assistantMsg = chat.messages[idx];
      if (!assistantMsg.branches) assistantMsg.branches = [];

      // Only store if there's real content to branch
      if (assistantMsg.content && assistantMsg.content.trim()) {
        assistantMsg.branches.push({
          content: assistantMsg.content,
          model: assistantMsg.model,
          timestamp: assistantMsg.timestamp || Date.now()
        });
        if (!assistantMsg.activeBranch) assistantMsg.activeBranch = assistantMsg.branches.length; // 1-indexed, current is "next"
      }

      // Remove from the user message onward
      chat.messages = chat.messages.slice(0, userIdx);
      saveAll();
      $('user-input').value = typeof userText === 'string' ? userText : '';
      renderMessages(chat.messages);
      handleSend();
    }

    function switchBranch(msgIdx, direction) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[msgIdx]) return;
      const msg = chat.messages[msgIdx];
      if (!msg.branches || msg.branches.length === 0) return;

      // Total variants = branches + current
      const totalVariants = msg.branches.length + 1;
      let currentIdx = msg.activeBranch || totalVariants; // default to latest (current content)

      currentIdx += direction;
      if (currentIdx < 1) currentIdx = totalVariants;
      if (currentIdx > totalVariants) currentIdx = 1;

      msg.activeBranch = currentIdx;

      if (currentIdx <= msg.branches.length) {
        // Swap: save current content to last branch slot, load selected branch
        const currentContent = msg.content;
        const currentModel = msg.model;
        const currentTimestamp = msg.timestamp;

        // Replace current with selected branch
        const branch = msg.branches[currentIdx - 1];
        msg.content = branch.content;
        msg.model = branch.model;
        msg.timestamp = branch.timestamp;

        // Save old current into branches at the same position
        msg.branches[currentIdx - 1] = {
          content: currentContent, model: currentModel, timestamp: currentTimestamp
        }

          ;
      }

      saveAll();
      renderMessages(chat.messages);
    }

    // ---- TTS
    let currentUtterance = null;

    function cleanTextForSpeech(raw) {
      return raw
        .replace(/<[^>]*>/g, '')
        .replace(/```[\s\S]*?```/g, ' kod blogu ')
        .replace(/`[^`]+`/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}|\u{20E3}|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, '')
        .replace(/[#*_~]/g, '')
        .replace(/\|/g, ' ')
        .replace(/---+/g, ' ')
        .replace(/^\s*[-•]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .replace(/:\s*,/g, ':')
        .replace(/\s{2,}/g, ' ')
        .replace(/([.!?])\s*\1+/g, '$1')
        .trim();
    }

    const VOICE_STYLE_PARAMS = {
      samimi: { rate: 0.92, pitch: 1.10, volume: 1.0, femaleHints: ['zeynep', 'yelda', 'dilek', 'ayse', 'samantha', 'ava', 'karen', 'alice', 'victoria', 'moira', 'tessa', 'fiona', 'sara', 'anna', 'zira', 'hazel', 'heera'], maleHints: [] },
      profesyonel: { rate: 0.80, pitch: 0.90, volume: 0.95, femaleHints: [], maleHints: ['ali', 'daniel', 'alex', 'david', 'mark', 'jorge', 'diego', 'luca', 'thomas', 'james', 'arthur', 'eddy', 'google uk english male', 'microsoft david'] },
      zkusagi: { rate: 1.15, pitch: 1.15, volume: 1.0, femaleHints: ['samantha', 'ava', 'karen', 'alice', 'zeynep', 'yelda', 'zira', 'hazel'], maleHints: [] },
    };

    function getBestVoice(lang, style) {
      const voices = speechSynthesis.getVoices();
      const langCode = lang.toLowerCase();
      const candidates = voices.filter(v => v.lang.toLowerCase().startsWith(langCode.split('-')[0]));
      if (!candidates.length) return null;
      const params = VOICE_STYLE_PARAMS[style || 'samimi'] || VOICE_STYLE_PARAMS.samimi;
      const hints = [...(params.femaleHints || []), ...(params.maleHints || [])];
      for (const hint of hints) {
        const match = candidates.find(v => v.name.toLowerCase().includes(hint));
        if (match) return match;
      }
      const quality = ['google', 'microsoft', 'natural', 'premium', 'enhanced', 'neural'];
      for (const kw of quality) {
        const match = candidates.find(v => v.name.toLowerCase().includes(kw));
        if (match) return match;
      }
      return candidates[0];
    }

    function makeUtterance(text, lang, onEnd, onError) {
      const utter = new SpeechSynthesisUtterance(text.substring(0, 3000));
      utter.lang = lang;
      const style = stylePrefs.voiceStyle || 'samimi';
      const params = VOICE_STYLE_PARAMS[style] || VOICE_STYLE_PARAMS.samimi;
      utter.rate = params.rate;
      utter.pitch = params.pitch;
      utter.volume = params.volume !== undefined ? params.volume : 1.0;
      const voice = getBestVoice(lang, style);
      if (voice) utter.voice = voice;
      utter.onend = onEnd;
      utter.onerror = onError;
      return utter;
    }

    function selectVoiceStyle(style) {
      stylePrefs.voiceStyle = style;
      document.querySelectorAll('.voice-style-btn').forEach(btn => {
        const active = btn.dataset.style === style;
        btn.classList.toggle('border-blue-500', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('bg-blue-600/20', active);
        btn.classList.toggle('border-[#333]', !active);
        btn.classList.toggle('text-neutral-400', !active);
      });
      $('pref-voice-style').value = style;
    }

    function voiceConvSpeak(rawText) {
      if (currentUtterance) { speechSynthesis.cancel(); currentUtterance = null; }
      const text = cleanTextForSpeech(rawText);
      if (!text) {
        if (voiceConvMode) {
          setVoiceOverlayState('listening');
          setTimeout(() => { try { recognition && recognition.start(); } catch (e) { } }, 500);
        }
        return;
      }
      const lang = stylePrefs.turkish ? 'tr-TR' : 'en-US';
      const resume = () => {
        currentUtterance = null;
        setStatus('Yanit okundu. Konusmaya devam edin...');
        if (voiceConvMode) {
          setVoiceOverlayState('listening');
          const interimEl = $('voice-interim');
          if (interimEl) interimEl.textContent = '';
          setTimeout(() => { try { recognition && recognition.start(); } catch (e) { } }, 600);
        }
      };
      const doSpeak = () => {
        currentUtterance = makeUtterance(text, lang, resume, resume);
        speechSynthesis.speak(currentUtterance);
        setStatus('Yapay zeka yanit veriyor...');
        if (voiceConvMode) setVoiceOverlayState('speaking');
      };
      if (speechSynthesis.getVoices().length) {
        doSpeak();
      } else {
        speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
      }
    }

    let voiceStreamBuffer = '';
    let voiceStreamTimer = null;

    function flushVoiceStreamBuffer() {
      if (!voiceStreamBuffer.trim() || !voiceConvMode) { voiceStreamBuffer = ''; return; }
      const text = cleanTextForSpeech(voiceStreamBuffer);
      voiceStreamBuffer = '';
      if (!text) return;
      const lang = stylePrefs.turkish ? 'tr-TR' : 'en-US';
      const utter = makeUtterance(text, lang, () => { }, () => { });
      speechSynthesis.speak(utter);
    }

    function queueVoiceStreamChunk(chunk) {
      if (!voiceConvMode) return;
      voiceStreamBuffer += chunk;
      const sentenceEnd = /[.!?。]\s/.exec(voiceStreamBuffer);
      if (sentenceEnd) {
        const sentence = voiceStreamBuffer.substring(0, sentenceEnd.index + 1);
        voiceStreamBuffer = voiceStreamBuffer.substring(sentenceEnd.index + 2);
        const text = cleanTextForSpeech(sentence);
        if (text) {
          const lang = stylePrefs.turkish ? 'tr-TR' : 'en-US';
          const utter = makeUtterance(text, lang, () => { }, () => { });
          speechSynthesis.speak(utter);
          setVoiceOverlayState('speaking');
        }
      }
    }

    function speakMessage(idx) {
      if (currentUtterance) {
        speechSynthesis.cancel(); currentUtterance = null; setStatus('Sesli okuma durduruldu.'); return;
      }
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      const text = cleanTextForSpeech(chat.messages[idx].content);
      if (!text) return;
      const lang = stylePrefs.turkish ? 'tr-TR' : 'en-US';
      const doSpeak = () => {
        currentUtterance = makeUtterance(text, lang,
          () => { currentUtterance = null; setStatus('Sesli okuma tamamlandi.'); },
          () => { currentUtterance = null; }
        );
        speechSynthesis.speak(currentUtterance);
        setStatus('Sesli okunuyor...');
      };
      if (speechSynthesis.getVoices().length) {
        doSpeak();
      } else {
        speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
      }
    }

    // ---- Pin/Folder
    function togglePin(id) {
      const c = chats.find(x => x.id === id);

      if (c) {
        c.pinned = !c.pinned; saveAll(); renderChatList();
      }
    }

    function promptFolder(id) {
      const c = chats.find(x => x.id === id);
      if (!c) return;
      const folders = [...new Set(chats.filter(x => x.folder).map(x => x.folder))];

      const hint = folders.length > 0 ? `Mevcut: ${folders.join(', ')
        }

      \n` : '';
      const name = prompt(hint + 'Klasor adi (bos birakirsan klasorden cikar):', c.folder || '');
      if (name === null) return;
      c.folder = name.trim() || undefined;
      saveAll(); renderChatList();
    }

    // ---- Auto Title
    async function autoGenerateTitle(chat) {
      try {
        const userMsg = chat.messages.find(m => m.role === 'user');
        if (!userMsg) return;
        const prompt = `Bu mesaj icin 3-5 kelimelik kisa bir baslik uret. Sadece basligi yaz, baska bir sey yazma: "${typeof userMsg.content === 'string' ? userMsg.content.substring(0, 200) : ''}" `;

        const r = await puter.ai.chat([{
          role: 'user', content: prompt
        }

        ], {
          model: 'gpt-4o-mini'
        });

        const title = (r?.message?.content || r?.content || '').trim().replace(/["" "]/g, '').substring(0, 40);
        if (title && title.length > 2) {
          chat.title = title; saveAll(); renderChatList();
        }
      }

      catch (e) {
        /* silent fail */
      }
    }

    // ---- Export
    function openExportModal() {
      const chat = chats.find(c => c.id === currentChatId);

      if (!chat || chat.messages.length === 0) {
        alert('Aktif sohbet yok.'); return;
      }

      const m = $('export-modal'), c = m.querySelector('div');
      m.classList.remove('hidden');

      setTimeout(() => {
        m.classList.remove('opacity-0'); c.classList.remove('scale-95');
      }

        , 10);
    }

    function closeExportModal() {
      const m = $('export-modal'), c = m.querySelector('div');
      m.classList.add('opacity-0'); c.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    async function shareChat(chatId) {
      const id = chatId || currentChatId;
      const chat = chats.find(c => c.id === id);
      if (!chat) return;
      if (!githubUser || !supabaseClient) {
        const payload = JSON.stringify({ title: chat.title, messages: chat.messages.map(m => ({ role: m.role, content: m.content })) });
        const encoded = btoa(unescape(encodeURIComponent(payload)));
        const url = location.origin + location.pathname + '#share=' + encoded;
        navigator.clipboard.writeText(url).then(() => setStatus('Paylasim linki kopyalandi!')).catch(() => prompt('Linki kopyala:', url));
        closeExportModal();
        return;
      }
      setStatus('Link olusturuluyor...');
      const shareId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      const messages = (chat.messages || []).filter(m => !(typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__')));
      const { error } = await supabaseClient.from('shared_chats').insert({
        share_id: shareId,
        user_id: githubUser.id,
        title: chat.title || 'Sohbet',
        messages
      });
      if (error) { console.error('Share error:', error); setStatus('Paylasim basarisiz.'); return; }
      const url = location.origin + location.pathname + '?share=' + shareId;
      navigator.clipboard.writeText(url).then(() => setStatus('Paylasim linki kopyalandi!')).catch(() => prompt('Linki kopyala:', url));
      closeExportModal();
    }

    function loadSharedChat() {
      const shareId = new URLSearchParams(location.search).get('share');
      if (shareId) { showShareView(shareId); return; }
      const hash = location.hash;
      if (!hash.startsWith('#share=')) return;
      try {
        const encoded = hash.slice(7);
        const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        if (!payload.messages) return;
        const sid = 'shared-' + Date.now();
        const sharedChat = { id: sid, title: (payload.title || 'Paylasim') + ' (Paylasim)', messages: payload.messages };
        chats.unshift(sharedChat);
        currentChatId = sid;
        saveAll();
        renderChatList();
        renderMessages(sharedChat.messages);
        history.replaceState(null, '', location.pathname);
        setStatus('Paylasilan sohbet yuklendi.');
      } catch (e) { console.warn('Paylasim yuklenemedi:', e); }
    }

    async function showShareView(shareId) {
      if (!supabaseClient) { setTimeout(() => showShareView(shareId), 400); return; }
      const overlay = document.getElementById('share-overlay');
      const loadingEl = document.getElementById('share-loading');
      const errorEl = document.getElementById('share-error');
      const contentEl = document.getElementById('share-content');
      const titleEl = document.getElementById('share-title');
      const msgsEl = document.getElementById('share-messages');
      if (!overlay) return;
      overlay.classList.remove('hidden');
      if (loadingEl) loadingEl.classList.remove('hidden');
      if (errorEl) errorEl.classList.add('hidden');
      if (contentEl) contentEl.classList.add('hidden');
      const { data, error } = await supabaseClient.from('shared_chats').select('*').eq('share_id', shareId).maybeSingle();
      if (loadingEl) loadingEl.classList.add('hidden');
      if (error || !data) {
        if (errorEl) errorEl.classList.remove('hidden');
        return;
      }
      if (titleEl) titleEl.textContent = data.title || 'Paylasilan Sohbet';
      if (msgsEl) {
        msgsEl.innerHTML = '';
        (data.messages || []).forEach(m => {
          const div = document.createElement('div');
          div.className = m.role === 'user'
            ? 'flex justify-end mb-4'
            : 'flex justify-start mb-4';
          const bubble = document.createElement('div');
          bubble.className = m.role === 'user'
            ? 'max-w-[75%] bg-[#1e1e1e] text-neutral-200 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed'
            : 'max-w-[80%] text-neutral-300 text-sm leading-relaxed';
          bubble.textContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          div.appendChild(bubble);
          msgsEl.appendChild(div);
        });
      }
      if (contentEl) contentEl.classList.remove('hidden');
      history.replaceState(null, '', location.pathname);
    }

    function exportChat(format) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) return;
      let content = '', filename = '', type = 'text/plain';

      if (format === 'md') {
        content = `# ${chat.title
          }

        \n\n`;

        chat.messages.forEach(m => {
          if (m.role === 'user') content += `## Kullanici\n${m.content
            }

            \n\n`;

          else content += `## ${m.model || 'AI'
            }

            \n${m.content
            }

            \n\n`;
        });

        filename = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')
          }

        .md`;
      }

      else if (format === 'json') {
        content = JSON.stringify(chat, null, 2);

        filename = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')
          }

        .json`;
        type = 'application/json';
      }

      else {
        chat.messages.forEach(m => {
          if (m.role === 'user') content += `[Kullanici]: ${m.content
            }

            \n\n`;

          else content += `[${m.model || 'AI'
            }

            ]: ${m.content
            }

            \n\n`;
        });

        filename = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')
          }

        .txt`;
      }

      const blob = new Blob([content], {
        type
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      URL.revokeObjectURL(a.href);
      closeExportModal();
      setStatus('Indirildi: ' + filename);
    }

    function exportChatPDF() {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) return;
      closeExportModal();
      const isLight = document.body.classList.contains('light-mode');
      const bg = isLight ? '#ffffff' : '#0a0a0a';
      const fg = isLight ? '#1a1a2e' : '#e2e8f0';
      const border = isLight ? '#e5e5e5' : '#1e1e1e';
      const userBg = '#2563eb';
      const aiBg = isLight ? '#f7f7f8' : '#111111';

      let rows = '';
      chat.messages.forEach(m => {
        if (m.role === 'system') return;
        if (typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__')) return;
        const role = m.role === 'user' ? 'Kullanici' : (m.model || 'AI');
        const isUser = m.role === 'user';
        const text = (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        const ts = m.ts ? new Date(m.ts).toLocaleString('tr-TR') : '';
        rows += `<div class="msg ${isUser ? 'user-msg' : 'ai-msg'}">
          <div class="msg-header"><span class="role">${role}</span><span class="ts">${ts}</span></div>
          <div class="msg-body">${text}</div>
        </div>`;
      });

      const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${chat.title}</title><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${bg};color:${fg};padding:24px;font-size:13px;line-height:1.6}
        h1{font-size:18px;font-weight:700;margin-bottom:4px;padding-bottom:12px;border-bottom:1px solid ${border}}
        .meta{font-size:11px;color:#888;margin-bottom:20px;padding-top:6px}
        .msg{margin-bottom:16px;padding:14px 16px;border-radius:12px;border:1px solid ${border};background:${aiBg};break-inside:avoid}
        .user-msg{background:#1d3557;border-color:#2563eb33}
        .msg-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#60a5fa}
        .user-msg .role{color:#93c5fd}
        .ts{font-size:10px;color:#666}
        .msg-body{white-space:pre-wrap;word-break:break-word}
        @media print{body{padding:16px}@page{margin:16mm}}
      </style></head><body>
        <h1>${chat.title}</h1>
        <div class="meta">${chat.messages.filter(m => m.role !== 'system').length} mesaj &bull; ${new Date().toLocaleDateString('tr-TR')}</div>
        ${rows}
      </body></html>`;

      const win = window.open('', '_blank');
      if (!win) { setStatus('Popup engellendi. Lutfen izin verin.'); return; }
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
      setStatus('PDF penceresi acildi.');
    }

    // ---- Persona Gallery
    function openPersonaGallery() {
      const g = $('persona-grid');

      g.innerHTML = PERSONAS.map(p => ` <button onclick="setPersona('${escapeJs(p.prompt)}')" class="p-4 bg-white/[0.02] hover:bg-white/[0.06] border border-[#222] rounded-xl text-left transition-all" > <div class="flex items-center gap-2 mb-2" > <span class="text-xl" >${p.icon
        }

        </span> <span class="text-sm font-bold text-white" >${escapeHtml(p.title)
        }

        </span> </div> <div class="text-xs text-neutral-500 line-clamp-3 leading-relaxed" >${escapeHtml(p.prompt)
        }

        </div> </button>`).join('');
      const m = $('persona-modal');
      m.classList.remove('hidden');
      setTimeout(() => m.classList.remove('opacity-0'), 10);
    }

    function setPersona(promptText) {
      stylePrefs.custom = promptText;
      saveAll();
      closePersonaGallery();
      setStatus('Aktif rol degistirildi.');
    }

    function clearPersona() {
      stylePrefs.custom = '';
      saveAll();
      closePersonaGallery();
      setStatus('Rol sifirlandi.');
    }

    function closePersonaGallery() {
      const m = $('persona-modal');
      m.classList.add('opacity-0');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    // ---- Prompt Templates
    function openPromptTemplates() {
      const m = $('prompt-templates-modal'), c = m.querySelector('div');
      m.classList.remove('hidden');

      setTimeout(() => {
        m.classList.remove('opacity-0'); c.classList.remove('scale-95');
      }

        , 10);
      const grid = $('prompt-templates-grid');

      grid.innerHTML = PROMPT_TEMPLATES.map((t, i) => ` <button onclick="useTemplate(${i})" class="p-4 bg-white/[0.02] hover:bg-white/[0.06] border border-[#222] rounded-xl text-left transition-all" > <div class="flex items-center gap-2 mb-2" > <span class="text-lg" >${t.icon
        }

        </span> <span class="${t.color} font-bold text-[11px] uppercase tracking-wider" >${escapeHtml(t.title)
        }

        </span> </div> <div class="text-neutral-500 text-[11px] truncate" >${escapeHtml(t.prompt)
        }

        </div> </button> `).join('');
    }

    function closePromptTemplates() {
      const m = $('prompt-templates-modal'), c = m.querySelector('div');
      m.classList.add('opacity-0'); c.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function useTemplate(idx) {
      const t = PROMPT_TEMPLATES[idx];
      if (!t) return;
      $('user-input').value = t.prompt;
      $('user-input').focus();
      closePromptTemplates();
    }

    // ---- Memory System
    function saveMemory(key, value) {
      memory[key] = value; localStorage.setItem('ai_memory', JSON.stringify(memory));
    }

    function getMemory(key) {
      return memory[key];
    }

    function buildMemoryContext() {
      const keys = Object.keys(memory);
      if (keys.length === 0) return '';

      return '\n[Hafiza: ' + keys.map(k => `${k
        }

        : ${memory[k]
        }

        `).join(', ') + ']';
    }

    // ---- Font Size
    function setFontSize(size) {
      document.body.classList.remove('font-sm', 'font-md', 'font-lg');
      document.body.classList.add('font-' + size);

      // Also set on html element for rem-based sizing
      const sizes = {
        sm: '12px', md: '14px', lg: '16px'
      }

        ;
      document.documentElement.style.fontSize = sizes[size] || '14px';
      prefs.fontSize = size;
      saveAll();

      // Update button states
      ['sm', 'md', 'lg'].forEach(s => {
        const btn = $('font-' + s + '-btn');

        if (btn) {
          btn.style.borderColor = s === size ? '#2563eb' : ''; btn.style.color = s === size ? '#fff' : '';
        }
      });
    }

    // ---- Drag & Drop
    function initDragDrop() {
      let dragCounter = 0;

      document.addEventListener('dragenter', e => {
        e.preventDefault(); dragCounter++; $('drag-overlay')?.classList.remove('hidden');
      });

      document.addEventListener('dragleave', e => {
        e.preventDefault(); dragCounter--; if (dragCounter <= 0) {
          dragCounter = 0; $('drag-overlay')?.classList.add('hidden');
        }
      });
      document.addEventListener('dragover', e => e.preventDefault());

      document.addEventListener('drop', e => {
        e.preventDefault(); dragCounter = 0; $('drag-overlay')?.classList.add('hidden');
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        // Reuse file handling
        const fakeEvent = {
          target: {
            files, value: ''
          }
        }

          ;
        handleFileSelect(fakeEvent);
      });
    }

    // ---- Keyboard Shortcuts
    function initKeyboardShortcuts() {
      document.addEventListener('keydown', e => {
        // Don't intercept when typing in inputs (except special combos)
        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault(); createNewChat();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault(); $('search-input')?.focus();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault(); openSettings();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault(); openExportModal();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
          e.preventDefault(); openPromptTemplates();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault(); toggleChatSearch();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
          e.preventDefault(); openGlobalSearch();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
          e.preventDefault(); toggleNotepad();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
          e.preventDefault(); openCompareMode();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
          e.preventDefault(); $('user-input')?.focus();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === '?') {
          e.preventDefault(); openShortcutsHelp();
        }

        if (e.key === 'Escape') {
          // Close lightbox first
          const lb = $('lightbox-modal');

          if (lb && !lb.classList.contains('hidden')) {
            closeLightbox(); return;
          }

          // Close shortcuts help
          const sh = $('shortcuts-modal');

          if (sh && !sh.classList.contains('hidden')) {
            closeShortcutsHelp(); return;
          }

          closeSettings(); closeExportModal(); closePromptTemplates(); closeCompareModal(); closeCompareResults(); closeStatsModal();
          closeGlobalSearch(); closeSlideModal(); closeReportModal(); closeEditModal();
          if (notepadOpen) toggleNotepad();
          const sb = $('chat-search-bar'); if (sb && !sb.classList.contains('hidden')) toggleChatSearch();
          if (isGenerating) stopGeneration();
          hideSelectionMenu();
          // Close mobile sidebar
          const sidebar = $('sidebar');
          if (sidebar && sidebar.classList.contains('mobile-open')) toggleMobileSidebar();
        }

        // Focus chat input with / when not typing
        if (e.key === '/' && !isInput && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          $('user-input')?.focus();
        }
      });
    }

    // ---- Shortcuts Help Modal
    function openShortcutsHelp() {
      const m = $('shortcuts-modal');
      if (!m) return;
      m.classList.remove('hidden');

      setTimeout(() => {
        m.classList.remove('opacity-0'); m.querySelector('div')?.classList.remove('scale-95');
      }

        , 10);
    }

    function closeShortcutsHelp() {
      const m = $('shortcuts-modal');
      if (!m) return;
      m.classList.add('opacity-0'); m.querySelector('div')?.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    // ---- Image Lightbox
    function openLightbox(src) {
      const m = $('lightbox-modal'), img = $('lightbox-img');
      if (!m || !img) return;
      img.src = src;
      img.style.transform = 'scale(1)';
      m.classList.remove('hidden');
      // Zoom with scroll
      img._zoom = 1;

      img.onwheel = (e) => {
        e.preventDefault();
        img._zoom = Math.max(0.5, Math.min(5, img._zoom + (e.deltaY > 0 ? -0.2 : 0.2)));

        img.style.transform = `scale(${img._zoom
          })`;
      }

        ;
    }

    function closeLightbox() {
      const m = $('lightbox-modal');
      if (m) m.classList.add('hidden');
    }

    function downloadLightboxImage() {
      const img = $('lightbox-img');
      if (!img?.src) return;
      const a = document.createElement('a');
      a.href = img.src;
      a.download = 'image-' + Date.now() + '.png';
      a.click();
    }

    // Attach lightbox to all chat images (called after render)
    function attachLightbox() {
      document.querySelectorAll('#chat-window .prose img').forEach(img => {
        if (img.dataset.lightbox) return;
        img.dataset.lightbox = '1';
        img.style.cursor = 'zoom-in';

        img.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openLightbox(img.src);
        });
      });
    }

    // ---- xterm.js Terminal
    function initCanvasTerminal() {
      if (canvasTerminal) return;

      const container = $('terminal-container');
      if (!container) return;

      if (typeof Terminal === 'undefined') {
        container.innerHTML = '<div style="padding:16px;color:#ff7b72;font-family:monospace;font-size:13px;">xterm.js yuklenemedi. Sayfayi yenileyip tekrar deneyin.</div>';
        return;
      }

      canvasTerminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        theme: {
          background: '#0d0d0d',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          selectionBackground: '#264f78',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#7ee787',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#c9d1d9'
        },
        scrollback: 5000,
        convertEol: true
      });

      if (typeof FitAddon !== 'undefined') {
        canvasTerminalFit = new FitAddon.FitAddon();
        canvasTerminal.loadAddon(canvasTerminalFit);
      }

      canvasTerminal.open(container);
      if (canvasTerminalFit) setTimeout(() => canvasTerminalFit.fit(), 100);
      // Shell emulation
      let cmdBuffer = '';
      const cwd = '/project';
      canvasTerminal.writeln('\x1b[1;34m=== AI Project Terminal ===\x1b[0m');
      canvasTerminal.writeln('\x1b[33mJavaScript, Node.js ve Python kodlarini calistirabilirsiniz.\x1b[0m');
      canvasTerminal.writeln('\x1b[90mKomutlar: node <dosya|kod>, run <file>, js <code>, python <code>, ls, cat, npm, clear, help\x1b[0m');
      termPrompt();

      canvasTerminal.onKey(({ key, domEvent }) => {
        const keyCode = domEvent.keyCode;
        if (keyCode === 13) {
          canvasTerminal.writeln('');
          processTerminalCommand(cmdBuffer.trim());
          cmdBuffer = '';
          termPrompt();
        } else if (keyCode === 8) {
          if (cmdBuffer.length > 0) {
            cmdBuffer = cmdBuffer.slice(0, -1);
            canvasTerminal.write('\b \b');
          }
        } else if (domEvent.ctrlKey && keyCode === 76) {
          canvasTerminal.clear();
          termPrompt();
        } else if (!domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey && key.length === 1) {
          cmdBuffer += key;
          canvasTerminal.write(key);
        }
      });

      window.addEventListener('resize', () => {
        if (canvasTerminalFit) canvasTerminalFit.fit();
      });
    }

    function termPrompt() {
      canvasTerminal.write('\x1b[32m$ \x1b[0m');
    }

    function processTerminalCommand(cmd) {
      if (!cmd) return;
      const parts = cmd.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      if (command === 'help') {
        canvasTerminal.writeln('\x1b[1mKullanilabilir Komutlar:\x1b[0m');
        canvasTerminal.writeln('  \x1b[36mls\x1b[0m              - Dosyalari listele');
        canvasTerminal.writeln('  \x1b[36mcat <dosya>\x1b[0m     - Dosya icerigini goster');
        canvasTerminal.writeln('  \x1b[36mrun <dosya>\x1b[0m     - JS/PY dosyasini calistir');
        canvasTerminal.writeln('  \x1b[36mnode <dosya|kod>\x1b[0m - Node.js dosyasi veya kodu calistir');
        canvasTerminal.writeln('  \x1b[36mjs <kod>\x1b[0m        - JavaScript kodu calistir');
        canvasTerminal.writeln('  \x1b[36mpython <kod>\x1b[0m    - Python kodu calistir (AI ile)');
        canvasTerminal.writeln('  \x1b[36mnpm <komut>\x1b[0m     - npm komutu calistir (AI ile)');
        canvasTerminal.writeln('  \x1b[36mclear\x1b[0m           - Terminali temizle');
      } else if (command === 'clear') {
        canvasTerminal.clear();
      } else if (command === 'ls') {
        const files = Object.keys(canvasFiles);
        if (files.length === 0) canvasTerminal.writeln('\x1b[90m(bos)\x1b[0m');
        else files.forEach(f => canvasTerminal.writeln(` \x1b[36m${f}\x1b[0m`));
      } else if (command === 'cat') {
        if (!args) { canvasTerminal.writeln('\x1b[31mKullanim: cat <dosya>\x1b[0m'); return; }
        const content = canvasFiles[args];
        if (content) canvasTerminal.writeln(content);
        else canvasTerminal.writeln(`\x1b[31mDosya bulunamadi: ${args}\x1b[0m`);
      } else if (command === 'run') {
        if (!args) { canvasTerminal.writeln('\x1b[31mKullanim: run <dosya>\x1b[0m'); return; }
        const content = canvasFiles[args];
        if (!content) {
          canvasTerminal.writeln(`\x1b[31mDosya bulunamadi: ${args}\x1b[0m`);
          const files = Object.keys(canvasFiles);
          if (files.length > 0) {
            canvasTerminal.writeln('\x1b[90mMevcut dosyalar:\x1b[0m');
            files.forEach(f => canvasTerminal.writeln(` \x1b[36m${f}\x1b[0m`));
          } else canvasTerminal.writeln('\x1b[90m(henuz dosya yok - once AI ile kod olusturun)\x1b[0m');
          return;
        }
        if (args.endsWith('.js') || args.endsWith('.mjs')) executeJsInTerminal(content);
        else if (args.endsWith('.py')) executePythonInTerminal(content);
        else canvasTerminal.writeln('\x1b[31mSadece .js ve .py dosyalari calistirilabilir.\x1b[0m');
      } else if (command === 'js' || command === 'javascript') {
        executeJsInTerminal(args);
      } else if (command === 'python' || command === 'py') {
        executePythonViaAI(args);
      } else if (command === 'node') {
        if (!args) { canvasTerminal.writeln('\x1b[31mKullanim: node <dosya.js> veya node <kod>\x1b[0m'); return; }
        const fileContent = canvasFiles[args] || canvasFiles[args.trim()];
        if (fileContent) {
          canvasTerminal.writeln(`\x1b[33mnode ${args} calistiriliyor...\x1b[0m`);
          try {
            const origLog = console.log;
            const origError = console.error;
            const logs = [];
            console.log = (...a) => { logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')); };
            console.error = (...a) => { logs.push('\x1b[31m' + a.map(x => String(x)).join(' ') + '\x1b[0m'); };
            const hasNodeFeatures = /\b(require|process\.|fs\.|path\.|http\.|https\.|child_process|__dirname|__filename|Buffer\.|module\.exports|import\s+.*from)\b/.test(fileContent);
            if (hasNodeFeatures) {
              console.log = origLog; console.error = origError;
              executeNodeViaAI(`Dosya: ${args}\n${fileContent}`);
            } else {
              const result = eval(fileContent);
              console.log = origLog; console.error = origError;
              logs.forEach(l => canvasTerminal.writeln(l));
              if (result !== undefined && logs.length === 0) canvasTerminal.writeln(String(result));
            }
          } catch (e) {
            canvasTerminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
            canvasTerminal.writeln('\x1b[33mAI ile yeniden deneniyor...\x1b[0m');
            executeNodeViaAI(`Dosya: ${args}\n${fileContent}`);
          }
        } else if (args.endsWith('.js') || args.endsWith('.mjs') || args.endsWith('.cjs')) {
          canvasTerminal.writeln(`\x1b[31mDosya bulunamadi: ${args}\x1b[0m`);
          canvasTerminal.writeln('\x1b[90mMevcut dosyalar:\x1b[0m');
          const files = Object.keys(canvasFiles);
          if (files.length === 0) canvasTerminal.writeln('  \x1b[90m(bos - once kod olusturun)\x1b[0m');
          else files.forEach(f => canvasTerminal.writeln(` \x1b[36m${f}\x1b[0m`));
        } else {
          executeNodeViaAI(args);
        }
      } else if (command === 'npm') {
        executeNpmViaAI(args);
      } else {
        const suggestions = { 'nd': 'node', 'nod': 'node', 'nodejs': 'node', 'py': 'python', 'pip': 'npm', 'exec': 'run', 'execute': 'run', 'start': 'run' };
        const suggestion = suggestions[command];
        if (suggestion) canvasTerminal.writeln(`\x1b[33mBelki su komutu denemek istersiniz: \x1b[36m${suggestion} ${args}\x1b[0m`);
        else canvasTerminal.writeln(`\x1b[31mBilinmeyen komut: ${command}\x1b[0m \x1b[90m(help yazin)\x1b[0m`);
      }
    }

    function executeJsInTerminal(code) {
      try {
        const origLog = console.log;
        const logs = [];
        console.log = (...a) => { logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')); };
        const result = eval(code);
        console.log = origLog;
        logs.forEach(l => canvasTerminal.writeln(l));
        if (result !== undefined && logs.length === 0) canvasTerminal.writeln(String(result));
      } catch (e) {
        canvasTerminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
      }
    }

    function executePythonInTerminal(code) {
      executePythonViaAI(code);
    }

    async function executePythonViaAI(code) {
      canvasTerminal.writeln('\x1b[33mPython AI ile calistiriliyor...\x1b[0m');
      try {
        const r = await puter.ai.chat([
          { role: 'system', content: 'Sen bir Python yorumlayicisisin. Verilen kodu calistir ve sadece ciktiyi ver. Aciklama yapma.' },
          { role: 'user', content: `Bu Python kodunu calistir ve ciktiyi ver:\n\`\`\`python\n${code}\n\`\`\`` }
        ], { model: 'gpt-4o-mini' });
        const out = r?.message?.content || r?.content || '';
        canvasTerminal.writeln(out.replace(/```[\s\S]*?```/g, '').trim());
      } catch (e) {
        canvasTerminal.writeln(`\x1b[31mHata: ${e.message}\x1b[0m`);
      }
    }

    async function executeNodeViaAI(code) {
      canvasTerminal.writeln('\x1b[33mNode.js AI ile calistiriliyor...\x1b[0m');
      try {
        const r = await puter.ai.chat([
          { role: 'system', content: 'Sen bir Node.js yorumlayicisisin. Verilen kodu calistir ve sadece ciktisini (output) ver. Aciklama yapma, sadece kodun uretecegi ciktiyi goster. Eger kod bir sunucu olusturuyorsa, baslatma mesajini goster. Eger hata varsa hata mesajini goster.' },
          { role: 'user', content: `Bu Node.js kodunu calistir ve ciktisini ver:\n\`\`\`javascript\n${code}\n\`\`\`` }
        ], { model: 'gpt-4o-mini' });
        const out = (r?.message?.content || r?.content || '').replace(/```[\s\S]*?```/g, '').trim();
        if (out) canvasTerminal.writeln(out);
        else canvasTerminal.writeln('\x1b[90m(cikti yok)\x1b[0m');
      } catch (e) {
        canvasTerminal.writeln(`\x1b[31mHata: ${e.message}\x1b[0m`);
      }
    }

    async function executeNpmViaAI(cmd) {
      canvasTerminal.writeln(`\x1b[33mnpm ${cmd} - AI ile simule ediliyor...\x1b[0m`);
      try {
        const r = await puter.ai.chat([
          { role: 'system', content: 'npm komutlarinin ciktisini simule et. Gercekci terminal ciktisi ver.' },
          { role: 'user', content: `npm ${cmd}` }
        ], { model: 'gpt-4o-mini' });
        canvasTerminal.writeln((r?.message?.content || '').replace(/```[\s\S]*?```/g, '').trim());
      } catch (e) {
        canvasTerminal.writeln(`\x1b[31mHata: ${e.message}\x1b[0m`);
      }
    }

    // ---- Multi-Model Comparison
    function getCompareModelsHtml() {
      const prov = providerSettings.active || 'puter';
      let models = [];

      if (prov === 'puter') {
        models = availableModels.length > 0 ? availableModels : [{
          id: 'gpt-4o-mini'
        }

          , {
          id: 'gpt-4o'
        }

          , {
          id: 'claude-3-5-sonnet'
        }

        ];
      }

      else if (prov === 'custom') {
        if (customModels.length > 0) models = customModels;

        else {
          const mId = providerSettings.custom?.modelId || 'gpt-4o'; models = [{
            id: mId, name: mId
          }

          ];
        }
      }

      else if (prov === 'anthropic') {
        const mId = providerSettings.anthropic?.modelId || 'claude-3-5-sonnet-20241022';

        models = [{
          id: mId
        }

          , {
          id: 'claude-3-5-sonnet-20241022', name: 'claude-3-5-sonnet'
        }

          , {
          id: 'claude-3-opus-20240229', name: 'claude-3-opus'
        }

          , {
          id: 'claude-3-haiku-20240307', name: 'claude-3-haiku'
        }

        ];
      }

      // Remove duplicates
      const seen = new Set();

      models = models.filter(m => {
        if (seen.has(m.id)) return false; seen.add(m.id); return true;
      });

      return models.map(m => `<option value="${escapeHtml(m.id)}" >${escapeHtml(m.name || m.id)
        }

      </option>`).join('');
    }

    function openCompareMode() {
      if (compareActive) {
        exitCompareMode(); return;
      }

      compareActive = true;
      compareMessagesA = [];
      compareMessagesB = [];
      // Hide normal chat, show compare panels
      $('chat-window').classList.add('hidden');
      $('compare-live').classList.remove('hidden');
      $('compare-live-chat-a').innerHTML = '';
      $('compare-live-chat-b').innerHTML = '';
      // Populate model selects with correct provider models
      const modelsHtml = getCompareModelsHtml();
      $('compare-live-model-a').innerHTML = modelsHtml;
      $('compare-live-model-b').innerHTML = modelsHtml;
      // Set B to second model if available
      const optsB = $('compare-live-model-b').options;
      if (optsB.length > 1) optsB[1].selected = true;
      // Show welcome in both panels
      const welcomeHtml = '<div class="flex flex-col items-center justify-center h-full text-center opacity-50"><div class="text-2xl mb-2">⚔️</div><div class="text-xs text-neutral-500">Karsilastirma modu aktif<br>Prompt gonderdiginizde iki model ayni anda yanitlayacak</div></div>';
      $('compare-live-chat-a').innerHTML = welcomeHtml;
      $('compare-live-chat-b').innerHTML = welcomeHtml;

      // Update button style
      document.querySelectorAll('[onclick="openCompareMode()"]').forEach(btn => {
        btn.classList.add('text-orange-400');
        btn.classList.remove('text-neutral-500');
      });
      setStatus('Karsilastirma modu aktif');
    }

    function exitCompareMode() {
      compareActive = false;
      compareMessagesA = [];
      compareMessagesB = [];
      $('chat-window').classList.remove('hidden');
      $('compare-live').classList.add('hidden');

      // Reset button style
      document.querySelectorAll('[onclick="openCompareMode()"]').forEach(btn => {
        btn.classList.remove('text-orange-400');
        btn.classList.add('text-neutral-500');
      });
      setStatus('Normal mod');
    }

    function renderCompareMessage(panelId, role, content) {
      const panel = $(panelId);
      // Remove welcome message on first real message
      if (panel.querySelector('.opacity-50')) panel.innerHTML = '';

      if (role === 'user') {
        const div = document.createElement('div');
        div.className = 'compare-live-msg-user animate-in';

        div.innerHTML = `<div>${escapeHtml(content)
          }

        </div>`;
        panel.appendChild(div);
      }

      else {
        const div = document.createElement('div');
        div.className = 'compare-live-msg-ai animate-in';
        div.innerHTML = `<div class="prose text-neutral-300" >${renderMarkdownHtml(content)
          }

        </div>`;
        panel.appendChild(div);
      }

      panel.scrollTop = panel.scrollHeight;
    }

    function showCompareTyping(panelId) {
      const panel = $(panelId);
      if (panel.querySelector('.opacity-50')) panel.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'compare-live-typing animate-in';
      div.id = panelId + '-typing';
      div.innerHTML = '<div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse"></div><div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse"></div><div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse"></div>';
      panel.appendChild(div);
      panel.scrollTop = panel.scrollHeight;
    }

    function removeCompareTyping(panelId) {
      const el = $(panelId + '-typing');
      if (el) el.remove();
    }

    async function handleCompareSend(text) {
      const modelA = $('compare-live-model-a').value;
      const modelB = $('compare-live-model-b').value;
      const activeProv = providerSettings.active || 'puter';
      // Show user message in both panels
      renderCompareMessage('compare-live-chat-a', 'user', text);
      renderCompareMessage('compare-live-chat-b', 'user', text);

      // Add to history
      compareMessagesA.push({
        role: 'user', content: text
      });

      compareMessagesB.push({
        role: 'user', content: text
      });
      // Show typing indicators
      showCompareTyping('compare-live-chat-a');
      showCompareTyping('compare-live-chat-b');

      const sys = buildSystemPrompt() || "Sen yardimci bir asistansin.";

      const historyA = [{
        role: 'system', content: sys
      }

        , ...compareMessagesA];

      const historyB = [{
        role: 'system', content: sys
      }

        , ...compareMessagesB];

      // Determine call function based on provider
      const callFn = activeProv === 'custom' ? callCustomRouter : activeProv === 'anthropic' ? callAnthropicRouter : callPuterOnce;

      // Run both in parallel
      const promiseA = callFn(modelA, historyA).then(r => {
        removeCompareTyping('compare-live-chat-a');

        compareMessagesA.push({
          role: 'assistant', content: r
        });
        renderCompareMessage('compare-live-chat-a', 'assistant', r);

      }).catch(e => {
        removeCompareTyping('compare-live-chat-a');

        renderCompareMessage('compare-live-chat-a', 'assistant', `Hata: ${e.message
          }

          `);
      });

      const promiseB = callFn(modelB, historyB).then(r => {
        removeCompareTyping('compare-live-chat-b');

        compareMessagesB.push({
          role: 'assistant', content: r
        });
        renderCompareMessage('compare-live-chat-b', 'assistant', r);

      }).catch(e => {
        removeCompareTyping('compare-live-chat-b');

        renderCompareMessage('compare-live-chat-b', 'assistant', `Hata: ${e.message
          }

          `);
      });

      await Promise.allSettled([promiseA, promiseB]);
      playNotificationSound();
    }

    // Legacy modal functions (kept for backward compat)
    function closeCompareModal() {
      const m = $('compare-modal'), c = m.querySelector('div');
      m.classList.add('opacity-0'); c.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function closeCompareResults() {
      $('compare-results')?.classList.add('hidden');
    }

    async function runComparison() {
      const modelA = $('compare-model-a').value;
      const modelB = $('compare-model-b').value;
      const prompt = $('compare-prompt').value.trim();

      if (!prompt) {
        alert('Prompt gerekli.'); return;
      }

      closeCompareModal();

      const resultsEl = $('compare-results');
      resultsEl.classList.remove('hidden');
      $('compare-label-a').textContent = modelA;
      $('compare-label-b').textContent = modelB;
      $('compare-output-a').innerHTML = '<div class="flex items-center gap-2 text-neutral-600"><div class="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse"></div> Uretiliyor...</div>';
      $('compare-output-b').innerHTML = '<div class="flex items-center gap-2 text-neutral-600"><div class="w-1.5 h-1.5 bg-purple-500 rounded-full dot-pulse"></div> Uretiliyor...</div>';
      $('compare-time-a').textContent = '';
      $('compare-time-b').textContent = '';

      const sys = buildSystemPrompt() || "Sen yardimci bir asistansin.";

      const history = [{
        role: 'system', content: sys
      }

        , {
        role: 'user', content: prompt
      }

      ];

      const startA = Date.now();
      const startB = Date.now();

      const promiseA = callPuterOnce(modelA, history).then(r => {
        const elapsed = ((Date.now() - startA) / 1000).toFixed(1);
        $('compare-time-a').textContent = elapsed + 's';
        $('compare-output-a').innerHTML = renderMarkdownHtml(r);

      }).catch(e => {
        $('compare-output-a').innerHTML = `<span class="text-red-400" >Hata: ${escapeHtml(e.message)
          }

        </span>`;
      });

      const promiseB = callPuterOnce(modelB, history).then(r => {
        const elapsed = ((Date.now() - startB) / 1000).toFixed(1);
        $('compare-time-b').textContent = elapsed + 's';
        $('compare-output-b').innerHTML = renderMarkdownHtml(r);

      }).catch(e => {
        $('compare-output-b').innerHTML = `<span class="text-red-400" >Hata: ${escapeHtml(e.message)
          }

        </span>`;
      });

      await Promise.allSettled([promiseA, promiseB]);
      playNotificationSound();
    }

    // ---- Chat Search
    function toggleChatSearch() {
      const bar = $('chat-search-bar');

      if (bar.classList.contains('hidden')) {
        bar.classList.remove('hidden');
        $('chat-search-input')?.focus();
      }

      else {
        bar.classList.add('hidden');
        $('chat-search-input').value = '';
        clearSearchHighlights();
      }
    }

    function searchInChat(query) {
      clearSearchHighlights();

      if (!query || query.length < 2) {
        $('chat-search-count').textContent = ''; return;
      }

      const win = $('chat-window');
      const walker = document.createTreeWalker(win, NodeFilter.SHOW_TEXT);
      let count = 0;
      const q = query.toLowerCase();

      while (walker.nextNode()) {
        const node = walker.currentNode;

        if (node.textContent.toLowerCase().includes(q)) {
          const parent = node.parentElement;

          if (parent && !parent.classList.contains('search-hl')) {
            const html = parent.innerHTML;

            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            parent.innerHTML = html.replace(regex, '<mark class="search-hl" style="background:#f59e0b;color:#000;border-radius:2px;padding:0 2px">$1</mark>');
            count += (parent.innerHTML.match(regex) || []).length;
          }
        }
      }

      $('chat-search-count').textContent = count > 0 ? count + ' sonuc' : 'yok';
      const firstMark = win.querySelector('.search-hl');

      if (firstMark) firstMark.scrollIntoView({
        behavior: 'smooth', block: 'center'
      });
    }

    function clearSearchHighlights() {
      document.querySelectorAll('.search-hl').forEach(m => {
        const parent = m.parentNode;
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });
    }

    // ---- Bookmarks
    function toggleBookmark(idx) {
      const key = currentChatId + '-' + idx;
      const i = bookmarks.indexOf(key);
      if (i >= 0) bookmarks.splice(i, 1); else bookmarks.push(key);
      localStorage.setItem('ai_bookmarks', JSON.stringify(bookmarks));
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) renderMessages(chat.messages);
    }

    // ---- Clipboard Paste
    function initClipboardPaste() {
      document.addEventListener('paste', async e => {
        const items = Array.from(e.clipboardData?.items || []);
        const imageItem = items.find(i => i.type.startsWith('image/'));

        if (imageItem) {
          e.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return;

          const fd = {
            id: Date.now() + Math.random(), name: 'clipboard-' + Date.now() + '.png', type: file.type, file, size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
          }

            ;
          fd.preview = await readFileAsDataURL(file);
          selectedFiles.push(fd);
          renderFilePreviews();
          setStatus('Resim yapistirild.');
        }
      });
    }

    // ---- Notification Sound
    function playNotificationSound() {
      if (!prefs.notifySound) return;

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }

      catch (e) { }
    }

    // ---- Import Chat
    function importChatFromFile() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';

      inp.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const data = JSON.parse(text);

          if (Array.isArray(data)) {
            data.forEach(c => {
              c.id = makeChatId(); chats.push(c);
            });
          }

          else if (data.messages) {
            data.id = makeChatId();
            chats.push(data);
          }

          saveAll(); renderChatList();
          setStatus('Sohbet ice aktarildi.');
        }

        catch (err) {
          alert('JSON formati hatali: ' + err.message);
        }
      }

        ;
      inp.click();
    }

    // ---- Stats
    function openStatsModal() {
      const m = $('stats-modal'), c = m.querySelector('div');
      m.classList.remove('hidden');

      setTimeout(() => {
        m.classList.remove('opacity-0'); c.classList.remove('scale-95');
      }

        , 10);
      let totalMsgs = 0, totalWords = 0, totalChats = chats.length, totalTokens = 0;

      chats.forEach(ch => {
        ch.messages.forEach(msg => {
          totalMsgs++;
          const text = typeof msg.content === 'string' ? msg.content : '';
          totalWords += text.split(/\s+/).filter(Boolean).length;
          totalTokens += Math.ceil(text.length / 4);
        });
      });

      $('stats-content').innerHTML = ` <div class="flex justify-between p-3 bg-white/[0.02] rounded-xl border border-[#222]" > <span class="text-sm text-neutral-400" >Toplam Sohbet</span><span class="text-sm font-bold text-white" >${totalChats
        }

      </span> </div> <div class="flex justify-between p-3 bg-white/[0.02] rounded-xl border border-[#222]" > <span class="text-sm text-neutral-400" >Toplam Mesaj</span><span class="text-sm font-bold text-white" >${totalMsgs
        }

      </span> </div> <div class="flex justify-between p-3 bg-white/[0.02] rounded-xl border border-[#222]" > <span class="text-sm text-neutral-400" >Toplam Kelime</span><span class="text-sm font-bold text-white" >${totalWords.toLocaleString()
        }

      </span> </div> <div class="flex justify-between p-3 bg-white/[0.02] rounded-xl border border-[#222]" > <span class="text-sm text-neutral-400" >Tahmini Token</span><span class="text-sm font-bold text-white" >${totalTokens.toLocaleString()
        }

      </span> </div> <div class="flex justify-between p-3 bg-white/[0.02] rounded-xl border border-[#222]" > <span class="text-sm text-neutral-400" >Yer Imleri</span><span class="text-sm font-bold text-white" >${bookmarks.length
        }

      </span> </div> `;
    }

    function closeStatsModal() {
      const m = $('stats-modal'), c = m.querySelector('div');
      m.classList.add('opacity-0'); c.classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    // ---- Accent Color
    function setAccent(color) {
      document.body.classList.remove('accent-green', 'accent-purple', 'accent-red', 'accent-amber', 'accent-cyan');
      if (color !== 'blue') document.body.classList.add('accent-' + color);
      prefs.accent = color;
      saveAll();
      updateAccentButtons(color);
    }

    function updateAccentButtons(color) {
      document.querySelectorAll('[data-accent-color]').forEach(btn => {
        const c = btn.dataset.accentColor;
        const active = c === color;
        btn.style.outline = active ? '2px solid white' : '';
        btn.style.outlineOffset = active ? '2px' : '';
        btn.style.transform = active ? 'scale(1.2)' : '';
      });
    }

    // ---- Text Selection Context Menu
    function initSelectionMenu() {
      document.addEventListener('mouseup', e => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();

        if (text && text.length > 3 && $('chat-window')?.contains(sel.anchorNode)) {
          const menu = $('selection-menu');
          menu.classList.remove('hidden');
          menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
          menu.style.top = (e.clientY - 44) + 'px';
          menu.dataset.text = text;
        }

        else {
          hideSelectionMenu();
        }
      });
    }

    function hideSelectionMenu() {
      $('selection-menu')?.classList.add('hidden');
    }

    function selectionAction(action) {
      const text = $('selection-menu')?.dataset.text;
      hideSelectionMenu();
      if (!text) return;
      const inp = $('user-input');

      if (action === 'copy') {
        navigator.clipboard.writeText(text); setStatus('Kopyalandi.'); return;
      }

      const prompts = {
        translate: 'Bu metni Ingilizceye cevir: ', explain: 'Bu metni acikla: ', summarize: 'Bu metni ozetle: '
      }

        ;
      inp.value = (prompts[action] || '') + '"' + text.substring(0, 500) + '"';
      inp.focus();
      handleSend();
    }

    // ---- Event Listeners
    $('new-chat-btn')?.addEventListener('click', createNewChat);
    $('settings-btn')?.addEventListener('click', openSettings);
    $('reset-btn')?.addEventListener('click', clearAllData);
    $('send-btn')?.addEventListener('click', handleSend);
    $('stop-btn')?.addEventListener('click', stopGeneration);
    $('upload-btn')?.addEventListener('click', () => $('file-input').click());
    $('screen-capture-btn')?.addEventListener('click', handleScreenCapture);
    $('ocr-btn')?.addEventListener('click', toggleOcr);
    $('file-input')?.addEventListener('change', handleFileSelect);
    $('export-chat-btn')?.addEventListener('click', openExportModal);

    $('user-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); handleSend();
      }
    });

    const tx = $('user-input');

    if (tx) {
      tx.addEventListener('input', function () {
        this.style.height = 'auto';
        const h = Math.min(this.scrollHeight, 192);
        this.style.height = h + 'px';
        this.style.overflowY = this.scrollHeight > 192 ? 'auto' : 'hidden';
      });
    }

    $('provider-select')?.addEventListener('change', updateProviderFields);

    $('preconfigured-urls')?.addEventListener('change', async e => {
      const val = e.target.value;

      if (val && PRECONFIGURED_PROVIDERS[val]) {
        $('custom-url').value = PRECONFIGURED_PROVIDERS[val]; await manualFetchCustomModels(e.target);
      }
    });

    // ---- Canvas / Artifact System
    let canvasFiles = {}

      ;
    let canvasHistory = [];
    let canvasHistoryIndex = -1;
    let canvasActiveFile = null;
    let canvasOpen = false;

    function getFileIcon(filename) {
      const ext = filename.split('.').pop().toLowerCase();

      const map = {
        'html': ['S', 'ft-icon-html'], 'htm': ['S', 'ft-icon-html'],
        'css': ['#', 'ft-icon-css'],
        'js': ['JS', 'ft-icon-js'], 'mjs': ['JS', 'ft-icon-js'],
        'ts': ['TS', 'ft-icon-ts'],
        'tsx': ['TX', 'ft-icon-tsx'], 'jsx': ['TX', 'ft-icon-tsx'],
        'json': ['{}', 'ft-icon-json'],
        'py': ['Py', 'ft-icon-py'],
        'cpp': ['C+', 'ft-icon-cpp'], 'cc': ['C+', 'ft-icon-cpp'], 'cxx': ['C+', 'ft-icon-cpp'],
        'c': ['C', 'ft-icon-c'],
        'h': ['H', 'ft-icon-h'], 'hpp': ['H+', 'ft-icon-hpp'],
        'java': ['Jv', 'ft-icon-java'],
        'rs': ['Rs', 'ft-icon-rs'],
        'go': ['Go', 'ft-icon-go'],
        'rb': ['Rb', 'ft-icon-rb'],
        'php': ['Ph', 'ft-icon-php'],
        'sh': ['Sh', 'ft-icon-sh'], 'bash': ['Sh', 'ft-icon-sh'],
        'md': ['M', 'ft-icon-md'],
        'txt': ['Tx', 'ft-icon-default'],
      }

        ;
      return map[ext] || [ext.substring(0, 2).toUpperCase(), 'ft-icon-default'];
    }

    function updateCanvasToggleBtn() {
      const btn = $('canvas-toggle-btn');
      if (!btn) return;
      const hasFiles = Object.keys(canvasFiles).length > 0;
      btn.classList.toggle('hidden', !hasFiles && !canvasOpen);
      btn.classList.toggle('text-teal-400', canvasOpen);
      btn.classList.toggle('bg-teal-500/10', canvasOpen);
      btn.classList.toggle('text-neutral-500', !canvasOpen);
    }

    function toggleCanvasPanel() {
      if (canvasOpen) {
        closeCanvas();
      } else if (Object.keys(canvasFiles).length > 0) {
        openCanvas();
        renderCanvasFileTree();
        const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
        if (htmlFile) { selectCanvasFile(htmlFile); updateCanvasPreview(canvasFiles[htmlFile]); switchCanvasTab('preview'); }
        else if (canvasActiveFile) selectCanvasFile(canvasActiveFile);
      } else {
        setStatus('Canvas icerigi yok.');
      }
    }

    function openCanvas() {
      const panel = $('canvas-panel');
      const headerActionBtns = $('header-action-btns');
      panel.classList.remove('hidden');

      if (headerActionBtns) {
        headerActionBtns.style.display = 'none';
      }

      canvasOpen = true;
      updateCanvasToggleBtn();
      localStorage.setItem(KEY_CANVAS_STATE, JSON.stringify({ open: true, chatId: currentChatId }));
    }

    function closeCanvas() {
      const panel = $('canvas-panel');
      const headerActionBtns = $('header-action-btns');
      panel.classList.add('hidden');

      if (headerActionBtns) {
        headerActionBtns.style.display = '';
      }

      canvasOpen = false;
      const curChat = chats.find(x => x.id === currentChatId);
      if (curChat && Object.keys(canvasFiles).length > 0) {
        curChat.canvas = JSON.parse(JSON.stringify(canvasFiles));
        saveAll();
      }
      localStorage.setItem(KEY_CANVAS_STATE, JSON.stringify({ open: false, chatId: currentChatId }));
      updateCanvasToggleBtn();
    }

    function switchCanvasTab(tab) {
      const previewTab = $('canvas-tab-preview');
      const codeTab = $('canvas-tab-code');
      const terminalTab = $('canvas-tab-terminal');
      const diffTab = $('canvas-tab-diff');
      const previewView = $('canvas-preview-view');
      const codeView = $('canvas-code-view');
      const terminalView = $('canvas-terminal-view');
      const diffView = $('canvas-diff-view');

      [previewTab, codeTab, terminalTab, diffTab].forEach(el => el?.classList.remove('active'));
      [previewView, codeView, terminalView, diffView].forEach(el => el?.classList.add('hidden'));

      if (tab === 'preview') {
        previewTab?.classList.add('active');
        previewView?.classList.remove('hidden');
      } else if (tab === 'terminal') {
        terminalTab?.classList.add('active');
        terminalView?.classList.remove('hidden');
        initCanvasTerminal();
        if (canvasTerminalFit) setTimeout(() => canvasTerminalFit.fit(), 50);
      } else if (tab === 'diff') {
        diffTab?.classList.add('active');
        diffView?.classList.remove('hidden');
        renderCanvasDiff();
      } else {
        codeTab?.classList.add('active');
        codeView?.classList.remove('hidden');
      }
    }

    function computeLineDiff(oldText, newText) {
      const oldLines = oldText.split('\n');
      const newLines = newText.split('\n');
      const result = [];
      let oi = 0, ni = 0;
      while (oi < oldLines.length || ni < newLines.length) {
        if (oi >= oldLines.length) {
          result.push({ type: 'add', line: newLines[ni++] });
        } else if (ni >= newLines.length) {
          result.push({ type: 'del', line: oldLines[oi++] });
        } else if (oldLines[oi] === newLines[ni]) {
          result.push({ type: 'same', line: oldLines[oi] });
          oi++; ni++;
        } else {
          const lookAhead = 6;
          let found = false;
          for (let d = 1; d <= lookAhead && !found; d++) {
            if (ni + d < newLines.length && oldLines[oi] === newLines[ni + d]) {
              for (let k = 0; k < d; k++) result.push({ type: 'add', line: newLines[ni + k] });
              ni += d; found = true;
            } else if (oi + d < oldLines.length && newLines[ni] === oldLines[oi + d]) {
              for (let k = 0; k < d; k++) result.push({ type: 'del', line: oldLines[oi + k] });
              oi += d; found = true;
            }
          }
          if (!found) {
            result.push({ type: 'del', line: oldLines[oi++] });
            result.push({ type: 'add', line: newLines[ni++] });
          }
        }
      }
      return result;
    }

    function renderCanvasDiff() {
      const container = $('canvas-diff-content');
      if (!container) return;
      if (canvasHistoryIndex <= 0 || canvasHistory.length < 2) {
        container.innerHTML = '<div style="color:#8b949e;text-align:center;padding:40px 0;">Diff gormek icin onceki bir versiyon olmalidir.<br>Kodu degistirdikten sonra Diff tabina gecin.</div>';
        return;
      }
      const prevFiles = canvasHistory[canvasHistoryIndex - 1];
      const currFiles = canvasHistory[canvasHistoryIndex];
      const allFiles = new Set([...Object.keys(prevFiles), ...Object.keys(currFiles)]);
      let html = '';
      allFiles.forEach(fname => {
        const oldText = prevFiles[fname] || '';
        const newText = currFiles[fname] || '';
        if (oldText === newText) return;
        const diff = computeLineDiff(oldText, newText);
        let fileHtml = '';
        let lineOld = 1, lineNew = 1;
        diff.forEach(d => {
          const esc = d.line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (d.type === 'same') {
            fileHtml += `<div style="color:#8b949e;padding:0 4px;white-space:pre;display:flex;gap:4px"><span style="min-width:44px;color:#444;user-select:none;flex-shrink:0;text-align:right;padding-right:4px">${lineOld++}</span><span style="min-width:44px;color:#444;user-select:none;flex-shrink:0;text-align:right;padding-right:8px">${lineNew++}</span><span>${esc}</span></div>`;
          } else if (d.type === 'add') {
            fileHtml += `<div style="background:#0d2818;color:#3fb950;padding:0 4px;white-space:pre;display:flex;gap:4px"><span style="min-width:44px;color:#1e4d32;user-select:none;flex-shrink:0;text-align:right;padding-right:4px"> </span><span style="min-width:44px;color:#1e4d32;user-select:none;flex-shrink:0;text-align:right;padding-right:8px">${lineNew++}</span><span style="color:#3fb950">+ ${esc}</span></div>`;
          } else {
            fileHtml += `<div style="background:#2d1117;color:#f85149;padding:0 4px;white-space:pre;display:flex;gap:4px"><span style="min-width:44px;color:#6b2226;user-select:none;flex-shrink:0;text-align:right;padding-right:4px">${lineOld++}</span><span style="min-width:44px;color:#6b2226;user-select:none;flex-shrink:0;text-align:right;padding-right:8px"> </span><span style="color:#f85149">- ${esc}</span></div>`;
          }
        });
        html += `<div style="margin-bottom:16px;min-width:max-content">
          <div style="background:#161b22;border:1px solid #30363d;border-radius:8px 8px 0 0;padding:7px 12px;font-size:11px;color:#8b949e;display:flex;align-items:center;gap:8px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span style="color:#e6edf3;font-weight:600">${fname}</span>
          </div>
          <div style="border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;overflow:hidden">${fileHtml || '<div style="padding:8px;color:#8b949e">Fark yok</div>'}</div>
        </div>`;
      });
      container.innerHTML = html || '<div style="color:#8b949e;text-align:center;padding:40px 0;">Bu versiyon ile onceki arasinda fark bulunamadi.</div>';
    }

    function buildCanvasPreviewHtml(htmlContent) {
      const cssFiles = Object.keys(canvasFiles).filter(f => f.endsWith('.css'));
      const jsFiles = Object.keys(canvasFiles).filter(f => f.endsWith('.js'));
      const cssContent = cssFiles.map(f => `/* ${f} */\n${canvasFiles[f] || ''}`).join('\n\n');
      const jsContent = jsFiles.map(f => `/* ${f} */\n${canvasFiles[f] || ''}`).join('\n\n');

      let html = htmlContent || '';

      // Remove external CSS/JS references that point to local project files (won't work in srcdoc)
      if (cssFiles.length > 0) {
        cssFiles.forEach(f => {
          const fname = f.split('/').pop();
          const linkRegex = new RegExp(`<link[^>]*href=["'](?:\\.?\\/?)${fname.replace('.', '\\.')}[" '][^>]*>`, 'gi');
          html = html.replace(linkRegex, '');
        });
      }

      if (jsFiles.length > 0) {
        jsFiles.forEach(f => {
          const fname = f.split('/').pop();
          const scriptRegex = new RegExp(`<script[^>]*src=["'](?:\\.?\\/?)${fname.replace('.', '\\.')}[" '][^>]*>\\s*<\\/script>`, 'gi');
          html = html.replace(scriptRegex, '');
        });
      }

      const hasHtml = /<html[\s>]/i.test(html);
      const hasHead = /<head[\s>]/i.test(html);
      const hasBody = /<body[\s>]/i.test(html);

      const styleTag = cssContent ? `<style>\n${cssContent}\n</style>` : '';
      const scriptTag = jsContent ? `<script>\n${jsContent}\n<\/script>` : '';

      if (!hasHtml) {
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${styleTag}</head><body>${html}${scriptTag}</body></html>`;
        return html;
      }

      if (styleTag) {
        if (hasHead) html = html.replace(/<\/head>/i, `${styleTag}</head>`);
        else html = html.replace(/<html[^>]*>/i, match => `${match}<head>${styleTag}</head>`);
      }

      if (scriptTag) {
        if (hasBody) html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
        else html = html.replace(/<\/html>/i, `${scriptTag}</html>`);
      }

      return html;
    }


    function renderCanvasFileTree() {
      const tree = $('canvas-file-tree');
      if (!tree) return;
      tree.innerHTML = '<div class="ft-title">Files</div>';

      // Group files by folder
      const folders = {};
      const rootFiles = [];
      Object.keys(canvasFiles).forEach(path => {
        if (path.includes('/')) {
          const parts = path.split('/');
          const folder = parts[0];
          if (!folders[folder]) folders[folder] = [];
          folders[folder].push(path);
        } else {
          rootFiles.push(path);
        }
      });

      // Render folders
      Object.keys(folders).sort().forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = 'canvas-file-item folder';
        folderEl.innerHTML = `<span class="canvas-file-icon ft-icon-folder">&#128193;</span><span>${escapeHtml(folder)}</span>`;
        tree.appendChild(folderEl);

        folders[folder].sort().forEach(path => {
          const filename = path.split('/').pop();
          const [iconText, iconClass] = getFileIcon(filename);
          const el = document.createElement('div');
          el.className = `canvas-file-item${path === canvasActiveFile ? ' active' : ''}`;
          el.style.paddingLeft = '32px';
          el.innerHTML = `<span class="canvas-file-icon ${iconClass}">${iconText}</span><span>${escapeHtml(filename)}</span>`;
          el.onclick = () => selectCanvasFile(path);
          tree.appendChild(el);
        });
      });

      // Root files
      rootFiles.sort().forEach(path => {
        const [iconText, iconClass] = getFileIcon(path);
        const el = document.createElement('div');
        el.className = `canvas-file-item${path === canvasActiveFile ? ' active' : ''}`;
        el.innerHTML = `<span class="canvas-file-icon ${iconClass}">${iconText}</span><span>${escapeHtml(path)}</span>`;
        el.onclick = () => selectCanvasFile(path);
        tree.appendChild(el);
      });

      // Quick file buttons
      const quickFiles = $('canvas-quick-files');
      if (quickFiles) {
        const mainFiles = Object.keys(canvasFiles).filter(f => /\.(html|css|js|tsx|jsx|py|cpp|c|java|rs|go|json)$/.test(f)).slice(0, 5);
        quickFiles.innerHTML = mainFiles.map(f => {
          const [iconText, iconClass] = getFileIcon(f);
          return `<button class="canvas-quick-file" onclick="selectCanvasFile('${escapeJs(f)}'); switchCanvasTab('code')"><span class="canvas-file-icon ${iconClass}">${iconText}</span>${escapeHtml(f)}</button>`;
        }).join('');
      }
    }

    function selectCanvasFile(path) {
      canvasActiveFile = path;
      const code = canvasFiles[path] || '';
      const pre = $('canvas-code-pre');
      if (pre) pre.textContent = code;
      renderCanvasFileTree();

      // Update preview when any web file is selected
      const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
      if (htmlFile) {
        updateCanvasPreview(canvasFiles[htmlFile]);
      }
    }

    function updateCanvasPreview(htmlContent) {
      const iframe = $('canvas-iframe');
      const empty = $('canvas-preview-empty');
      if (iframe && empty) {
        const nextSrcdoc = buildCanvasPreviewHtml(htmlContent);
        if (nextSrcdoc === lastCanvasPreviewSrcdoc) return;
        lastCanvasPreviewSrcdoc = nextSrcdoc;
        empty.classList.add('hidden');
        iframe.classList.remove('hidden');
        iframe.srcdoc = nextSrcdoc;
      }
    }


    function openCanvasInNewTab() {
      const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
      if (htmlFile) {
        // Build complete HTML with CSS/JS injected
        const fullHtml = buildCanvasPreviewHtml(canvasFiles[htmlFile]);
        const blob = new Blob([fullHtml], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        // Non-web project: open first file as text
        const first = Object.keys(canvasFiles)[0];
        if (first) {
          const blob = new Blob([canvasFiles[first]], { type: 'text/plain' });
          window.open(URL.createObjectURL(blob), '_blank');
        }
      }
    }

    function downloadCanvasProject() {
      const files = Object.keys(canvasFiles);
      if (files.length === 0) return;
      if (files.length === 1) {
        const blob = new Blob([canvasFiles[files[0]]], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = files[0]; a.click();
      } else {
        // Download all files as individual downloads
        files.forEach(f => {
          const blob = new Blob([canvasFiles[f]], { type: 'text/plain' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f; a.click();
        });
      }
    }

    // Extract code blocks from AI response and populate canvas
    function extractCanvasFromResponse(content) {
      const codeBlocks = [];
      const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lang = (match[1] || '').toLowerCase();
        const code = match[2].trim();
        if (code.length > 10) { // Only non-trivial code blocks
          codeBlocks.push({ lang, code });
        }
      }

      if (codeBlocks.length === 0) return false;

      const prevCanvasFiles = { ...canvasFiles };
      const newFiles = {};
      let hasHtml = false;

      codeBlocks.forEach((block, idx) => {
        let filename;
        const ext = block.lang || 'txt';
        if (ext === 'html' || ext === 'htm') { filename = 'index.html'; hasHtml = true; }
        else if (ext === 'css') filename = 'index.css';
        else if (ext === 'javascript' || ext === 'js') filename = codeBlocks.length > 3 ? `src/main.js` : 'script.js';
        else if (ext === 'typescript' || ext === 'ts') filename = 'src/main.ts';
        else if (ext === 'tsx') filename = 'src/App.tsx';
        else if (ext === 'jsx') filename = 'src/App.jsx';
        else if (ext === 'python' || ext === 'py') filename = 'main.py';
        else if (ext === 'cpp' || ext === 'c++' || ext === 'cc' || ext === 'cxx') filename = canvasFiles['main.cpp'] ? `file_${idx}.cpp` : 'main.cpp';
        else if (ext === 'c') filename = canvasFiles['main.c'] ? `file_${idx}.c` : 'main.c';
        else if (ext === 'h' || ext === 'hpp') filename = `header${idx > 0 ? idx : ''}.${ext}`;
        else if (ext === 'java') filename = 'Main.java';
        else if (ext === 'rust' || ext === 'rs') filename = 'main.rs';
        else if (ext === 'go' || ext === 'golang') filename = 'main.go';
        else if (ext === 'ruby' || ext === 'rb') filename = 'main.rb';
        else if (ext === 'php') filename = 'index.php';
        else if (ext === 'bash' || ext === 'sh' || ext === 'shell') filename = 'script.sh';
        else if (ext === 'json') filename = idx === 0 ? 'package.json' : 'config.json';
        else filename = `file${idx > 0 ? idx : ''}.${ext}`;

        // Avoid duplicate names
        if (newFiles[filename]) filename = `${filename.split('.')[0]}_${idx}.${ext}`;
        newFiles[filename] = block.code;
      });

      // Merge new files into existing canvas (preserves files not mentioned in this response)
      canvasFiles = { ...prevCanvasFiles, ...newFiles };

      // If there's a standalone HTML with full content, try to detect project structure
      if (hasHtml && codeBlocks.length >= 3) {
        // Check for React/Vite project patterns
        const hasReactLike = codeBlocks.some(b => b.code.includes('import React') || b.code.includes('createRoot') || b.code.includes('tsx'));
        if (hasReactLike) {
          // Reorganize
          const reactFiles = {};
          Object.keys(canvasFiles).forEach(f => {
            if (!f.startsWith('src/') && !f.endsWith('.html') && !f.endsWith('.json')) {
              reactFiles['src/' + f] = canvasFiles[f];
            } else {
              reactFiles[f] = canvasFiles[f];
            }
          });
          canvasFiles = reactFiles;
        }
      }

      if (!hasHtml && canvasFiles['main.py']) {
        hasHtml = true;
        const b64Code = btoa(unescape(encodeURIComponent(canvasFiles['main.py'] || '')));
        canvasFiles['index.html'] = `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"><\/script>
</head>

<body style="background:#111; color:#fff; font-family:monospace; padding:16px;">
  <h3 style="color:#a855f7; margin-top:0;">Python Runner (Pyodide)</h3>
  <div id="output"
    style="white-space:pre-wrap; background:#000; padding:12px; border-radius:8px; border:1px solid #333;">Pyodide
    yukleniyor... Lutfen bekleyin.</div>
  <script>
    async function main() {
      const out = document.getElementById('output');
      try {
        let pyodide = await loadPyodide();
        out.innerText = "Script calistiriliyor...\\n\\n";
        pyodide.setStdout({ batched: (msg) => { out.innerText += msg + "\\n"; } });
        const code = decodeURIComponent(escape(atob("${b64Code}")));
        await pyodide.runPythonAsync(code);
        out.innerText += "\\n\\n[Bitti]";
      } catch(e) {
        out.innerText += '\\n\\nHATA:\\n' + e;
      }
    }
    main();
  <\/script>
</body>
</html>`;
      }

      if (canvasHistoryIndex < canvasHistory.length - 1) {
        canvasHistory = canvasHistory.slice(0, canvasHistoryIndex + 1);
      }
      canvasHistory.push(JSON.parse(JSON.stringify(canvasFiles)));
      canvasHistoryIndex++;
      updateCanvasHistoryUI();

      syncToLocalFolder();
      return true;
    }

    function updateCanvasHistoryUI() {
      const btnBack = document.getElementById('canvas-hist-back');
      const btnFwd = document.getElementById('canvas-hist-fwd');
      if (btnBack) btnBack.disabled = canvasHistoryIndex <= 0;
      if (btnFwd) btnFwd.disabled = canvasHistoryIndex >= canvasHistory.length - 1;

      if (btnBack) btnBack.style.opacity = canvasHistoryIndex <= 0 ? '0.3' : '1';
      if (btnFwd) btnFwd.style.opacity = canvasHistoryIndex >= canvasHistory.length - 1 ? '0.3' : '1';
    }

    function undoCanvas() {
      if (canvasHistoryIndex > 0) {
        canvasHistoryIndex--;
        canvasFiles = JSON.parse(JSON.stringify(canvasHistory[canvasHistoryIndex]));
        updateCanvasHistoryUI();
        finalizeCanvas('', true);
      }
    }

    function redoCanvas() {
      if (canvasHistoryIndex < canvasHistory.length - 1) {
        canvasHistoryIndex++;
        canvasFiles = JSON.parse(JSON.stringify(canvasHistory[canvasHistoryIndex]));
        updateCanvasHistoryUI();
        finalizeCanvas('', true);
      }
    }

    async function deployCanvasProject() {
      if (typeof puter !== 'undefined' && puter.auth && !puter.auth.isSignedIn()) {
        alert("Yayına almak için ayarlardan Puter ile giriş yapmalısınız. (Mobil WebView'de bu ekran popup gerektirebilir)");
        return;
      }
      const files = Object.keys(canvasFiles);
      if (files.length === 0) return;

      const btn = document.getElementById('deploy-canvas-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Yayinlaniyor...`;
      btn.disabled = true;

      try {
        const siteName = "app-" + Math.random().toString(36).substr(2, 6);
        await puter.fs.mkdir(siteName);

        const hasHtmlFile = files.some(f => f.endsWith('.html'));
        const hasSeparateCssOrJs = files.some(f => f.endsWith('.css') || f.endsWith('.js'));

        if (hasHtmlFile && hasSeparateCssOrJs) {
          const htmlKey = files.find(f => f === 'index.html') || files.find(f => f.endsWith('.html'));
          const inlinedHtml = buildCanvasPreviewHtml(canvasFiles[htmlKey]);
          await puter.fs.write(`${siteName}/index.html`, inlinedHtml);
        } else {
          for (const f of files) {
            const parts = f.split('/');
            if (parts.length > 1) {
              const dir = parts.slice(0, -1).join('/');
              try { await puter.fs.mkdir(`${siteName}/${dir}`, { createMissingParents: true }); } catch (_) { }
            }
            await puter.fs.write(`${siteName}/${f}`, canvasFiles[f]);
          }
        }

        const site = await puter.hosting.create(siteName, siteName);

        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Yayinlandi`;
        setTimeout(() => {
          window.open(`https://${site.subdomain}.puter.site`, '_blank');
          btn.innerHTML = originalText;
          btn.disabled = false;
        }, 1500);
      } catch (e) {
        console.error("Deploy Hatasi:", e);
        alert("Yayinlama basarisiz: " + e.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    async function connectLocalFolder() {
      try {
        if (!window.showDirectoryPicker) {
          alert('Tarayiciniz File System Access API desteklemiyor (Chrome/Edge kullanin).');
          return;
        }
        window.localDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setStatus('Klasor baglandi: ' + window.localDirectoryHandle.name);
        syncToLocalFolder(); // sync immediately if there are files
      } catch (e) { setStatus('Klasor secilmedi.'); }
    }

    async function syncToLocalFolder() {
      if (!window.localDirectoryHandle || !canvasFiles) return;
      try {
        let savedItems = 0;
        for (const [name, content] of Object.entries(canvasFiles)) {
          // Basic path sanitizer for flat structure support
          const safeName = name.replace(/\\\//g, '_').replace(/\\\\/g, '_');
          const fh = await window.localDirectoryHandle.getFileHandle(safeName, { create: true });
          const writable = await fh.createWritable();
          await writable.write(content);
          await writable.close();
          savedItems++;
        }
        setStatus('Dosyalar (' + savedItems + ') klasore kaydedildi.');
      } catch (e) { console.error('Senkronizasyon hatasi:', e); setStatus('Senkronizasyon hatasi. Izinleri kontrol edin.'); }
    }

    function showCanvasBuilding() {
      openCanvas();
      const empty = $('canvas-preview-empty');
      const iframe = $('canvas-iframe');
      if (empty) {
        empty.innerHTML = `
<div class="canvas-building">
  <div class="canvas-building-blocks">
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
  </div>
</div>
<div style="margin-top:16px">
  <div class="text-lg font-bold text-neutral-300 mb-1">Building...</div>
  <div class="text-sm text-neutral-600">Preview will appear when agent is done working</div>
</div>`;
        empty.classList.remove('hidden');
      }
      if (iframe) iframe.classList.add('hidden');
    }

    function finalizeCanvas(content, skipExtract) {
      if (!skipExtract) {
        const hasBlocks = extractCanvasFromResponse(content);
        if (!hasBlocks) return;
      }

      openCanvas();
      renderCanvasFileTree();

      // Auto-select and preview HTML file
      const htmlFile = Object.keys(canvasFiles).find(f => f.endsWith('.html'));
      if (htmlFile) {
        selectCanvasFile(htmlFile);
        updateCanvasPreview(canvasFiles[htmlFile]);
        switchCanvasTab('preview');
      } else {
        const first = Object.keys(canvasFiles)[0];
        if (first) selectCanvasFile(first);
        switchCanvasTab('code');
      }

      const curChat = chats.find(x => x.id === currentChatId);
      if (curChat) { curChat.canvas = JSON.parse(JSON.stringify(canvasFiles)); saveAll(); }
    }

    // ---- Deep Research System
    async function deepResearch(query) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) return;

      const modA = $('model-a')?.value || 'gpt-4o-mini';
      const activeProv = providerSettings.active || 'puter';

      // Create research steps UI
      const win = $('chat-window');
      const researchDiv = document.createElement('div');
      researchDiv.className = 'flex flex-col gap-2 w-full animate-in';
      researchDiv.id = 'research-progress';
      researchDiv.innerHTML = `
        <div class="flex items-center gap-2.5 px-1">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white">DR</div>
          <span class="text-[11px] text-purple-400 font-semibold">Deep Research</span>
        </div>
        <div class="pl-[34px]" id="research-steps"></div>`;
      win.appendChild(researchDiv);
      win.scrollTop = win.scrollHeight;

      const stepsEl = $('research-steps');
      function addStep(title, detail, done) {
        const step = document.createElement('div');
        step.className = `research-step ${done ? 'done' : ''}`;
        step.innerHTML = `<div class="step-title">${escapeHtml(title)}</div><div>${escapeHtml(detail)}</div>`;
        stepsEl.appendChild(step);
        win.scrollTop = win.scrollHeight;
        return step;
      }

      try {
        addStep('Sorgu analiz ediliyor', query, true);
        setStatus('Deep Research: Analiz...');

        const subQPrompt = `Kullanici su konuyu derin arastirmak istiyor: "${query}"\nBu konu hakkinda kapsamli bir arastirma yapmak icin 4-5 alt soru/arastirma konusu olustur. Sadece sorulari numarali liste olarak yaz.`;

        let subQs;
        if (activeProv === 'puter') {
          subQs = await callPuterOnce(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: subQPrompt }]);
        } else if (activeProv === 'custom') {
          subQs = await callCustomRouter(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: subQPrompt }]);
        } else if (activeProv === 'anthropic') {
          subQs = await callAnthropicRouter(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: subQPrompt }]);
        }

        addStep('Alt sorular olusturuldu', subQs.substring(0, 200), true);
        setStatus('Deep Research: Alt sorular...');

        const subQuestions = subQs.split('\n').filter(l => l.trim().match(/^\d/)).slice(0, 4);
        const findings = [];

        for (let i = 0; i < subQuestions.length; i++) {
          const sq = subQuestions[i].replace(/^\d+[\.\)]\s*/, '').trim();
          const stepEl = addStep(`Arastiriliyor (${i + 1}/${subQuestions.length})`, sq, false);
          setStatus(`Deep Research: ${i + 1}/${subQuestions.length}...`);
          const researchPrompt = `Su konu hakkinda detayli bilgi ver: "${sq}" . Kisa ama bilgilendirici ol. Turkce yaz.`;
          let finding;

          if (activeProv === 'puter') {
            finding = await callPuterOnce(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: researchPrompt }]);
          } else if (activeProv === 'custom') {
            finding = await callCustomRouter(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: researchPrompt }]);
          } else if (activeProv === 'anthropic') {
            finding = await callAnthropicRouter(modA, [{ role: 'system', content: 'Sen bir arastirma asistanis.' }, { role: 'user', content: researchPrompt }]);
          }

          findings.push({ question: sq, answer: finding });
          stepEl.classList.add('done');
        }

        addStep('Bulgular sentezleniyor...', '', false);
        setStatus('Deep Research: Sentez...');

        const synthesisPrompt = `Kullanicinin sorusu: "${query}"\nAsagidaki arastirma bulgularini kapsamli bir rapor halinde sentezle. Markdown formatinda yaz. Turkce yaz. BULGULAR: ${findings.map((f, i) => `\n### Bulgu ${i + 1}: ${f.question}\n${f.answer}`).join('\n\n')}\nKapsamli sentez raporunu olustur.`;

        let synthesis;
        if (activeProv === 'puter') {
          synthesis = await callPuterOnce(modA, [{ role: 'system', content: 'Sen bir arastirma sentez uzmanis.' }, { role: 'user', content: synthesisPrompt }]);
        } else if (activeProv === 'custom') {
          synthesis = await callCustomRouter(modA, [{ role: 'system', content: 'Sen bir arastirma sentez uzmanis.' }, { role: 'user', content: synthesisPrompt }]);
        } else if (activeProv === 'anthropic') {
          synthesis = await callAnthropicRouter(modA, [{ role: 'system', content: 'Sen bir arastirma sentez uzmanis.' }, { role: 'user', content: synthesisPrompt }]);
        }

        researchDiv.remove();

        const assistantMsg = { role: 'assistant', model: modA + ' (DR)', content: synthesis };
        chat.messages.push(assistantMsg);
        saveAll();
        renderMessages(chat.messages);
        setStatus('Deep Research tamamlandi.');

      } catch (e) {
        researchDiv.remove();
        chat.messages.push({ role: 'assistant', model: 'System', content: `DR Hatasi: ${e.message}` });
        saveAll();
        renderMessages(chat.messages);
        setStatus('Deep Research hatasi.');
      }
    }

    // ---- Agent Mode ----
    let agentActive = false;

    function startAgentMode() {
      const input = $('user-input');
      if (input) {
        input.placeholder = '🤖 Ajan Modu: Gorevi yazin...';
        input.value = 'Ajan modu: ';
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    async function runAgent(query) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) return;
      agentActive = true;

      const modA = $('model-a')?.value || 'gpt-4o-mini';
      const activeProv = providerSettings.active || 'puter';
      const win = $('chat-window');

      const agentDiv = document.createElement('div');
      agentDiv.className = 'flex flex-col gap-2 w-full animate-in msg-wrap';
      agentDiv.innerHTML = `
        <div class="flex items-center gap-2.5 px-1">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-rose-600 to-orange-600 flex items-center justify-center text-[9px] font-bold text-white">🤖</div>
          <span class="text-[11px] text-rose-400 font-semibold">Ajan Modu</span>
        </div>
        <div class="pl-[34px]">
          <div id="agent-steps" class="space-y-2"></div>
          <div id="agent-status" class="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            <div class="w-1.5 h-1.5 bg-rose-500 rounded-full dot-pulse"></div>
            <span>Gorev analiz ediliyor...</span>
          </div>
        </div>`;
      win.appendChild(agentDiv);
      win.scrollTop = win.scrollHeight;

      const stepsEl = agentDiv.querySelector('#agent-steps');
      const statusEl = agentDiv.querySelector('#agent-status span');

      function addAgentStep(title, detail, done = false) {
        const step = document.createElement('div');
        step.className = `p-2.5 rounded-lg border text-[12px] ${done ? 'border-green-800/30 bg-green-900/10' : 'border-[#222] bg-white/[0.02]'}`;
        step.innerHTML = `<div class="flex items-center gap-2 ${done ? 'text-green-400' : 'text-neutral-400'}">
          ${done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>' : '<div class="w-3 h-3 border border-neutral-600 rounded-sm"></div>'}
          <span class="font-medium">${escapeHtml(title)}</span>
        </div>${detail ? `<div class="text-neutral-600 mt-1 pl-5 text-[11px] leading-relaxed">${escapeHtml(detail).substring(0, 300)}</div>` : ''}`;
        stepsEl.appendChild(step);
        win.scrollTop = win.scrollHeight;
        return step;
      }

      function updateStatus(text) { if (statusEl) statusEl.textContent = text; }

      async function callModel(messages) {
        if (activeProv === 'custom') return await callCustomRouter(modA, messages);
        if (activeProv === 'anthropic') return await callAnthropicRouter(modA, messages);
        return await callPuterOnce(modA, messages);
      }

      try {
        updateStatus('Gorev alt adimlara bolunuyor...');
        addAgentStep('Gorev analizi baslatildi', query);

        const planPrompt = `Sen bir AI ajansin. Gorevi uygulanabilir adimlara bol. SADECE numarali liste ver.\nGorev: "${query}"`;
        let planResult = await callModel([{ role: 'system', content: 'Sen bir uzman planlayicisin.' }, { role: 'user', content: planPrompt }]);

        addAgentStep('Plan olusturuldu', planResult, true);

        const stepLines = (planResult || '').split('\n').filter(l => /^\\d+[\\.\\)]\\s/.test(l.trim()));
        const steps = stepLines.map(l => l.replace(/^\\d+[\\.\\)]\\s*/, '').trim()).filter(s => s.length > 0);
        if (steps.length === 0) steps.push(query);

        let allResults = [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          updateStatus(`Adim ${i + 1}/${steps.length}: ${step.substring(0, 30)}...`);
          const currentStepEl = addAgentStep(`Adim ${i + 1}: ${step}`, null);

          const stepPrompt = `Gorev: "${query}"\nMevcut adim: ${step}\n${allResults.length > 0 ? 'Onceki sonuclar:\n' + allResults.map((r, j) => `Adim ${j + 1}: ${r.substring(0, 300)}`).join('\n') : ''}\nBu adimi detayli uygula.`;

          let stepResult = await callModel([{ role: 'system', content: 'Gorevi uygula.' }, { role: 'user', content: stepPrompt }]);
          allResults.push(stepResult || '-');

          currentStepEl.className = 'p-2.5 rounded-lg border text-[12px] border-green-800/30 bg-green-900/10';
          const icon = currentStepEl.querySelector('div:first-child');
          if (icon) {
            icon.className = 'flex items-center gap-2 text-green-400';
            const checkbox = icon.querySelector('div');
            if (checkbox) {
              const checkSvg = document.createElement('span');
              checkSvg.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>';
              checkbox.replaceWith(checkSvg.firstElementChild);
            }
          }
          currentStepEl.querySelector('.text-neutral-600')?.remove();
          const detail = document.createElement('div');
          detail.className = 'text-neutral-600 mt-1 pl-5 text-[11px] leading-relaxed';
          detail.textContent = (stepResult || '').substring(0, 150) + '...';
          currentStepEl.appendChild(detail);
        }

        updateStatus('Sonuclar derleniyor...');
        addAgentStep('Sentezleme asamasina gecildi', null);

        const synthesisPrompt = `Gorev: "${query}"\nAdimlar ve Sonuclari:\n${allResults.map((r, i) => `### Adim ${i + 1}: ${steps[i]}\n${r}`).join('\n\n')}\nSimdi butun bunlari birlestirip son ve tam bir cozum raporu/kod sun.`;
        let finalResult = await callModel([{ role: 'system', content: 'Sentez uzmanisin.' }, { role: 'user', content: synthesisPrompt }]);

        addAgentStep('Sentez tamamlandi', null, true);
        agentDiv.remove();

        chat.messages.push({ role: 'assistant', model: `${modA} (Ajan)`, content: finalResult || '-', timestamp: Date.now() });
        saveAll();
        renderMessages(chat.messages);
        setStatus('Ajan gorevi tamamlandi.');
      } catch (e) {
        agentDiv.remove();
        chat.messages.push({ role: 'assistant', model: 'System', content: `Ajan Hatasi: ${e.message}` });
        saveAll();
        renderMessages(chat.messages);
        setStatus('Ajan hatasi.');
      } finally {
        agentActive = false;
        $('user-input').placeholder = 'Mesajinizi buraya yazin...';
      }
    }

    function renderTableChart(btn) {
      const wrapper = btn.closest('.table-wrapper');
      const table = wrapper.querySelector('table');
      const chartContainer = wrapper.querySelector('.chart-container');
      const canvas = chartContainer.querySelector('canvas');

      if (!table) return;

      if (!chartContainer.classList.contains('hidden')) {
        chartContainer.classList.add('hidden');
        wrapper.querySelector('.overflow-x-auto').classList.remove('hidden');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> Grafiğe Çevir`;
        return;
      }

      const labels = [];
      const datasetsData = [];
      const rows = Array.from(table.rows);
      if (rows.length < 2) return;

      const headers = Array.from(rows[0].cells).map(c => c.textContent.trim());

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].cells).map(c => c.textContent.trim());
        labels.push(cells[0] || `Sıra ${i}`);

        let rowData = [];
        for (let j = 1; j < Math.max(headers.length, cells.length); j++) {
          let val = parseFloat((cells[j] || "").replace(/[^0-9.-]+/g, ''));
          rowData.push(isNaN(val) ? 0 : val);
        }
        datasetsData.push(rowData);
      }

      const datasets = [];
      const colors = ['#a855f7', '#3b82f6', '#ec4899', '#f59e0b', '#10b981'];
      const numCols = Math.max(1, headers.length - 1);

      for (let j = 1; j <= numCols; j++) {
        const data = datasetsData.map(row => row[j - 1]);
        datasets.push({
          label: headers[j] || `Veri ${j}`,
          data: data,
          backgroundColor: colors[(j - 1) % colors.length] + '80',
          borderColor: colors[(j - 1) % colors.length],
          borderWidth: 2,
          borderRadius: 4
        });
      }

      chartContainer.classList.remove('hidden');
      wrapper.querySelector('.overflow-x-auto').classList.add('hidden');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg> Tabloya Dön`;

      if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
      }

      chartContainer.style.height = '350px';
      chartContainer.style.position = 'relative';

      canvas.chartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#a3a3a3', font: { family: 'Inter', size: 11 } } }
          },
          scales: {
            x: { ticks: { color: '#737373', font: { family: 'Inter', size: 10 } }, grid: { color: '#222', drawBorder: false } },
            y: { ticks: { color: '#737373', font: { family: 'Inter', size: 10 } }, grid: { color: '#222', drawBorder: false } }
          }
        }
      });
    }

    // ===== CUSTOM PERSONA BUILDER =====
    function saveCustomPersona() {
      const name = ($('custom-persona-name').value || '').trim();
      const prompt = ($('custom-persona-prompt').value || '').trim();
      if (!name || !prompt) { setStatus('Persona adi ve talimat gerekli.'); return; }
      stylePrefs.custom = prompt;
      saveAll();
      $('custom-persona-name').value = '';
      $('custom-persona-prompt').value = '';
      closePersonaGallery();
      setStatus('"' + name + '" personasi aktif edildi.');
    }

    // ===== NOTEPAD =====
    let notes = JSON.parse(localStorage.getItem('ai_notes') || '[]');
    let notepadOpen = false;

    function toggleNotepad() {
      notepadOpen = !notepadOpen;
      const panel = $('notepad-panel');
      if (notepadOpen) {
        panel.classList.add('open');
        renderNotes();
      } else {
        panel.classList.remove('open');
      }
    }

    function renderNotes() {
      const body = $('notepad-body');
      if (!body) return;
      const inputHtml = `<textarea id="notepad-new-input" class="notepad-textarea" placeholder="Yeni not ekle... (Enter kaydet, Shift+Enter satiratlama)"></textarea><button onclick="addNote()" style="background:rgba(255,255,255,0.05);border:1px solid #333;border-radius:10px;padding:8px;font-size:11px;font-weight:700;color:#aaa;cursor:pointer;width:100%;transition:all .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">+ Not Ekle</button>`;
      const notesHtml = notes.slice().reverse().map((n, i) => {
        const realIdx = notes.length - 1 - i;
        return `<div class="notepad-item"><span class="note-del" onclick="deleteNote(${realIdx})">&times;</span><div class="note-ts">${new Date(n.ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>${escapeHtml(n.text)}</div>`;
      }).join('');
      body.innerHTML = inputHtml + notesHtml;
      const ta = $('notepad-new-input');
      if (ta) ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } });
    }

    function addNote(text) {
      const input = $('notepad-new-input');
      const txt = text || (input ? input.value.trim() : '');
      if (!txt) return;
      notes.push({ text: txt, ts: Date.now() });
      localStorage.setItem('ai_notes', JSON.stringify(notes));
      if (input) input.value = '';
      renderNotes();
      setStatus('Not kaydedildi.');
    }

    function addMsgToNote(idx) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      const content = chat.messages[idx].content;
      const text = typeof content === 'string' ? content.slice(0, 1000) : '';
      if (!notepadOpen) toggleNotepad();
      notes.push({ text: text, ts: Date.now() });
      localStorage.setItem('ai_notes', JSON.stringify(notes));
      renderNotes();
      setStatus('Mesaj nota eklendi.');
    }

    function deleteNote(idx) {
      notes.splice(idx, 1);
      localStorage.setItem('ai_notes', JSON.stringify(notes));
      renderNotes();
    }

    // ===== GLOBAL SEARCH =====
    function openGlobalSearch() {
      const m = $('global-search-modal');
      m.classList.remove('hidden');
      setTimeout(() => m.classList.remove('opacity-0'), 10);
      $('global-search-input').focus();
      $('global-search-input').value = '';
      $('global-search-results').innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:32px 0;">Aramak istediginiz kelimeyi girin...</div>';
      if ($('global-search-count')) $('global-search-count').textContent = '';
    }

    function closeGlobalSearch() {
      const m = $('global-search-modal');
      m.classList.add('opacity-0');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function runGlobalSearch() {
      const q = ($('global-search-input').value || '').trim().toLowerCase();
      const results = $('global-search-results');
      if (!q) {
        results.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:32px 0;">Aramak istediginiz kelimeyi girin...</div>';
        if ($('global-search-count')) $('global-search-count').textContent = '';
        return;
      }
      const hits = [];
      chats.forEach(chat => {
        chat.messages.forEach((msg, msgIdx) => {
          if (typeof msg.content === 'string' && msg.content.toLowerCase().includes(q)) {
            const lo = msg.content.toLowerCase().indexOf(q);
            const preview = msg.content.slice(Math.max(0, lo - 50), lo + 150);
            hits.push({ chatId: chat.id, chatTitle: chat.title || 'Isimsiz', msgIdx, role: msg.role, preview, ts: msg.timestamp });
          }
        });
      });
      if ($('global-search-count')) $('global-search-count').textContent = hits.length + ' sonuc';
      if (hits.length === 0) {
        results.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:32px 0;">"' + escapeHtml(q) + '" icin sonuc bulunamadi.</div>';
        return;
      }
      results.innerHTML = hits.map(h => `<button class="global-search-result-item" onclick="goToSearchResult('${h.chatId}',${h.msgIdx})"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${h.role === 'user' ? 'rgba(37,99,235,0.2)' : 'rgba(34,197,94,0.15)'};color:${h.role === 'user' ? '#60a5fa' : '#4ade80'}">${h.role === 'user' ? 'Sen' : 'AI'}</span><span style="font-size:10px;color:#666;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(h.chatTitle)}</span>${h.ts ? `<span style="font-size:9px;color:#555">${new Date(h.ts).toLocaleDateString('tr-TR')}</span>` : ''}</div><div style="font-size:12px;color:#aaa;line-height:1.6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">...${escapeHtml(h.preview)}...</div></button>`).join('');
    }

    function goToSearchResult(chatId, msgIdx) {
      closeGlobalSearch();
      loadChat(chatId);
      setTimeout(() => {
        const msgs = document.querySelectorAll('#chat-window .msg-wrap');
        if (msgs[msgIdx]) msgs[msgIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }

    // ===== SLIDE MAKER =====
    function openSlideModal() {
      const m = $('slide-modal');
      m.classList.remove('hidden');
      setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
    }

    function closeSlideModal() {
      const m = $('slide-modal');
      m.classList.add('opacity-0'); m.querySelector('div').classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function setSlideResearch(mode) {
      const qb = $('slide-quick-btn'), db = $('slide-deep-btn');
      if (mode === 'quick') {
        qb.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-blue-500/40 bg-blue-600/15 cursor-pointer transition-all';
        db.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-[#333] cursor-pointer transition-all';
      } else {
        db.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-600/10 cursor-pointer transition-all';
        qb.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-[#333] cursor-pointer transition-all';
      }
    }

    function updateSlideFormatHint(val) {
      const hint = $('slide-format-hint');
      if (!hint) return;
      if (val === 'pptx') hint.textContent = 'PPTX: Onizleme goster, istersen duzenle, sonra indir.';
      else hint.textContent = 'HTML: Canvas\'ta canli ac, "Duzelt" ile slaytlari ozgurce degistir.';
    }

    function generateSlides() {
      const topic = ($('slide-topic').value || '').trim();
      const count = $('slide-count').value || '8';
      const style = $('slide-style').value || 'modern';
      const lang = $('slide-lang').value || 'tr';
      const format = ($('slide-format') ? $('slide-format').value : 'html');
      const researchMode = document.querySelector('input[name="slide-research"]:checked')?.value || 'quick';
      const transition = ($('slide-transition') ? $('slide-transition').value : 'slide');
      const density = ($('slide-density') ? $('slide-density').value : 'medium');
      const notes = ($('slide-notes') ? $('slide-notes').checked : false);
      const color = _slideSelectedColor || '2563eb';
      if (!topic) { setStatus('Lutfen konu girin.'); $('slide-topic').focus(); return; }
      closeSlideModal();

      const densityMap = { brief: '3', medium: '5', detailed: '7' };
      const bulletCount = densityMap[density] || '5';
      const langInstrMap = { tr: 'Tum icerik Turkce olsun.', en: 'Write all content in English.', de: 'Alle Inhalte auf Deutsch.', fr: 'Tout le contenu en francais.', es: 'Todo el contenido en espanol.' };
      const langInstr = langInstrMap[lang] || langInstrMap.tr;
      const deepExtra = researchMode === 'deep' ? '\n- Kapsamli, arastirma kalitesinde icerik uret\n- Her slayt icin veri, istatistik ve somut ornekler kullan\n- Maddeler derinlemesine ve bilgi yogun olsun' : '';
      const styleMap = { modern: 'sade ve profesyonel', corporate: 'kurumsal ve resmi', creative: 'yaratici ve dinamik', academic: 'akademik ve sade', minimal: 'minimalist ve temiz', bold: 'cesur, buyuk tipografi, guclu gorsel etki' };

      _currentPresentationOptions = { transition, style, lang, density, color, notes };

      const jsonPrompt = `Asagidaki konu icin ${count} slaytlik bir sunum icerigi hazirla. SADECE JSON ver, hicbir aciklama ekleme:\n\nKonu: ${topic}\nStil: ${styleMap[style] || 'sade ve profesyonel'}\nAksent rengi (hex, # olmadan): ${color}\n${langInstr}\n\n{"title":"Sunum Basligi","subtitle":"Alt baslik veya tarih","color":"${color}","slides":[{"title":"Slayt Basligi","icon":"💡","bullets":["Madde 1","Madde 2","Madde 3"],"notes":"Konusmaci notu","keyword":"Pexels anahtar kelime (Ingilizce)"},...]}\n\nKurallar:\n- Her slayt icin tam ${bulletCount} madde noktasi\n- Her slayt icin konuya uygun emoji icon sec\n- keyword alani konuyla alakali Pexels gorsel arama terimi (Ingilizce, orn: "technology future", "climate change")\n- color alani: "${color}" kullan\n- Son slayt baslik "Tesekkurler" veya "Sorular" olsun${notes ? '\n- notes alanini dolu tut, konusmaci icin detayli not yaz' : ''}${deepExtra}`;

      if (format === 'pptx') {
        _noCanvas = true;
        _pptxMode = true;
        $('user-input').value = jsonPrompt;
      } else {
        _noCanvas = true;
        _htmlSlideMode = true;
        $('user-input').value = jsonPrompt;
      }
      handleSend();
    }

    // ===== REPORT MAKER =====
    function openReportModal() {
      const m = $('report-modal');
      m.classList.remove('hidden');
      setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
    }

    function closeReportModal() {
      const m = $('report-modal');
      m.classList.add('opacity-0'); m.querySelector('div').classList.add('scale-95');
      setTimeout(() => m.classList.add('hidden'), 200);
    }

    function setReportResearch(mode) {
      const qb = $('report-quick-btn'), db = $('report-deep-btn');
      if (mode === 'quick') {
        qb.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-blue-500/40 bg-blue-600/15 cursor-pointer transition-all';
        db.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-[#333] cursor-pointer transition-all';
      } else {
        db.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-600/10 cursor-pointer transition-all';
        qb.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-[#333] cursor-pointer transition-all';
      }
    }

    function generateReport() {
      const topic = ($('report-topic').value || '').trim();
      const type = $('report-type').value || 'academic';
      const extra = ($('report-sections').value || '').trim();
      const length = $('report-length').value || 'medium';
      const researchMode = document.querySelector('input[name="report-research"]:checked')?.value || 'quick';
      if (!topic) { setStatus('Lutfen konu girin.'); $('report-topic').focus(); return; }
      closeReportModal();
      _noCanvas = true;
      const researchPrefix = researchMode === 'deep' ? 'Derin arastirma modu: ' : '';
      const typeMap = {
        academic: 'Akademik makale: Ozet, Giris, Literatur Taramasi, Yontem, Bulgular, Tartisma, Sonuc, Kaynakca',
        business: 'Is raporu: Yonetici Ozeti, Durum Analizi, Veri ve Metrikler, Oneriler, Eylem Plani, Ekler',
        technical: 'Teknik dokumantasyon: Genel Bakis, Mimari, Gereksinimler, Kurulum, Kullanim, Sorun Giderme, API',
        research: 'Arastirma raporu: Problem Tanimi, Kapsam ve Sinirlamalar, Metodoloji, Bulgular, Analiz, Sonuc ve Oneriler',
        analysis: 'Pazar analizi: Piyasa Genel Bakisi, Hedef Kitle, Rekabet Analizi, SWOT, Firsatlar ve Tehditler, Strateji Onerileri'
      };
      const lengthMap = { short: '~800 kelime', medium: '~1500 kelime', long: '~3000 kelime', comprehensive: '~5000 kelime veya daha fazla' };
      const extraSection = extra ? `\nEk olarak su bolumler de eklensin: ${extra}` : '';
      const prompt = `${researchPrefix}Asagidaki konu icin kapsamli ve profesyonel bir rapor hazirla:\n\nKonu: ${topic}\nFormat: ${typeMap[type]}${extraSection}\nHedef uzunluk: ${lengthMap[length]}\n\nONEMLI GEREKSINIMLER:\n- Markdown formatinda yaz (## basliklar, ### alt basliklar, maddeler, tablolar)\n- Her bolum en az 2-3 paragraf, derinlemesine icerik\n- Somut veriler, istatistikler ve gercekci ornekler kullan\n- Profesyonel Turkce dil kullan\n- Tablolar ve listeler ile verileri organize et\n- Bolumler arasi akis ve baglanti kur\n- Giris paragrafinda raporun amaci ve kapsamini acikla\n- Sonuc bolumunde ana bulgulari ozetle ve oneride bulun`;
      $('user-input').value = prompt;
      handleSend();
    }

    // ===== SLIDE PREVIEW =====
    let _pendingPptxData = null;
    let _htmlSlideMode = false;
    let _currentPresentationData = null;
    let _currentPresentationOptions = {};
    let _slideSelectedColor = '2563eb';
    let _presentationFormat = 'pptx';

    function showSlidePreview(data) {
      _pendingPptxData = data;
      const modal = $('slide-preview-modal');
      if (!modal) return;
      const titleEl = $('slide-preview-title');
      const countEl = $('slide-preview-count');
      const grid = $('slide-preview-grid');
      if (titleEl) titleEl.textContent = data.title || 'Sunum Onizlemesi';
      if (countEl) countEl.textContent = (data.slides ? data.slides.length : 0) + ' slayt';
      if (grid) {
        const accent = '#' + ((data.color || '2563eb').replace('#', ''));
        let html = `<div style="grid-column:1/-1;background:#060d1f;border:1px solid #1e293b;border-radius:12px;padding:24px 28px;display:flex;flex-direction:column;justify-content:center;min-height:160px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;width:6px;height:100%;background:${accent};border-radius:4px 0 0 4px"></div>
          <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px;padding-left:16px">${(data.title || '').replace(/</g, '&lt;')}</div>
          ${data.subtitle ? `<div style="font-size:14px;color:#94a3b8;padding-left:16px">${data.subtitle.replace(/</g, '&lt;')}</div>` : ''}
          <div style="position:absolute;bottom:12px;right:16px;font-size:11px;color:${accent};font-weight:700">KAPAK</div>
        </div>`;
        (data.slides || []).forEach((slide, i) => {
          const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
          const bgImg = slide.backgroundImage || slide.bgImage || slide.image || '';
          html += `<div style="background:${i % 2 === 0 ? '#060d1f' : '#0d1a35'};border:1px solid #1e293b;border-radius:12px;overflow:hidden;position:relative;${bgImg ? `background-image:url('${bgImg}');background-size:cover;background-position:center` : ''};min-height:180px">
            ${bgImg ? `<div style="position:absolute;inset:0;background:rgba(6,13,31,0.82);border-radius:12px"></div>` : ''}
            <div style="position:relative;z-index:1;padding:16px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                ${slide.icon ? `<span style="font-size:18px">${slide.icon}</span>` : ''}
                <div style="font-size:13px;font-weight:700;color:#fff">${(slide.title || '').replace(/</g, '&lt;')}</div>
              </div>
              <div style="width:40px;height:3px;background:${accent};border-radius:2px;margin-bottom:10px"></div>
              <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px">
                ${bullets.slice(0, 4).map(b => `<li style="font-size:11px;color:#cbd5e1;display:flex;align-items:flex-start;gap:6px"><span style="color:${accent};font-weight:700;margin-top:1px">&#x25B8;</span><span>${b.replace(/</g, '&lt;')}</span></li>`).join('')}
                ${bullets.length > 4 ? `<li style="font-size:10px;color:#475569">+${bullets.length - 4} madde daha...</li>` : ''}
              </ul>
            </div>
            <div style="position:absolute;bottom:8px;right:10px;font-size:10px;color:#475569;font-weight:600">${i + 1}/${data.slides.length}</div>
          </div>`;
        });
        html += `<div style="background:#060d1f;border:1px solid #1e293b;border-radius:12px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px">
          <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:6px">Tesekkurler</div>
          <div style="width:60px;height:3px;background:${accent};border-radius:2px;margin-bottom:8px"></div>
          <div style="font-size:13px;color:#94a3b8">Sorulariniz?</div>
        </div>`;
        grid.innerHTML = html;
      }
      modal.classList.remove('hidden');
    }

    function closeSlidePreview() {
      const modal = $('slide-preview-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function downloadPptxFromPreview() {
      if (!_pendingPptxData) return;
      const btn = $('slide-preview-dl-btn');
      if (btn) { btn.textContent = 'Hazirlaniyor...'; btn.disabled = true; }
      await buildAndDownloadPptx(_pendingPptxData);
      if (btn) { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>PPTX Indir'; btn.disabled = false; }
    }

    async function fetchImageAsBase64(url) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) { return null; }
    }

    // ===== PPTX GENERATION =====
    async function generatePptxFromContent(content) {
      let data = null;
      const jsonMatch = content.match(/\{[\s\S]*?"slides"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (jsonMatch) {
        try { data = JSON.parse(jsonMatch[0]); } catch (e) {
          try { data = JSON.parse(jsonMatch[0].replace(/[\u0000-\u001F\u007F]/g, ' ')); } catch (e2) { data = null; }
        }
      }
      if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
        setStatus('PPTX: JSON ayristirilamadi.');
        return;
      }
      _presentationFormat = 'pptx';
      showSlidePreview(data);
      const dlBtn2 = $('slide-preview-dl-btn');
      if (dlBtn2) { dlBtn2.style.display = ''; }
      setStatus('Onizleme hazir. PPTX indirmek icin "PPTX Indir" butonuna basin.');
    }

    // ===== HTML SLIDE GENERATION =====
    function generateHTMLFromContent(content) {
      let data = null;
      const jsonMatch = content.match(/\{[\s\S]*?"slides"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (jsonMatch) {
        try { data = JSON.parse(jsonMatch[0]); } catch (e) {
          try { data = JSON.parse(jsonMatch[0].replace(/[\u0000-\u001F\u007F]/g, ' ')); } catch (e2) { data = null; }
        }
      }
      if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
        setStatus('HTML Sunum: JSON ayristirilamadi.');
        return;
      }
      if (_currentPresentationOptions.color) data.color = _currentPresentationOptions.color;
      _currentPresentationData = data;
      _presentationFormat = 'html';
      const html = renderHTMLPresentation(data, _currentPresentationOptions);
      finalizeCanvas(html);
      showSlidePreview(data);
      const dlBtn = $('slide-preview-dl-btn');
      if (dlBtn) { dlBtn.style.display = 'none'; }
      const editBtn = $('slide-preview-edit-btn');
      if (editBtn) { editBtn.style.display = ''; }
      setStatus('HTML sunum hazir! Duzenlemek icin "Duzelt" butonuna basin.');
    }

    function _escH(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function renderHTMLPresentation(data, opts) {
      opts = opts || {};
      const accentRaw = (data.color || '2563eb').replace('#', '');
      const accent = '#' + accentRaw;
      const transition = opts.transition || 'slide';
      const lang = opts.lang || 'tr';
      const slides = data.slides || [];
      const totalSlides = slides.length + 2;

      function hexToRgb(h) {
        h = h.replace('#', '').padEnd(6, '0');
        return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16);
      }
      const accentRgb = hexToRgb(accentRaw);

      const bgs = [
        `linear-gradient(135deg,#080d1a 0%,#0c1628 100%)`,
        `linear-gradient(150deg,#070c18 0%,#0a1422 100%)`,
        `linear-gradient(135deg,#060b15 0%,#0b1830 100%)`,
        `linear-gradient(160deg,#090e1c 0%,#0d1a2e 100%)`,
        `linear-gradient(140deg,#07111f 0%,#0c1625 100%)`
      ];

      const transCss = {
        slide: `.sl{transform:translateX(100%)}.sl.active{transform:translateX(0)}.sl.prev{transform:translateX(-100%)}`,
        fade: `.sl{opacity:0}.sl.active{opacity:1}.sl.prev{opacity:0}`,
        zoom: `.sl{transform:scale(.88);opacity:0}.sl.active{transform:scale(1);opacity:1}.sl.prev{transform:scale(1.06);opacity:0}`,
        flip: `.sl{transform:perspective(1200px) rotateY(90deg);opacity:0}.sl.active{transform:perspective(1200px) rotateY(0deg);opacity:1}.sl.prev{transform:perspective(1200px) rotateY(-90deg);opacity:0}`
      };

      const styleBase = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#080d1a;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}.sl{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:all .6s cubic-bezier(.4,0,.2,1)}.sl.active{pointer-events:auto}${transCss[transition] || transCss.slide}.bg{position:absolute;inset:0;z-index:0}.bar{position:absolute;left:0;top:0;width:5px;height:100%;background:${accent};z-index:2}.ct{position:relative;z-index:3;width:100%;max-width:920px;padding:52px 68px;display:flex;flex-direction:column;justify-content:center;min-height:100vh}.cover{justify-content:center;padding-top:80px}.ey{font-size:10px;font-weight:700;letter-spacing:.3em;color:${accent};text-transform:uppercase;margin-bottom:18px}.cv{font-size:clamp(2rem,5vw,4.5rem);font-weight:800;color:#fff;line-height:1.1;margin-bottom:22px}.cl{width:72px;height:4px;background:${accent};border-radius:2px;margin-bottom:18px}.cs{font-size:clamp(.9rem,2vw,1.35rem);color:#94a3b8;margin-bottom:32px;line-height:1.65}.cb{background:${accent};color:#fff;border:none;padding:13px 30px;border-radius:11px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;width:fit-content}.cb:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(${accentRgb},.35)}.sh{display:flex;align-items:center;gap:12px;margin-bottom:8px}.si{font-size:2rem;line-height:1}.st{font-size:clamp(1.4rem,3vw,2.5rem);font-weight:700;color:#fff;line-height:1.2}.sl2{width:56px;height:3px;background:${accent};border-radius:2px;margin:12px 0 22px}.ul{list-style:none;display:flex;flex-direction:column;gap:13px}.li{display:flex;align-items:flex-start;gap:11px;font-size:clamp(14px,1.8vw,17px);color:#e2e8f0;line-height:1.6}.bd{color:${accent};font-size:1.3em;font-weight:700;flex-shrink:0;margin-top:-1px}.pw{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.07);z-index:4}.pf{height:100%;background:${accent};border-radius:0 2px 2px 0}.num{position:absolute;bottom:14px;right:18px;font-size:10px;color:rgba(255,255,255,.25);font-weight:600;z-index:4}.oc{align-items:center;text-align:center}.ot{font-size:clamp(2.5rem,6vw,5rem);font-weight:800;color:#fff}.ol{width:90px;height:4px;background:${accent};border-radius:2px;margin:18px auto}.os{font-size:clamp(1rem,2.5vw,1.7rem);color:#94a3b8;margin-bottom:10px}.on{font-size:12px;color:${accent};font-weight:600;letter-spacing:.06em;text-transform:uppercase}@keyframes fi{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}.ai{opacity:0;animation:fi .6s forwards}.d1{animation-delay:.12s}.d2{animation-delay:.25s}.d3{animation-delay:.38s}.d4{animation-delay:.51s}.d5{animation-delay:.64s}.d6{animation-delay:.77s}.d7{animation-delay:.9s}.d8{animation-delay:1.03s}@media(max-width:640px){.ct{padding:32px 28px 32px 36px}.cv{font-size:clamp(1.6rem,7vw,3rem)}.st{font-size:clamp(1.1rem,5vw,2rem)}.li{font-size:13px}}`;

      function makeSlide(idx, inner, prog) {
        const bgIdx = idx % bgs.length;
        return `<section class="sl" data-i="${idx}"><div class="bg" style="background:${bgs[bgIdx]}"></div><div class="bar"></div>${inner}<div class="pw"><div class="pf" style="width:${prog}%"></div></div><div class="num">${idx + 1}/${totalSlides}</div></section>`;
      }

      let allSlides = '';
      const coverInner = `<div class="ct cover"><div class="ey ai">${lang === 'en' ? 'PRESENTATION' : 'SUNUM'}</div><h1 class="cv ai d1">${_escH(data.title || '')}</h1><div class="cl ai d2"></div>${data.subtitle ? `<p class="cs ai d3">${_escH(data.subtitle)}</p>` : ''}<button class="cb ai d4" onclick="gt(1)">${lang === 'en' ? 'Begin' : 'Baslat'} <span style="font-size:18px">→</span></button></div>`;
      allSlides += makeSlide(0, coverInner, Math.round(1 / totalSlides * 100)).replace('class="sl"', 'class="sl active"');

      slides.forEach((s, i) => {
        const bullets = Array.isArray(s.bullets) ? s.bullets : [];
        const prog = Math.round((i + 2) / totalSlides * 100);
        const bHtml = bullets.map((b, bi) => `<li class="li ai d${bi + 2}"><span class="bd">›</span><span>${_escH(b)}</span></li>`).join('');
        const inner = `<div class="ct"><div class="sh ai"><span class="si">${s.icon || ''}</span><h2 class="st">${_escH(s.title || '')}</h2></div><div class="sl2 ai d1"></div><ul class="ul">${bHtml}</ul></div>`;
        allSlides += makeSlide(i + 1, inner, prog);
      });

      const outroInner = `<div class="ct oc"><h1 class="ot ai">${lang === 'en' ? 'Thank You' : 'Tesekkurler'}</h1><div class="ol ai d1"></div><p class="os ai d2">${lang === 'en' ? 'Any questions?' : 'Sorulariniz?'}</p><p class="on ai d3">${_escH(data.title || '')}</p></div>`;
      allSlides += makeSlide(totalSlides - 1, outroInner, 100);

      const js = `var c=0,sls=document.querySelectorAll('.sl'),n=sls.length;function gt(i){if(i<0||i>=n)return;sls[c].classList.remove('active');sls[c].classList.add('prev');var old=c;c=i;sls[c].classList.add('active');setTimeout(function(){sls[old].classList.remove('prev');},650);sls[c].querySelectorAll('.ai').forEach(function(el){el.style.animation='none';void el.offsetHeight;el.style.animation='';});}function nx(){if(c<n-1)gt(c+1);}function pv(){if(c>0)gt(c-1);}document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ')nx();else if(e.key==='ArrowLeft'||e.key==='ArrowUp')pv();});document.addEventListener('click',function(e){if(e.target.closest('button')||e.target.closest('a'))return;e.clientX/innerWidth>.5?nx():pv();});var ts=0,tx=0;document.addEventListener('touchstart',function(e){ts=e.touches[0].clientX;tx=e.touches[0].clientY;},{passive:true});document.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-ts,dy=e.changedTouches[0].clientY-tx;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>40){dx<0?nx():pv();}},{passive:true});`;

      return `<!DOCTYPE html>\n<html lang="${lang}">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${_escH(data.title || 'Sunum')}</title><style>${styleBase}</style></head>\n<body>${allSlides}<scr` + `ipt>${js}</scr` + `ipt></body></html>`;
    }

    // ===== SLIDE COLOR SWATCH =====
    function setSlideColor(color) {
      color = color.replace('#', '');
      _slideSelectedColor = color;
      document.querySelectorAll('#slide-color-swatches .slide-color-swatch').forEach(b => {
        b.classList.toggle('active', b.dataset.color === color);
      });
      const cust = $('slide-color-custom');
      if (cust) cust.value = '#' + color;
    }

    // ===== SLIDE EDITOR =====
    function openSlideEditor() {
      if (!_pendingPptxData && !_currentPresentationData) return;
      const data = _pendingPptxData || _currentPresentationData;
      const modal = $('slide-editor-modal');
      if (!modal) return;
      renderSlideEditorCards(data);
      const accentRaw = (data.color || '2563eb').replace('#', '');
      setEditorColor(accentRaw);
      const tr = $('slide-editor-transition');
      if (tr) tr.value = (_currentPresentationOptions.transition || 'slide');
      const cnt = $('slide-editor-count');
      if (cnt) cnt.textContent = (data.slides || []).length + ' slayt';
      modal.classList.remove('hidden');
    }

    function closeSlideEditor() {
      const modal = $('slide-editor-modal');
      if (modal) modal.classList.add('hidden');
    }

    function renderSlideEditorCards(data) {
      const list = $('slide-editor-list');
      if (!list) return;
      const slides = data.slides || [];
      list.innerHTML = slides.map((s, i) => `
        <div class="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-4 space-y-2.5" id="sec-${i}">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Slayt ${i + 1}</span>
            <div class="ml-auto flex items-center gap-1">
              <button onclick="moveSlide(${i},-1)" class="p-1 rounded text-neutral-600 hover:text-neutral-300 text-xs transition-colors" title="Yukari">↑</button>
              <button onclick="moveSlide(${i},1)" class="p-1 rounded text-neutral-600 hover:text-neutral-300 text-xs transition-colors" title="Asagi">↓</button>
              <button onclick="removeSlideFromEditor(${i})" class="p-1 rounded text-red-900 hover:text-red-400 text-xs transition-colors" title="Sil">✕</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" id="sec-icon-${i}" value="${_escH(s.icon || '')}" placeholder="emoji" class="w-12 text-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-teal-600 text-white" />
            <input type="text" id="sec-title-${i}" value="${_escH(s.title || '')}" placeholder="Slayt basligi..." class="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-600 text-white" />
          </div>
          <textarea id="sec-bullets-${i}" rows="3" placeholder="Her satir bir madde..." class="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-neutral-300 outline-none focus:border-teal-600 resize-none">${(s.bullets || []).join('\n')}</textarea>
          <input type="text" id="sec-keyword-${i}" value="${_escH(s.keyword || '')}" placeholder="Pexels gorsel anahtar kelimesi (Ingilizce)..." class="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-neutral-500 outline-none focus:border-teal-600" />
        </div>
      `).join('');
    }

    function addSlideToEditor() {
      const data = _pendingPptxData || _currentPresentationData;
      if (!data) return;
      data.slides = data.slides || [];
      data.slides.push({ title: 'Yeni Slayt', icon: '📌', bullets: ['Madde 1', 'Madde 2', 'Madde 3'], notes: '', keyword: '' });
      renderSlideEditorCards(data);
      const cnt = $('slide-editor-count');
      if (cnt) cnt.textContent = data.slides.length + ' slayt';
      const list = $('slide-editor-list');
      if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }

    function removeSlideFromEditor(i) {
      const data = _pendingPptxData || _currentPresentationData;
      if (!data || !data.slides || data.slides.length <= 1) return;
      data.slides.splice(i, 1);
      renderSlideEditorCards(data);
      const cnt = $('slide-editor-count');
      if (cnt) cnt.textContent = data.slides.length + ' slayt';
    }

    function moveSlide(i, dir) {
      const data = _pendingPptxData || _currentPresentationData;
      if (!data || !data.slides) return;
      const j = i + dir;
      if (j < 0 || j >= data.slides.length) return;
      [data.slides[i], data.slides[j]] = [data.slides[j], data.slides[i]];
      renderSlideEditorCards(data);
    }

    function setEditorColor(color) {
      color = color.replace('#', '');
      document.querySelectorAll('#slide-editor-swatches .slide-color-swatch').forEach(b => {
        b.classList.toggle('active', b.dataset.color === color);
      });
      const cust = $('slide-editor-color-custom');
      if (cust) cust.value = '#' + color;
    }

    function applySlideEdits() {
      const data = _pendingPptxData || _currentPresentationData;
      if (!data) return;
      const slides = data.slides || [];
      slides.forEach((s, i) => {
        const iconEl = document.getElementById(`sec-icon-${i}`);
        const titleEl = document.getElementById(`sec-title-${i}`);
        const bulletsEl = document.getElementById(`sec-bullets-${i}`);
        const keywordEl = document.getElementById(`sec-keyword-${i}`);
        if (iconEl) s.icon = iconEl.value.trim();
        if (titleEl) s.title = titleEl.value.trim();
        if (bulletsEl) s.bullets = bulletsEl.value.split('\n').map(b => b.trim()).filter(Boolean);
        if (keywordEl) s.keyword = keywordEl.value.trim();
      });
      const colorEl = $('slide-editor-color-custom');
      if (colorEl) data.color = colorEl.value.replace('#', '');
      const trEl = $('slide-editor-transition');
      if (trEl) _currentPresentationOptions.transition = trEl.value;
      if (_presentationFormat === 'html') {
        const html = renderHTMLPresentation(data, _currentPresentationOptions);
        finalizeCanvas(html);
        showSlidePreview(data);
        const dlBtn = $('slide-preview-dl-btn');
        if (dlBtn) dlBtn.style.display = 'none';
        closeSlideEditor();
        setStatus('Sunum guncellendi.');
      } else {
        _pendingPptxData = data;
        showSlidePreview(data);
        closeSlideEditor();
        setStatus('Slaytlar guncellendi. PPTX indirmek icin "PPTX Indir" butonuna basin.');
      }
    }

    async function buildAndDownloadPptx(data) {
      try {
        if (typeof PptxGenJS === 'undefined') { setStatus('PPTX kutuphanesi yukleniyor, tekrar deneyin.'); return; }
        setStatus('PPTX olusturuluyor...');
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';

        const accent = (data.color || '2563eb').replace('#', '');
        const darkBg = '060d1f';
        const darkBg2 = '0d1a35';
        const textLight = 'e2e8f0';
        const textMuted = '94a3b8';

        const titleSlide = pptx.addSlide();
        titleSlide.background = { color: darkBg };
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: darkBg } });
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.8, w: '100%', h: 1.7, fill: { color: accent, transparency: 85 } });
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: '100%', fill: { color: accent } });
        titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.5, w: 2.5, h: 0.06, fill: { color: accent } });
        titleSlide.addText(data.title || 'Sunum', { x: 0.5, y: 1.2, w: '85%', h: 1.8, fontSize: 42, bold: true, color: 'FFFFFF', align: 'left', fontFace: 'Calibri' });
        if (data.subtitle) titleSlide.addText(data.subtitle, { x: 0.5, y: 3.1, w: '75%', h: 0.5, fontSize: 18, color: textMuted, align: 'left', fontFace: 'Calibri' });
        titleSlide.addText(`${data.slides.length} Slayt`, { x: 0.5, y: 6.1, w: 3, h: 0.4, fontSize: 12, color: accent, align: 'left', fontFace: 'Calibri', bold: true });

        for (let i = 0; i < data.slides.length; i++) {
          const slide = data.slides[i];
          const s = pptx.addSlide();
          const bg = i % 2 === 0 ? darkBg : darkBg2;
          const bgImgUrl = slide.backgroundImage || slide.bgImage || slide.image || '';
          if (bgImgUrl) {
            const b64 = await fetchImageAsBase64(bgImgUrl);
            if (b64) {
              s.background = { data: b64 };
              s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '000000', transparency: 55 } });
            } else { s.background = { color: bg }; }
          } else { s.background = { color: bg }; }
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: '100%', fill: { color: accent } });
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.2, fill: { color: '000000', transparency: 60 } });
          const icon = slide.icon || '';
          if (icon) s.addText(icon, { x: 0.3, y: 0.22, w: 0.7, h: 0.7, fontSize: 26, align: 'center' });
          s.addText(slide.title || '', { x: icon ? 1.0 : 0.35, y: 0.18, w: '82%', h: 0.85, fontSize: 24, bold: true, color: 'FFFFFF', align: 'left', fontFace: 'Calibri' });
          s.addShape(pptx.ShapeType.rect, { x: 0.35, y: 1.2, w: 3.0, h: 0.04, fill: { color: accent } });
          const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
          if (bullets.length > 0) {
            const rows = bullets.map((b, bi) => ([
              { text: ['①', '②', '③', '④', '⑤', '⑥'][bi] || '●', options: { color: accent, fontSize: 14, bold: true, align: 'center' } },
              { text: b, options: { color: textLight, fontSize: 15, fontFace: 'Calibri' } }
            ]));
            s.addTable(rows, { x: 0.35, y: 1.4, w: 9.2, h: Math.min(4.5, bullets.length * 0.9), colW: [0.45, 8.75], border: { type: 'none' }, fill: { color: bgImgUrl ? '00000000' : bg, transparency: bgImgUrl ? 100 : 0 } });
          }
          const total = data.slides.length;
          const prog = ((i + 1) / total) * 9.14;
          s.addShape(pptx.ShapeType.rect, { x: 0.08, y: 7.35, w: 9.14, h: 0.06, fill: { color: '1e293b' } });
          s.addShape(pptx.ShapeType.rect, { x: 0.08, y: 7.35, w: prog, h: 0.06, fill: { color: accent } });
          s.addText(`${i + 1} / ${total}`, { x: 8.8, y: 7.15, w: 0.6, h: 0.25, fontSize: 9, color: textMuted, align: 'right' });
          if (slide.notes) s.addNotes(slide.notes);
        }

        const lastS = pptx.addSlide();
        lastS.background = { color: darkBg };
        lastS.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: darkBg } });
        lastS.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: '100%', fill: { color: accent } });
        lastS.addShape(pptx.ShapeType.rect, { x: 3.0, y: 3.8, w: 4.14, h: 0.06, fill: { color: accent } });
        lastS.addText('Tesekkurler', { x: 0.5, y: 1.8, w: '90%', h: 1.5, fontSize: 46, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' });
        lastS.addText('Sorulariniz?', { x: 0.5, y: 3.3, w: '90%', h: 0.6, fontSize: 20, color: textMuted, align: 'center', fontFace: 'Calibri' });
        lastS.addText(data.title || '', { x: 0.5, y: 6.0, w: '90%', h: 0.4, fontSize: 11, color: accent, align: 'center' });

        const filename = (data.title || 'sunum').replace(/[^a-z0-9\s\u00C0-\u024F]/gi, '').trim().replace(/\s+/g, '_') || 'sunum';
        const blob = await pptx.write({ outputType: 'blob' });
        const blobUrl = URL.createObjectURL(blob);

        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
          for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'assistant' && typeof chat.messages[i].content === 'string' && !chat.messages[i].content.startsWith('__PPTX_DOWNLOAD__')) {
              chat.messages.splice(i, 1);
              break;
            }
          }
          const dlMsg = {
            role: 'assistant',
            content: `__PPTX_DOWNLOAD__${blobUrl}__FILENAME__${filename}.pptx__TITLE__${data.title || 'Sunum'}__SLIDES__${data.slides.length}`,
            model: 'system',
            ts: Date.now()
          };
          chat.messages.push(dlMsg);
          renderMessages(chat.messages);
          hideWelcome();
          const win = $('chat-window');
          if (win) setTimeout(() => { win.scrollTop = win.scrollHeight; }, 100);
        }
        closeSlidePreview();
        setStatus('PPTX hazir!');
      } catch (e) {
        setStatus('PPTX olusturma hatasi: ' + e.message);
        console.error(e);
      }
    }

    // ===== EDIT MESSAGE MODAL =====
    let _editMsgIdx = -1;

    function openEditModal(idx) {
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat || !chat.messages[idx]) return;
      _editMsgIdx = idx;
      const ta = $('edit-msg-textarea');
      if (ta) ta.value = typeof chat.messages[idx].content === 'string' ? chat.messages[idx].content : '';
      const m = $('edit-msg-modal');
      m.classList.remove('hidden');
      if (ta) setTimeout(() => { ta.focus(); ta.selectionStart = ta.value.length; }, 50);
    }

    function closeEditModal() {
      $('edit-msg-modal').classList.add('hidden');
      _editMsgIdx = -1;
    }

    function confirmEditMessage() {
      const ta = $('edit-msg-textarea');
      const newText = (ta ? ta.value : '').trim();
      if (!newText || _editMsgIdx < 0) { closeEditModal(); return; }
      const chat = chats.find(c => c.id === currentChatId);
      if (!chat) { closeEditModal(); return; }
      closeEditModal();
      chat.messages = chat.messages.slice(0, _editMsgIdx);
      saveAll();
      $('user-input').value = newText;
      renderMessages(chat.messages);
      if (chat.messages.length === 0) showWelcome();
      handleSend();
    }

    boot();
  