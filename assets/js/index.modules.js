// ============================================================
    // AI Chat + Research v18 - Enhancement Modules
    // Monaco Editor, Vision, RAG, Advanced Voice, Export, Mind Map
    // ============================================================

    (function () {
      'use strict';

      const _$ = id => document.getElementById(id);

      // ============================================================
      // MODULE 1: Monaco Editor Integration (Code Station)
      // ============================================================
      const MonacoModule = {
        editor: null,
        currentFile: null,
        monacoReady: false,

        init() {
          if (window._monacoLoaded) return;
          window._monacoLoaded = true;

          const loaderScript = document.createElement('script');
          loaderScript.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
          loaderScript.onload = () => {
            require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
            window.MonacoEnvironment = {
              getWorkerUrl: function (workerId, label) {
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(
                  'self.MonacoEnvironment={baseUrl:"https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/"};importScripts("https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/base/worker/workerMain.js");'
                )}`;
              }
            };
            require(['vs/editor/editor.main'], () => {
              MonacoModule.monacoReady = true;
              MonacoModule._replaceCodeViewer();
              console.log('[Monaco] Editor ready');
            });
          };
          document.head.appendChild(loaderScript);
        },

        _replaceCodeViewer() {
          const viewer = _$('canvas-file-viewer');
          if (!viewer) return;

          viewer.innerHTML = '<div id="monaco-container" style="width:100%;height:100%;"></div>';

          this.editor = monaco.editor.create(_$('monaco-container'), {
            value: '// Select a file to edit',
            language: 'html',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true, maxColumn: 80 },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            padding: { top: 12 }
          });

          this.editor.onDidChangeModelContent(() => {
            if (!this.currentFile || !window.canvasFiles) return;
            const newContent = this.editor.getValue();
            window.canvasFiles[this.currentFile] = newContent;
            if (typeof window.syncTerminalWorkspace === 'function') window.syncTerminalWorkspace();

            clearTimeout(this._previewTimer);
            this._previewTimer = setTimeout(() => {
              const htmlFile = Object.keys(window.canvasFiles).find(f => f.endsWith('.html'));
              if (htmlFile && typeof window.updateCanvasPreview === 'function') {
                window.updateCanvasPreview(window.canvasFiles[htmlFile]);
              }
            }, 400);
          });
        },

        loadFile(path) {
          if (!this.editor || !this.monacoReady) return;
          this.currentFile = path;
          const content = (window.canvasFiles && window.canvasFiles[path]) || '';
          const lang = this._detectLanguage(path);
          const model = this.editor.getModel();
          if (model) {
            monaco.editor.setModelLanguage(model, lang);
            model.setValue(content);
          }
        },

        _detectLanguage(filename) {
          const ext = (filename || '').split('.').pop().toLowerCase();
          const map = {
            'html': 'html', 'htm': 'html', 'css': 'css', 'js': 'javascript',
            'ts': 'typescript', 'tsx': 'typescript', 'jsx': 'javascript',
            'json': 'json', 'py': 'python', 'java': 'java', 'cpp': 'cpp',
            'c': 'c', 'rs': 'rust', 'go': 'go', 'rb': 'ruby', 'php': 'php',
            'sh': 'shell', 'md': 'markdown', 'xml': 'xml', 'sql': 'sql',
            'yaml': 'yaml', 'yml': 'yaml', 'scss': 'scss', 'less': 'less',
            'swift': 'swift', 'kt': 'kotlin', 'dart': 'dart'
          };
          return map[ext] || 'plaintext';
        }
      };

      // ============================================================
      // MODULE 2: Visual Analysis (Multimodal / Vision)
      // ============================================================
      const VisionModule = {
        init() {
          this._addVisionButton();
        },

        _addVisionButton() {
          const attachBtn = _$('attach-btn');
          if (!attachBtn) return;

          const visionBtn = document.createElement('button');
          visionBtn.id = 'vision-btn';
          visionBtn.className = 'w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:text-cyan-400 hover:bg-white/5 transition-all shrink-0';
          visionBtn.title = 'Gorsel Analiz - Resim yukle, AI analiz etsin';
          visionBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
          visionBtn.onclick = () => this.openVisionMode();
          attachBtn.parentNode.insertBefore(visionBtn, attachBtn.nextSibling);
        },

        openVisionMode() {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await this.analyzeImage(file);
          };
          input.click();
        },

        async analyzeImage(file) {
          if (typeof setStatus === 'function') setStatus('Gorsel analiz hazirlaniyor...');
          const base64 = await this._fileToBase64(file);
          const userInput = _$('user-input');
          const analysisType = await this._showAnalysisModal(file.name);
          if (!analysisType) return;

          const prompts = {
            'describe': 'Bu gorseli detayli acikla. Ne goruyorsun?',
            'code': 'Bu gorsel/diyagrami HTML/CSS/JS koduna cevir. Tam calisan bir web sayfasi uret.',
            'table': 'Bu gorseldeki verileri (fatura, tablo vb.) Markdown tablo formatina cevir.',
            'ocr': 'Bu gorseldeki tum metinleri cikar ve duzenli bir sekilde listele.',
            'diagram': 'Bu diyagrami analiz et ve yapilanlari adim adim acikla.'
          };

          const prompt = prompts[analysisType] || prompts['describe'];

          if (!window.selectedFiles) window.selectedFiles = [];
          window.selectedFiles.push({
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type,
            file: file,
            preview: base64,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
          });

          if (typeof renderFilePreviews === 'function') renderFilePreviews();
          if (userInput) {
            userInput.value = prompt;
            userInput.dispatchEvent(new Event('input'));
          }
          if (typeof setStatus === 'function') setStatus("Gorsel yuklendi. Gondermek icin Enter'a basin.");
        },

        async _showAnalysisModal(filename) {
          return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4';
            overlay.innerHTML = `
          <div class="bg-[#111] border border-[#222] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 class="text-base font-bold text-white mb-1">Gorsel Analiz</h3>
            <p class="text-xs text-neutral-500 mb-4">${filename}</p>
            <div class="space-y-2" id="vision-options">
              <button data-type="describe" class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-[#222] hover:border-cyan-500/30 transition-all text-sm text-neutral-200">
                <span class="font-semibold">Gorseli Acikla</span>
                <span class="block text-[10px] text-neutral-500 mt-0.5">Ne goruldugunu detayli anlat</span>
              </button>
              <button data-type="code" class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-[#222] hover:border-cyan-500/30 transition-all text-sm text-neutral-200">
                <span class="font-semibold">Koda Cevir</span>
                <span class="block text-[10px] text-neutral-500 mt-0.5">Diyagrami/tasarimi HTML/CSS/JS koduna donustur</span>
              </button>
              <button data-type="table" class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-[#222] hover:border-cyan-500/30 transition-all text-sm text-neutral-200">
                <span class="font-semibold">Tablo Olustur</span>
                <span class="block text-[10px] text-neutral-500 mt-0.5">Fatura/veri gorselini tabloya cevir</span>
              </button>
              <button data-type="ocr" class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-[#222] hover:border-cyan-500/30 transition-all text-sm text-neutral-200">
                <span class="font-semibold">Metin Cikar (OCR+)</span>
                <span class="block text-[10px] text-neutral-500 mt-0.5">Gorseldeki tum metinleri cikar</span>
              </button>
              <button data-type="diagram" class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-[#222] hover:border-cyan-500/30 transition-all text-sm text-neutral-200">
                <span class="font-semibold">Diyagram Analizi</span>
                <span class="block text-[10px] text-neutral-500 mt-0.5">Akis diyagrami/semalari analiz et</span>
              </button>
            </div>
            <button id="vision-cancel" class="mt-3 w-full py-2 text-xs text-neutral-500 hover:text-white transition-all">Iptal</button>
          </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#vision-cancel').onclick = () => { overlay.remove(); resolve(null); };
            overlay.querySelector('#vision-options').addEventListener('click', e => {
              const btn = e.target.closest('button[data-type]');
              if (btn) { overlay.remove(); resolve(btn.dataset.type); }
            });
            overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
          });
        },

        _fileToBase64(file) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
      };

      // ============================================================
      // MODULE 3: RAG (Retrieval-Augmented Generation) System
      // ============================================================
      const RAGModule = {
        documents: [],
        chunks: [],
        panelOpen: false,
        activeCollection: 'Genel',
        supportedExts: ['pdf', 'txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'xls', 'xml', 'js', 'py', 'html', 'css'],
        maxStoredChars: 180000,
        _renderDocListThrottled: null,

        getCollections() {
          return ['Tum Koleksiyonlar', ...new Set(this.documents.map(doc => doc.collection || 'Genel'))];
        },

        getFileExtension(file) {
          return String(file?.name || '').split('.').pop().toLowerCase();
        },

        isSupportedFile(file) {
          const ext = this.getFileExtension(file);
          return this.supportedExts.includes(ext);
        },

        hasDocumentFingerprint(fingerprint) {
          return this.documents.some(doc => doc.fingerprint === fingerprint);
        },

        setCollection(value) {
          this.activeCollection = value || 'Genel';
          const select = _$('rag-collection-select');
          if (select) select.value = this.activeCollection;
          this._renderDocList();
        },

        init() {
          this._renderDocListThrottled = throttle(() => this._renderDocList(), 120);
          this._createPanel();
          this._loadSavedDocs();
        },

        _createPanel() {
          const panel = document.createElement('aside');
          panel.id = 'rag-panel';
          panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:360px;background:#0a0a0a;border-left:1px solid #1a1a1a;z-index:80;transform:translateX(100%);transition:transform 0.3s;display:flex;flex-direction:column;';
          panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1a1a1a;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style="font-size:14px;font-weight:700;color:#fff;">Bilgi Bankasi (RAG)</span>
            <span id="rag-doc-count" style="font-size:10px;background:rgba(168,85,247,0.2);color:#c084fc;padding:2px 6px;border-radius:999px;font-weight:700;">0</span>
          </div>
          <button onclick="window.RAGModule.togglePanel()" style="color:#737373;font-size:20px;background:none;border:none;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px;border-bottom:1px solid #1a1a1a;flex-shrink:0;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="rag-collection-select" style="flex:1;background:#111;border:1px solid #222;border-radius:10px;padding:8px 10px;color:#e5e7eb;font-size:12px;"></select>
            <input id="rag-collection-input" placeholder="Koleksiyon" style="width:110px;background:#111;border:1px solid #222;border-radius:10px;padding:8px 10px;color:#e5e7eb;font-size:12px;" />
          </div>
          <div id="rag-drop-zone" style="border:2px dashed #333;border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" style="margin:0 auto 8px;display:block;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div style="font-size:12px;color:#ccc;font-weight:600;">Belge yukle (PDF, DOCX, XLSX, TXT...)</div>
            <div style="font-size:10px;color:#555;margin-top:4px;">Maks 30 dosya, her biri 50MB</div>
          </div>
          <input type="file" id="rag-file-input" style="display:none;" multiple accept=".pdf,.txt,.md,.csv,.json,.docx,.xlsx,.xls,.xml,.js,.py,.html,.css" />
        </div>
        <div id="rag-doc-list" style="flex:1;overflow-y:auto;padding:12px;"></div>
        <div style="padding:12px;border-top:1px solid #1a1a1a;flex-shrink:0;">
          <button onclick="window.RAGModule.clearAll()" style="width:100%;padding:8px;border-radius:8px;font-size:12px;font-weight:600;color:#f87171;background:none;border:1px solid rgba(239,68,68,0.2);cursor:pointer;">Tum Dokumanlari Temizle</button>
        </div>`;
          document.body.appendChild(panel);

          const dropZone = panel.querySelector('#rag-drop-zone');
          const fileInput = panel.querySelector('#rag-file-input');
          const collectionSelect = panel.querySelector('#rag-collection-select');
          const collectionInput = panel.querySelector('#rag-collection-input');
          dropZone.onclick = () => fileInput.click();
          fileInput.onchange = (e) => this._handleFiles(Array.from(e.target.files));
          collectionSelect.onchange = () => this.setCollection(collectionSelect.value);
          collectionInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const value = collectionInput.value.trim();
              if (!value) return;
              this.setCollection(value);
              collectionInput.value = '';
            }
          });
          dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#a855f7'; });
          dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#333'; });
          dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = '#333';
            this._handleFiles(Array.from(e.dataTransfer.files));
          });
          this._renderCollectionOptions();
        },

        _renderCollectionOptions() {
          const select = _$('rag-collection-select');
          if (!select) return;
          const current = this.activeCollection || 'Genel';
          select.innerHTML = this.getCollections().map(name => `<option value="${name}">${name}</option>`).join('');
          if (![...select.options].some(option => option.value === current)) {
            const option = document.createElement('option');
            option.value = current;
            option.textContent = current;
            select.appendChild(option);
          }
          select.value = current;
        },

        togglePanel() {
          this.panelOpen = !this.panelOpen;
          const panel = _$('rag-panel');
          if (panel) panel.style.transform = this.panelOpen ? 'translateX(0)' : 'translateX(100%)';
        },

        async _handleFiles(files, options = {}) {
          const silentBatch = !!options.silentBatch;
          let processed = 0;
          for (const file of files) {
            if (this.documents.length >= 30) { if (typeof setStatus === 'function') setStatus('Maks 30 dokuman yuklendi.'); break; }
            if (file.size > 50 * 1024 * 1024) { if (typeof setStatus === 'function') setStatus(file.name + ' cok buyuk (maks 50MB).'); continue; }
            if (!this.isSupportedFile(file)) continue;
            const fingerprint = createRequestFingerprint(file);
            if (this.hasDocumentFingerprint(fingerprint)) continue;
            const doc = {
              id: Date.now() + Math.random(),
              name: file.name,
              type: file.type,
              size: file.size,
              text: '',
              chunks: [],
              pages: 0,
              collection: this.activeCollection || 'Genel',
              createdAt: Date.now(),
              fingerprint,
              sourceMeta: {}
            };
            if (!silentBatch && typeof setStatus === 'function') setStatus(file.name + ' isleniyor...');
            try {
              const extracted = await this._extractDocument(file);
              doc.pages = extracted.pages || 0;
              doc.text = extracted.text || '';
              doc.sourceMeta = extracted.sourceMeta || {};
              doc.chunks = this._chunkText(doc.text, doc, extracted.chunkHints || []);
              this.documents.push(doc);
              this.chunks.push(...doc.chunks);
              processed++;
              this._saveDocs();
              this._renderCollectionOptions();
              this._renderDocListThrottled ? this._renderDocListThrottled() : this._renderDocList();
              if (!silentBatch && typeof setStatus === 'function') setStatus(file.name + ' yuklendi (' + doc.chunks.length + ' parca).');
            } catch (e) {
              if (typeof setStatus === 'function') setStatus(file.name + ' islenemedi: ' + e.message);
            }
          }
          if (silentBatch && processed > 0 && typeof setStatus === 'function') {
            setStatus(processed + ' dokuman bilgi bankasina eklendi.');
          }
        },

        async _extractDocument(file) {
          if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            return await this._extractPdfWithPages(file);
          }
          if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return { text: result.value, sourceMeta: {} };
          }
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            return await this._extractSpreadsheet(file);
          }
          const text = await file.text();
          return { text, sourceMeta: {} };
        },

        async _extractSpreadsheet(file) {
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          let text = '';
          const chunkHints = [];
          workbook.SheetNames.forEach(sheetName => {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            rows.forEach((row, rowIndex) => {
              const rowText = row.map(cell => String(cell)).join(' | ').trim();
              if (!rowText) return;
              const line = `[Sheet: ${sheetName} | Row: ${rowIndex + 1}] ${rowText}`;
              text += line + '\n';
              chunkHints.push({ text: line, sourceMeta: { sheetName, rowStart: rowIndex + 1, rowEnd: rowIndex + 1 } });
            });
            text += '\n';
          });
          return { text, chunkHints, sourceMeta: { sheets: workbook.SheetNames } };
        },

        async _extractPdfWithPages(file) {
          const ab = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
          let fullText = '';
          const chunkHints = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            const pageText = tc.items.map(x => x.str).join(' ').trim();
            const line = '[Sayfa ' + i + '] ' + pageText;
            fullText += line + '\n\n';
            chunkHints.push({ text: line, sourceMeta: { page: i } });
          }
          return { text: fullText, pages: pdf.numPages, chunkHints, sourceMeta: { pages: pdf.numPages } };
        },

        _chunkText(text, doc, chunkHints = [], chunkSize = 900) {
          const hints = chunkHints.length > 0 ? chunkHints : text.split(/\n\s*\n/).filter(p => p.trim().length > 20).map(paragraph => ({ text: paragraph, sourceMeta: {} }));
          const chunks = [];
          let currentText = '';
          let currentMeta = {};
          hints.forEach((hint, index) => {
            const part = hint.text.trim();
            if (!part) return;
            if ((currentText + '\n\n' + part).length > chunkSize && currentText) {
              chunks.push({
                id: `${doc.id}-${chunks.length}`,
                text: currentText.trim(),
                source: doc.name,
                sourceMeta: currentMeta,
                collection: doc.collection || 'Genel',
                fingerprint: doc.fingerprint,
                type: doc.type || ''
              });
              currentText = '';
              currentMeta = {};
            }
            currentText += (currentText ? '\n\n' : '') + part;
            currentMeta = { ...currentMeta, ...hint.sourceMeta };
            if (index === hints.length - 1 && currentText.trim()) {
              chunks.push({
                id: `${doc.id}-${chunks.length}`,
                text: currentText.trim(),
                source: doc.name,
                sourceMeta: currentMeta,
                collection: doc.collection || 'Genel',
                fingerprint: doc.fingerprint,
                type: doc.type || ''
              });
            }
          });
          return chunks;
        },

        buildCitation(chunk) {
          const meta = chunk.sourceMeta || {};
          if (meta.page) return `${chunk.source} s.${meta.page}`;
          if (meta.sheetName) return `${chunk.source} / ${meta.sheetName} satir ${meta.rowStart || '?'}-${meta.rowEnd || meta.rowStart || '?'}`;
          if (meta.section) return `${chunk.source} / ${meta.section}`;
          return chunk.source;
        },

        _normalizeSearchText(value) {
          return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ı/g, 'i')
            .replace(/ç/g, 'c')
            .replace(/ğ/g, 'g')
            .replace(/ö/g, 'o')
            .replace(/ş/g, 's')
            .replace(/ü/g, 'u')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        },

        search(query, topK = 5, options = {}) {
          if (this.chunks.length === 0) return [];
          const normalizedQuery = this._normalizeSearchText(query);
          const queryWords = [...new Set(normalizedQuery.split(/\s+/).filter(w => w.length > 1))];
          const allowedFingerprints = options.preferFingerprints || null;
          const activeCollection = options.collection || this.activeCollection;
          const filteredChunks = this.chunks.filter(chunk => {
            if (allowedFingerprints && allowedFingerprints.length && allowedFingerprints.includes(chunk.fingerprint)) return true;
            if (activeCollection && activeCollection !== 'Tum Koleksiyonlar' && activeCollection !== 'Genel' && chunk.collection !== activeCollection) return false;
            return true;
          });
          if (queryWords.length === 0) return filteredChunks.slice(0, topK);
          const scored = filteredChunks.map(chunk => {
            const lower = this._normalizeSearchText([chunk.text, chunk.source, chunk.sourceMeta?.section || '', chunk.sourceMeta?.sheetName || ''].join(' '));
            let score = 0;
            for (const word of queryWords) {
              const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              score += (lower.match(regex) || []).length;
              if ((chunk.source || '').toLowerCase().includes(word)) score += 2;
            }
            if (normalizedQuery && lower.includes(normalizedQuery)) score += 8;
            return { ...chunk, score };
          });
          scored.sort((a, b) => b.score - a.score);
          const matched = scored.filter(s => s.score > 0).slice(0, topK);
          if (matched.length === 0 && allowedFingerprints && allowedFingerprints.length) {
            return filteredChunks.filter(chunk => allowedFingerprints.includes(chunk.fingerprint)).slice(0, topK);
          }
          if (matched.length === 0) return filteredChunks.slice(0, topK);
          return matched;
        },

        buildContext(query, options = {}) {
          const results = this.search(query, options.topK || 6, options);
          if (results.length === 0 && this.documents.length === 0) return '';
          let ctx = '\n\n--- BILGI BANKASI BAGLAMI ---\n';
          const docs = this.documents.filter(doc => !options.collection || options.collection === 'Tum Koleksiyonlar' || doc.collection === options.collection || options.preferFingerprints?.includes(doc.fingerprint));
          ctx += '\nYuklu Dokumanlar:\n';
          docs.forEach((doc, i) => {
            ctx += `${i + 1}. "${doc.name}" [${doc.collection || 'Genel'}] (${doc.chunks.length} parca${doc.pages ? ', ' + doc.pages + ' sayfa' : ''}, ${(doc.size / 1024).toFixed(0)}KB)\n`;
          });
          const contextChunks = results.length > 0
            ? results
            : docs.flatMap(doc => (doc.chunks || []).slice(0, 1)).slice(0, Math.min(2, options.topK || 2));
          if (contextChunks.length > 0) {
            ctx += '\nIlgili Parcalar:\n';
            contextChunks.forEach(result => {
              ctx += `\n[Kaynak: ${this.buildCitation(result)}]\n${result.text}\n---\n`;
            });
          }
          ctx += '\nYaniti olustururken uygun yerlerde kaynak referansi ver.\n';
          return ctx;
        },


        _renderDocList() {
          const list = _$('rag-doc-list');
          const countEl = _$('rag-doc-count');
          if (countEl) countEl.textContent = this.documents.length;
          if (!list) return;
          this._renderCollectionOptions();
          const docs = this.documents.filter(doc => this.activeCollection === 'Tum Koleksiyonlar' || this.activeCollection === 'Genel' || doc.collection === this.activeCollection);
          if (docs.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#555;font-size:12px;padding:32px 0;">Henuz dokuman yuklenmedi</div>';
            return;
          }
          list.innerHTML = docs.map(doc => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #1a1a1a;margin-bottom:8px;">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(168,85,247,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${doc.name}</div>
            <div style="font-size:10px;color:#555;">${doc.collection || 'Genel'} | ${doc.chunks.length} parca${doc.pages ? ' | ' + doc.pages + ' sayfa' : ''} | ${(doc.size / 1024).toFixed(0)}KB</div>
          </div>
          <button onclick="window.RAGModule.removeDoc(${doc.id})" style="color:#555;background:none;border:none;cursor:pointer;font-size:18px;" title="Sil">&times;</button>
        </div>`).join('');
        },

        removeDoc(id) {
          this.documents = this.documents.filter(d => d.id !== id);
          this.chunks = [];
          this.documents.forEach(d => this.chunks.push(...d.chunks));
          this._saveDocs();
          this._renderCollectionOptions();
          this._renderDocList();
        },

        clearAll() {
          this.documents = [];
          this.chunks = [];
          this._saveDocs();
          this._renderDocList();
          if (typeof setStatus === 'function') setStatus('Tum RAG dokumanlari temizlendi.');
        },

        _saveDocs() {
          try {
            const save = this.documents.map(d => ({
              id: d.id,
              name: d.name,
              type: d.type,
              size: d.size,
              text: (d.text || '').substring(0, this.maxStoredChars),
              pages: d.pages,
              collection: d.collection || 'Genel',
              createdAt: d.createdAt || Date.now(),
              fingerprint: d.fingerprint,
              sourceMeta: d.sourceMeta || {}
            }));
            localStorage.setItem('rag_documents', JSON.stringify(save));
          } catch (e) { console.warn('RAG save error:', e); }
        },

        _loadSavedDocs() {
          try {
            const saved = JSON.parse(localStorage.getItem('rag_documents') || '[]');
            for (const doc of saved) {
              doc.chunks = this._chunkText(doc.text || '', doc);
              this.documents.push(doc);
              this.chunks.push(...doc.chunks);
            }
            this._renderCollectionOptions();
            this._renderDocList();
          } catch (e) { console.warn('RAG load error:', e); }
        }
      };

      // ============================================================
      // MODULE 4: Advanced Voice Mode & Sentiment Analysis
      // ============================================================
      const AdvancedVoiceModule = {
        sentimentEnabled: true,
        currentEmotion: 'neutral',

        init() {
          this._enhanceVoiceOverlay();
          this._setupInterrupt();
        },

        _enhanceVoiceOverlay() {
          const overlay = _$('voice-overlay');
          if (!overlay) return;

          const emotionDiv = document.createElement('div');
          emotionDiv.id = 'voice-emotion';
          emotionDiv.style.cssText = 'font-size:12px;margin-top:8px;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid #222;';
          emotionDiv.innerHTML = '<span id="emotion-icon">😊</span> <span id="emotion-label" style="color:#a3a3a3;">Normal</span>';

          const interruptBtn = document.createElement('button');
          interruptBtn.id = 'voice-interrupt-btn';
          interruptBtn.style.cssText = 'display:none;margin-top:8px;padding:6px 16px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);cursor:pointer;';
          interruptBtn.textContent = 'Sozunu Kes';
          interruptBtn.onclick = () => this.interrupt();

          const closeBtn = overlay.querySelector('button');
          if (closeBtn) {
            overlay.insertBefore(emotionDiv, closeBtn);
            overlay.insertBefore(interruptBtn, closeBtn);
          }
        },

        _setupInterrupt() {
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && window.speechSynthesis && window.speechSynthesis.speaking) {
              this.interrupt();
            }
          });
        },

        interrupt() {
          if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.currentUtterance = null; }
          const btn = _$('voice-interrupt-btn');
          if (btn) btn.style.display = 'none';
          if (typeof setStatus === 'function') setStatus('Konusma kesildi.');
          if (window.voiceConvMode && window.recognition) {
            if (typeof setVoiceOverlayState === 'function') setVoiceOverlayState('listening');
            setTimeout(() => { try { window.recognition.start(); } catch (e) { } }, 300);
          }
        },

        analyzeSentiment(text) {
          if (!text || !this.sentimentEnabled) return 'neutral';
          const lower = text.toLowerCase();
          const emotionKeywords = {
            happy: ['mutlu', 'guzel', 'harika', 'mukemmel', 'seviyorum', 'tesekkur', 'super', 'muthis', 'happy', 'great', 'awesome', 'love', 'thanks', 'excellent', 'wonderful'],
            sad: ['uzgun', 'kotu', 'maalesef', 'uzucu', 'sad', 'sorry', 'unfortunately', 'bad', 'terrible', 'basarisiz'],
            angry: ['sinir', 'kizgin', 'berbat', 'rezalet', 'angry', 'furious', 'horrible', 'worst', 'annoying', 'nefret'],
            curious: ['nasil', 'neden', 'niye', 'merak', 'acaba', 'how', 'why', 'what', 'curious', 'wonder', 'arastir'],
          };
          let maxScore = 0;
          let detected = 'neutral';
          for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
            let score = keywords.filter(kw => lower.includes(kw)).length;
            if (score > maxScore) { maxScore = score; detected = emotion; }
          }
          this.currentEmotion = detected;
          this._updateEmotionDisplay(detected);
          return detected;
        },

        _updateEmotionDisplay(emotion) {
          const icons = { happy: '😊', sad: '😢', angry: '😠', curious: '🤔', neutral: '😐' };
          const labels = { happy: 'Mutlu', sad: 'Uzgun', angry: 'Kizgin', curious: 'Merakli', neutral: 'Normal' };
          const iconEl = _$('emotion-icon');
          const labelEl = _$('emotion-label');
          if (iconEl) iconEl.textContent = icons[emotion] || '😐';
          if (labelEl) labelEl.textContent = labels[emotion] || 'Normal';
        },

        getVoiceParams(emotion) {
          const params = { happy: { rate: 1.1, pitch: 1.1 }, sad: { rate: 0.85, pitch: 0.9 }, angry: { rate: 1.15, pitch: 1.2 }, curious: { rate: 1.0, pitch: 1.05 }, neutral: { rate: 1.0, pitch: 1.0 } };
          return params[emotion] || params.neutral;
        },

        onSpeakStart() { const btn = _$('voice-interrupt-btn'); if (btn) btn.style.display = ''; },
        onSpeakEnd() { const btn = _$('voice-interrupt-btn'); if (btn) btn.style.display = 'none'; }
      };

      // ============================================================
      // MODULE 5: Export & Share System
      // ============================================================
      const ExportModule = {
        init() {
          this._loadJsPdf();
          this._addExportButtons();
        },

        _loadJsPdf() {
          if (document.querySelector('script[src*="jspdf"]')) return;
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          document.head.appendChild(s);
        },

        _addExportButtons() {
          const runScan = throttle(() => {
            document.querySelectorAll('.msg-wrap').forEach(el => this._addExportBtn(el));
          }, 120);
          const observer = new MutationObserver(() => runScan());
          const chatWin = _$('chat-window');
          if (chatWin) observer.observe(chatWin, { childList: true, subtree: true });
          setTimeout(() => runScan(), 400);
        },

	        _normalizeExportData(kind, payload = {}) {
	          const chat = payload.chat || (window.chats && window.chats.find(c => c.id === window.currentChatId));
          const collectCitationLabels = (messages) => (messages || []).flatMap(msg => (msg?.sources || []).map(src => src.url || src.label)).filter(Boolean);
	          if (kind === 'message') {
	            const msg = payload.message || {};
	            return {
	              title: payload.title || 'Mesaj Export',
	              kind,
	              messages: [{ role: msg.role || 'assistant', model: msg.model || '', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '') }],
	              canvas: payload.canvas || null,
	              citations: payload.citations || collectCitationLabels([msg])
	            };
	          }
	          if (kind === 'canvas') {
	            return { title: payload.title || 'Canvas Export', kind, messages: [], canvas: payload.canvas || null, citations: payload.citations || [] };
	          }
	          return {
	            title: (chat && chat.title) || payload.title || 'AI Sohbet',
	            kind,
	            messages: ((chat && chat.messages) || payload.messages || []).filter(m => !(typeof m.content === 'string' && m.content.startsWith('__PPTX_DOWNLOAD__'))).map(m => ({ role: m.role, model: m.model || '', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '') })),
	            canvas: payload.canvas || (chat && chat.canvas) || null,
	            citations: payload.citations || collectCitationLabels((chat && chat.messages) || payload.messages || [])
	          };
	        },

        _buildMarkdownFromNormalized(data, options = {}) {
          let out = `# ${data.title}\n\n`;
          if (data.messages && data.messages.length) {
            data.messages.forEach(msg => {
              const heading = msg.role === 'user' ? 'Kullanici' : (msg.model || 'AI');
              out += `## ${heading}\n${msg.content || ''}\n\n`;
            });
          }
          if (data.canvas) {
            out += '## Canvas Dosyalari\n';
            Object.entries(data.canvas).forEach(([name, content]) => {
              out += `\n### ${name}\n\n\`\`\`\n${content}\n\`\`\`\n`;
            });
          }
          if (options.forNotion && data.citations?.length) {
            out += '\n## Kaynaklar\n';
            data.citations.forEach(item => { out += `- ${item}\n`; });
          }
          return out.trim();
        },

        _downloadText(filename, content, type = 'text/plain') {
          const blob = new Blob([content], { type });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
        },

        _addExportBtn(msgEl) {
          if (msgEl.dataset.exportBound === '1' || msgEl.querySelector('.export-msg-btn')) return;
          msgEl.dataset.exportBound = '1';
          const aiBlock = msgEl.querySelector('.msg-ai-block');
          if (!aiBlock) return;
          const btnGroup = document.createElement('div');
          btnGroup.className = 'export-msg-btn';
          btnGroup.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:8px;opacity:0;transition:opacity 0.2s;';
          btnGroup.innerHTML = `
        <button onclick="window.ExportModule.exportPDF(this)" style="font-size:10px;color:#525252;background:none;border:1px solid #222;border-radius:6px;padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;" title="PDF Indir">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF
        </button>
        <button onclick="window.ExportModule.copyMarkdown(this)" style="font-size:10px;color:#525252;background:none;border:1px solid #222;border-radius:6px;padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Markdown Kopyala">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Markdown
        </button>
        <button onclick="window.ExportModule.sharePublic(this)" style="font-size:10px;color:#525252;background:none;border:1px solid #222;border-radius:6px;padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Paylas">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Paylas
        </button>`;
          msgEl.addEventListener('mouseenter', () => { btnGroup.style.opacity = '1'; });
          msgEl.addEventListener('mouseleave', () => { btnGroup.style.opacity = '0'; });
          aiBlock.appendChild(btnGroup);
        },

        exportPDF(btnEl) {
          try {
            const jspdfLib = window.jspdf;
            if (!jspdfLib) { if (typeof setStatus === 'function') setStatus('PDF kutuphanesi yukleniyor, tekrar deneyin...'); return; }
            const msgWrap = btnEl.closest('.msg-wrap');
            const chat = window.chats && window.chats.find(c => c.id === window.currentChatId);
            const msgIdx = msgWrap ? Array.from(msgWrap.parentNode.children).filter(c => c.classList.contains('msg-wrap')).indexOf(msgWrap) : -1;
            const data = this._normalizeExportData('message', { message: chat?.messages?.[msgIdx], title: 'Mesaj Export' });
            const { jsPDF } = jspdfLib;
            const doc = new jsPDF();
            doc.setFont('helvetica');
            doc.setFontSize(14);
            doc.text(data.title, 15, 20);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(new Date().toLocaleString('tr-TR'), 15, 28);
            doc.setFontSize(10);
            doc.setTextColor(40, 40, 40);
            const lines = doc.splitTextToSize(this._buildMarkdownFromNormalized(data), 180);
            let y = 40;
            for (const line of lines) {
              if (y > 280) { doc.addPage(); y = 20; }
              doc.text(line, 15, y);
              y += 5;
            }
	            doc.save('ai-chat-' + Date.now() + '.pdf');
              if (typeof recordExportUsage === 'function') recordExportUsage('pdf_message');
	            if (typeof setStatus === 'function') setStatus('PDF indirildi.');
          } catch (e) {
            if (typeof setStatus === 'function') setStatus('PDF hatasi: ' + e.message);
          }
        },

        exportFullChatPDF() {
          try {
            const jspdfLib = window.jspdf;
            if (!jspdfLib) { if (typeof setStatus === 'function') setStatus('PDF kutuphanesi yukleniyor, tekrar deneyin...'); return; }
            const data = this._normalizeExportData('chat');
            const { jsPDF } = jspdfLib;
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(data.title || 'AI Sohbet', 15, 20);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(new Date().toLocaleString('tr-TR'), 15, 28);
            let y = 40;
            doc.setFontSize(10);
            const lines = doc.splitTextToSize(this._buildMarkdownFromNormalized(data), 180);
            for (const line of lines) {
              if (y > 280) { doc.addPage(); y = 20; }
              doc.text(line, 15, y);
              y += 5;
            }
	            doc.save((data.title || 'sohbet').replace(/[^a-z0-9]/gi, '_') + '-' + Date.now() + '.pdf');
              if (typeof recordExportUsage === 'function') recordExportUsage('pdf_chat');
	            if (typeof setStatus === 'function') setStatus('Tam sohbet PDF olarak indirildi.');
          } catch (e) {
            if (typeof setStatus === 'function') setStatus('PDF hatasi: ' + e.message);
          }
        },

        copyMarkdown(btnEl) {
          const msgWrap = btnEl.closest('.msg-wrap');
          if (!msgWrap) return;
          const chat = window.chats && window.chats.find(c => c.id === window.currentChatId);
          const msgIdx = Array.from(msgWrap.parentNode.children).filter(c => c.classList.contains('msg-wrap')).indexOf(msgWrap);
          const data = this._normalizeExportData('message', { message: chat?.messages?.[msgIdx], title: 'Mesaj Export' });
	          navigator.clipboard.writeText(this._buildMarkdownFromNormalized(data, { forNotion: true })).then(() => {
              if (typeof recordExportUsage === 'function') recordExportUsage('markdown_copy');
	            if (typeof setStatus === 'function') setStatus('Markdown olarak kopyalandi.');
	          });
        },

        async sharePublic(btnEl) {
          try {
            const data = this._normalizeExportData('chat');
            if (typeof setStatus === 'function') setStatus('Paylasim linki olusturuluyor...');
            const shareData = {
              title: data.title,
              messages: data.messages,
              canvas: data.canvas,
              sharedAt: Date.now()
            };
            if (window.puter && window.puter.kv) {
              const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
              await puter.kv.set(shareId, JSON.stringify(shareData));
              const shareUrl = window.location.origin + window.location.pathname + '?share=' + shareId;
	              await navigator.clipboard.writeText(shareUrl);
                if (typeof recordExportUsage === 'function') recordExportUsage('share_link');
	              if (typeof setStatus === 'function') setStatus('Paylasim linki kopyalandi!');
	            } else {
	              this._downloadText('sohbet-' + Date.now() + '.json', JSON.stringify(shareData, null, 2), 'application/json');
                if (typeof recordExportUsage === 'function') recordExportUsage('share_json');
	              if (typeof setStatus === 'function') setStatus('Sohbet JSON olarak indirildi.');
            }
          } catch (e) {
            if (typeof setStatus === 'function') setStatus('Paylasim hatasi: ' + e.message);
          }
        }
      };

      // ============================================================
      // MODULE 6: Mind Map (Node-based Thinking Visualization)
      // ============================================================
      const MindMapModule = {
        container: null,
        nodes: [],
        edges: [],
        nodeIdCounter: 0,
        svgEl: null,
        overlayEl: null,
        history: [],

        init() {
          const style = document.createElement('style');
          style.textContent = `
        .mindmap-container { position:relative;width:100%;min-height:300px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:16px;overflow:hidden;margin:12px 0; }
        .mindmap-svg { position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none; }
        .mindmap-node { position:absolute;padding:10px 16px;border-radius:12px;font-size:11px;font-weight:600;max-width:200px;text-align:center;transition:all 0.3s ease;cursor:default;box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        .mindmap-node.root { background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;border:2px solid #a855f7;font-size:13px;z-index:2; }
        .mindmap-node.step { background:#1a1a2e;color:#e2e8f0;border:1px solid #333; }
        .mindmap-node.step.active { border-color:#3b82f6;box-shadow:0 0 12px rgba(59,130,246,0.3); }
        .mindmap-node.step.done { border-color:#22c55e;background:#0a2e1a; }
        .mindmap-node.result { background:linear-gradient(135deg,#1e3a5f,#1e1e3f);color:#93c5fd;border:1px solid #3b82f6; }
        .mindmap-edge { stroke:#333;stroke-width:2;fill:none;transition:all 0.3s; }
        .mindmap-edge.active { stroke:#3b82f6;stroke-width:2.5; }
        .mindmap-edge.done { stroke:#22c55e; }
        @keyframes mindmap-pulse { 0%,100%{transform:scale(1);}50%{transform:scale(1.05);} }
        .mindmap-node.active { animation:mindmap-pulse 1.5s ease-in-out infinite; }
        .mindmap-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);z-index:9999;display:none;flex-direction:column;overflow-y:auto;}
        .mindmap-overlay.open{display:flex;}
        .mindmap-overlay-header{display:flex;align-items:center;justify-content:space-between;padding:20px 28px;border-bottom:1px solid #1a1a1a;flex-shrink:0;}
        .mindmap-overlay-body{flex:1;padding:24px;overflow-y:auto;}
        .mindmap-history-item{background:#111;border:1px solid #222;border-radius:16px;padding:16px;margin-bottom:16px;}
        .mindmap-history-title{font-size:14px;font-weight:700;color:#a855f7;margin-bottom:8px;}
        .mindmap-history-time{font-size:10px;color:#555;margin-bottom:12px;}`;
          document.head.appendChild(style);
          this._createOverlay();
        },

        _createOverlay() {
          this.overlayEl = document.createElement('div');
          this.overlayEl.className = 'mindmap-overlay';
          this.overlayEl.innerHTML = `
            <div class="mindmap-overlay-header">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#a855f7);display:flex;align-items:center;justify-content:center;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>
                </div>
                <div>
                  <div style="font-size:16px;font-weight:700;color:white;">Düşünce Haritası</div>
                  <div style="font-size:11px;color:#666;">Ajan modundaki son işlem adımları</div>
                </div>
              </div>
              <button onclick="window.MindMapModule.toggle()" style="background:rgba(255,255,255,0.08);border:1px solid #333;color:white;padding:8px 18px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;">✕ Kapat</button>
            </div>
            <div class="mindmap-overlay-body" id="mindmap-overlay-body"></div>
          `;
          document.body.appendChild(this.overlayEl);
        },

        toggle() {
          if (!this.overlayEl) this._createOverlay();
          const isOpen = this.overlayEl.classList.contains('open');
          if (isOpen) {
            this.overlayEl.classList.remove('open');
          } else {
            this._renderOverlay();
            this.overlayEl.classList.add('open');
          }
        },

        _renderOverlay() {
          const body = this.overlayEl.querySelector('#mindmap-overlay-body');
          if (!body) return;
          if (this.history.length === 0 && this.nodes.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:48px;margin-bottom:16px;">🧠</div><div style="font-size:16px;color:#666;font-weight:600;">Henüz düşünce haritası yok</div><div style="font-size:12px;color:#444;margin-top:8px;">Ajan modunu kullandığınızda işlem adımları burada görselleştirilecek.</div></div>';
            return;
          }
          let html = '';
          const allMaps = [...this.history];
          if (this.nodes.length > 0) {
            allMaps.push({ query: this.nodes[0]?.label || 'Aktif Görev', time: Date.now(), nodes: [...this.nodes] });
          }
          allMaps.reverse().forEach((map, mi) => {
            html += '<div class="mindmap-history-item">';
            html += `<div class="mindmap-history-title">🎯 ${map.query}</div>`;
            html += `<div class="mindmap-history-time">${new Date(map.time).toLocaleString('tr-TR')}</div>`;
            html += '<div style="position:relative;min-height:200px;background:#0a0a0a;border-radius:12px;overflow:hidden;" id="mm-hist-' + mi + '">';
            const svgId = 'mm-svg-' + mi;
            html += `<svg class="mindmap-svg" id="${svgId}" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></svg>`;
            map.nodes.forEach(n => {
              const cls = 'mindmap-node ' + (n.type || 'step') + (n.el?.classList.contains('done') ? ' done' : '') + (n.el?.classList.contains('active') ? ' active' : '');
              html += `<div class="${cls}" style="position:absolute;" title="${n.label}">${(n.label || '').substring(0, 50)}</div>`;
            });
            html += '</div></div>';
          });
          body.innerHTML = html;
          // Re-layout each history container
          allMaps.reverse().forEach((map, mi) => {
            const cont = body.querySelector('#mm-hist-' + mi);
            if (!cont) return;
            const w = cont.offsetWidth || 600;
            const svgEl = cont.querySelector('#mm-svg-' + mi);
            const divNodes = cont.querySelectorAll('.mindmap-node');
            const root = map.nodes[0];
            if (root && divNodes[0]) { divNodes[0].style.left = (w / 2 - 60) + 'px'; divNodes[0].style.top = '20px'; }
            const children = map.nodes.filter(n => n.id > 0);
            const levels = {};
            children.forEach(n => { const l = n.parentId === 0 ? 1 : 2; if (!levels[l]) levels[l] = []; levels[l].push(n); });
            for (const [level, lvlNodes] of Object.entries(levels)) {
              const lv = parseInt(level);
              const yPos = 20 + lv * 80;
              const spacing = w / (lvlNodes.length + 1);
              lvlNodes.forEach((n, i) => {
                const idx = map.nodes.indexOf(n);
                if (divNodes[idx]) { divNodes[idx].style.left = (spacing * (i + 1) - 70) + 'px'; divNodes[idx].style.top = yPos + 'px'; }
              });
            }
            const height = (Object.keys(levels).length + 1) * 80 + 60;
            cont.style.height = height + 'px';
          });
        },

        saveToHistory() {
          if (this.nodes.length > 0) {
            this.history.push({
              query: this.nodes[0]?.label || 'Görev',
              time: Date.now(),
              nodes: this.nodes.map(n => ({ ...n, el: { classList: { contains: (cls) => n.el?.classList?.contains(cls) || false } } }))
            });
            if (this.history.length > 20) this.history.shift();
          }
        },

        createForAgent(containerId, rootLabel) {
          this.saveToHistory();
          this.nodes = [];
          this.edges = [];
          this.nodeIdCounter = 0;
          const container = document.createElement('div');
          container.className = 'mindmap-container';
          container.id = 'mindmap-' + Date.now();
          container.style.height = '320px';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.classList.add('mindmap-svg');
          container.appendChild(svg);
          this.container = container;
          this.svgEl = svg;
          this.addNode(rootLabel, 'root', null);
          return container;
        },

        addNode(label, type, parentId) {
          const id = this.nodeIdCounter++;
          const node = { id, label, type: type || 'step', parentId, el: null, x: 0, y: 0 };
          this.nodes.push(node);
          const el = document.createElement('div');
          el.className = 'mindmap-node ' + (type || 'step');
          el.textContent = label.length > 50 ? label.substring(0, 47) + '...' : label;
          el.title = label;
          this.container.appendChild(el);
          node.el = el;
          this._layout();
          if (parentId !== null && parentId !== undefined && id > 0) this._addEdge(parentId, id);
          return id;
        },

        updateNode(id, state) {
          const node = this.nodes.find(n => n.id === id);
          if (!node || !node.el) return;
          node.el.classList.remove('active', 'done');
          if (state === 'active') node.el.classList.add('active');
          if (state === 'done') node.el.classList.add('done');
          const edge = this.edges.find(e => e.to === id);
          if (edge && edge.el) {
            edge.el.classList.remove('active', 'done');
            if (state === 'active') edge.el.classList.add('active');
            if (state === 'done') edge.el.classList.add('done');
          }
        },

        addResultNode(label) { return this.addNode(label, 'result', 0); },

        _addEdge(fromId, toId) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.classList.add('mindmap-edge');
          this.svgEl.appendChild(path);
          this.edges.push({ from: fromId, to: toId, el: path });
          this._updateEdges();
        },

        _layout() {
          if (!this.container) return;
          const w = this.container.offsetWidth || 600;
          const root = this.nodes[0];
          if (root && root.el) { root.x = w / 2; root.y = 40; root.el.style.left = (root.x - 60) + 'px'; root.el.style.top = root.y + 'px'; }
          const children = this.nodes.filter(n => n.id > 0);
          const levels = {};
          children.forEach(n => { const l = n.parentId === 0 ? 1 : 2; if (!levels[l]) levels[l] = []; levels[l].push(n); });
          for (const [level, nodes] of Object.entries(levels)) {
            const l = parseInt(level);
            const yPos = 40 + l * 90;
            const spacing = w / (nodes.length + 1);
            nodes.forEach((n, i) => { n.x = spacing * (i + 1); n.y = yPos; if (n.el) { n.el.style.left = (n.x - 70) + 'px'; n.el.style.top = n.y + 'px'; } });
          }
          this._updateEdges();
        },

        _updateEdges() {
          for (const edge of this.edges) {
            const from = this.nodes.find(n => n.id === edge.from);
            const to = this.nodes.find(n => n.id === edge.to);
            if (!from || !to || !edge.el) continue;
            const x1 = from.x, y1 = from.y + 35, x2 = to.x, y2 = to.y;
            const cy = y1 + (y2 - y1) / 2;
            edge.el.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + cy + ', ' + x2 + ' ' + cy + ', ' + x2 + ' ' + y2);
          }
        }
      };

      // ============================================================
      // MODULE 7: Web Search (Live Internet Search)
      // ============================================================
      const WebSearchModule = {
        init() { },

        async search(query) {
          try {
            // Use multiple CORS-friendly search APIs as fallbacks
            const results = await this._searchDuckDuckGo(query);
            return results;
          } catch (e) {
            console.warn('[WebSearch] Search failed:', e);
            return [];
          }
        },

        async _searchDuckDuckGo(query) {
          try {
            const resp = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1');
            const data = await resp.json();
            const results = [];
            if (data.AbstractText) {
              results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL || '' });
            }
            if (data.RelatedTopics) {
              data.RelatedTopics.forEach(t => {
                if (t.Text && results.length < 8) {
                  results.push({ title: t.Text.substring(0, 80), snippet: t.Text, url: t.FirstURL || '' });
                }
                if (t.Topics) {
                  t.Topics.forEach(sub => {
                    if (sub.Text && results.length < 8) {
                      results.push({ title: sub.Text.substring(0, 80), snippet: sub.Text, url: sub.FirstURL || '' });
                    }
                  });
                }
              });
            }
            return results;
          } catch (e) {
            return [];
          }
        },

        formatResults(results) {
          if (!results || results.length === 0) return '';
          let text = '\n\n--- WEB ARAMA SONUCLARI ---\n';
          results.forEach((r, i) => {
            text += `\n${i + 1}. ${r.title}\n${r.snippet}\n${r.url ? '[Kaynak: ' + r.url + ']' : ''}\n`;
          });
          text += '---\nYukaridaki web arama sonuclarini kullanarak guncel bilgi ile yanit ver.\n';
          return text;
        },

        needsWebSearch(query) {
          const searchKeywords = [
            'bugün', 'bugun', 'güncel', 'guncel', 'son dakika', 'şu an', 'su an',
            'kur', 'dolar', 'euro', 'bitcoin', 'btc', 'altın', 'altin', 'borsa',
            'hava durumu', 'sıcaklık', 'sicaklik', 'derece',
            'skor', 'maç', 'mac', 'sonuç', 'sonuc',
            'en yeni', 'son sürüm', 'son surum', 'latest', 'newest', 'current',
            'ne zaman', 'kaç', 'kac', 'fiyat', 'fiyatı',
            'haberleri', 'haberler', 'news',
            'nerede', 'adres', 'telefon',
            'kimdir', 'who is', 'what is',
            'ara', 'search', 'bul', 'find',
            '2024', '2025', '2026'
          ];
          const lower = query.toLowerCase();
          return searchKeywords.some(kw => lower.includes(kw));
        }
      };

      // ============================================================
      // INTEGRATION: Hook into existing app functions
      // ============================================================
      function integrateModules() {
        // 1. Monaco: Override selectCanvasFile to load into Monaco
        const origSelectCanvasFile = window.selectCanvasFile;
        window.selectCanvasFile = function (path) {
          if (origSelectCanvasFile) origSelectCanvasFile(path);
          if (MonacoModule.monacoReady && MonacoModule.editor) MonacoModule.loadFile(path);
        };

        // 2. RAG: Enhance deepResearch
        const origDeepResearch = window.deepResearch;
        window.deepResearch = async function (query) {
          if (RAGModule.documents.length > 0) {
            const ragCtx = RAGModule.buildContext(query);
            if (ragCtx) query = query + ragCtx;
          }
          if (origDeepResearch) return origDeepResearch(query);
        };

        // 3. Voice: Add sentiment analysis & interrupt support
        const origVoiceConvSpeak = window.voiceConvSpeak;
        window.voiceConvSpeak = function (rawText) {
          AdvancedVoiceModule.analyzeSentiment(rawText);
          AdvancedVoiceModule.onSpeakStart();
          if (origVoiceConvSpeak) origVoiceConvSpeak(rawText);
        };

        // 4. Agent Mode: Replace with Mind Map enhanced version
        window.runAgent = async function (query) {
          const chat = window.chats && window.chats.find(c => c.id === window.currentChatId);
          if (!chat) return;
          const modA = _$('model-a') ? _$('model-a').value : 'gpt-4o-mini';
          const activeProv = (window.providerSettings && window.providerSettings.active) || 'puter';
          window.agentActive = true;
          const progressMsg = {
            role: 'assistant',
            model: modA + ' (Ajan)',
            content: '',
            timestamp: Date.now(),
            agentState: {
              query,
              status: 'Gorev analiz ediliyor...',
              steps: []
            }
          };
          chat.messages.push(progressMsg);

          function syncProgress() {
            progressMsg.timestamp = Date.now();
            if (typeof saveAll === 'function') saveAll();
            if (window.currentChatId === chat.id && typeof renderMessages === 'function') renderMessages(chat.messages);
          }

          function addStep(title, detail, done = false) {
            progressMsg.agentState.steps.push({
              title,
              detail: detail ? String(detail).substring(0, 300) : '',
              done: !!done
            });
            syncProgress();
            return progressMsg.agentState.steps.length - 1;
          }

          function updateStep(index, patch) {
            if (!progressMsg.agentState?.steps?.[index]) return;
            Object.assign(progressMsg.agentState.steps[index], patch);
            syncProgress();
          }

          function updateStatus(text) {
            if (!progressMsg.agentState) return;
            progressMsg.agentState.status = text;
            syncProgress();
          }

          async function callModel(messages) {
            if (activeProv === 'custom') return await window.callCustomRouter(modA, messages);
            if (activeProv === 'anthropic') return await window.callAnthropicRouter(modA, messages);
            return await window.callPuterOnce(modA, messages);
          }

          try {
            updateStatus('Gorev alt adimlara bolunuyor...');
            addStep('Gorev analizi baslatildi', query, true);

            const planPrompt = 'Sen bir AI ajansin. Gorevi uygulanabilir adimlara bol. SADECE numarali liste ver.\nGorev: "' + query + '"';
            let planResult = await callModel([{ role: 'system', content: 'Sen bir uzman planlayicisin.' }, { role: 'user', content: planPrompt }]);
            addStep('Plan olusturuldu', planResult, true);

            const stepLines = (planResult || '').split('\n').filter(l => /^\d+[.)]\s/.test(l.trim()));
            const steps = stepLines.map(l => l.replace(/^\d+[.)]\s*/, '').trim()).filter(s => s.length > 0);
            if (steps.length === 0) steps.push(query);

            let allResults = [];
            for (let i = 0; i < steps.length; i++) {
              const step = steps[i];
              updateStatus('Adim ' + (i + 1) + '/' + steps.length + ': ' + step.substring(0, 30) + '...');
              const stepIndex = addStep('Adim ' + (i + 1) + ': ' + step, '', false);

              let ragCtx = RAGModule.documents.length > 0 ? RAGModule.buildContext(step) : '';
              const stepPrompt = 'Gorev: "' + query + '"\nMevcut adim: ' + step + '\n' + (allResults.length > 0 ? 'Onceki sonuclar:\n' + allResults.map((r, j) => 'Adim ' + (j + 1) + ': ' + r.substring(0, 300)).join('\n') : '') + ragCtx + '\nBu adimi detayli uygula.';
              let stepResult = await callModel([{ role: 'system', content: 'Gorevi uygula.' }, { role: 'user', content: stepPrompt }]);
              allResults.push(stepResult || '-');
              updateStep(stepIndex, { done: true, detail: (stepResult || '').substring(0, 220) });
            }

            updateStatus('Sonuclar derleniyor...');
            addStep('Sentezleme asamasina gecildi', null);

            const synthesisPrompt = 'Gorev: "' + query + '"\nAdimlar ve Sonuclari:\n' + allResults.map((r, i) => '### Adim ' + (i + 1) + ': ' + steps[i] + '\n' + r).join('\n\n') + '\nSimdi butun bunlari birlestirip son ve tam bir cozum raporu/kod sun.';
            let finalResult = await callModel([{ role: 'system', content: 'Sentez uzmanisin.' }, { role: 'user', content: synthesisPrompt }]);

            addStep('Sentez tamamlandi', null, true);
            const actions = typeof window.applyAgentActions === 'function' ? window.applyAgentActions(query, finalResult || '-') : [];
            delete progressMsg.agentState;
            progressMsg.content = finalResult || '-';
            progressMsg.actions = actions;
            if (typeof window.enrichAssistantMessage === 'function') await window.enrichAssistantMessage(query, progressMsg);
            syncProgress();
            if (typeof setStatus === 'function') setStatus('Ajan gorevi tamamlandi.');
          } catch (e) {
            delete progressMsg.agentState;
            progressMsg.model = 'System';
            progressMsg.content = 'Ajan Hatasi: ' + e.message;
            syncProgress();
            if (typeof setStatus === 'function') setStatus('Ajan hatasi.');
          } finally {
            window.agentActive = false;
            const inp = _$('user-input');
            if (inp) inp.placeholder = 'Mesajinizi buraya yazin...';
          }
        };

        // 5. buildHistoryForModel: Inject RAG into every LLM call
        const origBuildHistory = window.buildHistoryForModel;
        if (origBuildHistory) {
          window.buildHistoryForModel = function (chat) {
            const history = origBuildHistory(chat);
            if (RAGModule.documents.length > 0 && history.length > 0) {
              for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].role === 'user') {
                  let userText = '';
                  const content = history[i].content;

                  // Extract user text from both string and array content formats
                  if (typeof content === 'string') {
                    userText = content;
                  } else if (Array.isArray(content)) {
                    const textPart = content.find(p => p.type === 'text');
                    if (textPart) userText = textPart.text || '';
                  }

                  if (userText) {
                    const ragCtx = RAGModule.buildContext(userText);
                    if (ragCtx) {
                      if (typeof content === 'string') {
                        history[i].content += ragCtx;
                      } else if (Array.isArray(content)) {
                        const textPart = content.find(p => p.type === 'text');
                        if (textPart) {
                          textPart.text += ragCtx;
                        } else {
                          content.unshift({ type: 'text', text: ragCtx });
                        }
                      }
                    }
                  }
                  break;
                }
              }
            }
            return history;
          };
        }

        console.log('[v18 Modules] All 6 modules integrated successfully');
      }

      // ============================================================
      // BOOT
      // ============================================================
      function bootModules() {
        MonacoModule.init();
        VisionModule.init();
        RAGModule.init();
        MindMapModule.init();
        AdvancedVoiceModule.init();
        ExportModule.init();
        WebSearchModule.init();
        setTimeout(integrateModules, 1500);
      }

      window.MonacoModule = MonacoModule;
      window.VisionModule = VisionModule;
      window.RAGModule = RAGModule;
      window.AdvancedVoiceModule = AdvancedVoiceModule;
      window.ExportModule = ExportModule;
      window.MindMapModule = MindMapModule;
      window.WebSearchModule = WebSearchModule;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootModules);
      } else {
        setTimeout(bootModules, 500);
      }

    })();
  