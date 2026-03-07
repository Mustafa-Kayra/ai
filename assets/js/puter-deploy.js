const state = {
  manifest: null
};

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  $('signin-btn')?.addEventListener('click', signInPuter);
  $('inspect-btn')?.addEventListener('click', inspectManifest);
  $('list-sites-btn')?.addEventListener('click', listAccessibleSites);
  $('deploy-btn')?.addEventListener('click', deploySite);
  $('clear-log-btn')?.addEventListener('click', () => $('log-output').textContent = '');

  $('subdomain-input').value = localStorage.getItem('puter_deploy_subdomain') || '';
  $('source-root-input').value = localStorage.getItem('puter_deploy_source_root') || 'dist-puter';

  refreshAuthStatus();
});

async function signInPuter() {
  try {
    if (typeof puter === 'undefined' || !puter.auth) throw new Error('Puter SDK yuklenemedi');
    if (!puter.auth.isSignedIn()) await puter.auth.signIn();
    log('Puter girisi hazir', 'success');
  } catch (error) {
    log(error.message, 'error');
  }
  refreshAuthStatus();
  await listAccessibleSites();
}

function refreshAuthStatus() {
  const isSignedIn = typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn();
  $('auth-status').textContent = `Durum: ${isSignedIn ? 'giris yapildi' : 'misafir'}`;
}

async function inspectManifest() {
  try {
    const manifest = await loadManifest();
    renderManifest(manifest);
    log(`Manifest okundu: ${manifest.files.length} dosya`, 'success');
  } catch (error) {
    log(`Manifest okunamadi: ${error.message}`, 'error');
  }
}

async function listAccessibleSites() {
  try {
    if (typeof puter === 'undefined' || !puter.auth || !puter.auth.isSignedIn()) {
      $('sites-preview').textContent = 'Liste için önce Puter girişi yapın.';
      $('site-count').textContent = '0 site';
      return [];
    }
    if (typeof puter.hosting.list !== 'function') {
      throw new Error('hosting.list() desteklenmiyor');
    }
    const sites = await puter.hosting.list();
    $('site-count').textContent = `${sites.length} site`;
    $('sites-preview').textContent = sites.length
      ? sites.map(site => `${site.subdomain}.puter.site`).join('\n')
      : 'Bu uygulamanın erişebildiği site bulunamadı.';
    log(`Erisilebilen site sayisi: ${sites.length}`, 'success');
    return sites;
  } catch (error) {
    $('sites-preview').textContent = `Liste alınamadı: ${normalizeErrorMessage(error)}`;
    $('site-count').textContent = '0 site';
    log(`Site listesi alınamadı: ${normalizeErrorMessage(error)}`, 'warn');
    return [];
  }
}

async function deploySite() {
  try {
    const subdomain = ($('subdomain-input').value || '').trim().toLowerCase();
    const sourceRoot = ($('source-root-input').value || 'dist-puter').trim();

    if (!subdomain) throw new Error('Subdomain gerekli');
    if (!/^[a-z0-9-]+$/.test(subdomain)) throw new Error('Subdomain sadece kucuk harf, rakam ve tire icerebilir');
    if (typeof puter === 'undefined' || !puter.auth || !puter.auth.isSignedIn()) throw new Error('Once Puter girisi yapin');

    localStorage.setItem('puter_deploy_subdomain', subdomain);
    localStorage.setItem('puter_deploy_source_root', sourceRoot);

    const manifest = await loadManifest();
    renderManifest(manifest);

    const remoteDir = `${subdomain}-site`;
    const access = await diagnoseSubdomainAccess(subdomain);
    if (access === 'inaccessible') {
      throw new Error('Bu subdomain zaten var ama mevcut deploy araci bu siteye erisemiyor. Ayni Puter hesap/uygulama baglamindan deploy edin ya da yeni bir subdomain kullanin.');
    }

    log(`Uzak klasor hazirlaniyor: ${remoteDir}`, 'warn');
    await ensureRemoteDir(remoteDir);

    for (const file of manifest.files) {
      const relativeFile = String(file).replace(/^\/+/, '');
      const content = await fetchTextFile(`${sourceRoot}/${relativeFile}`);
      const parentDir = relativeFile.includes('/') ? relativeFile.split('/').slice(0, -1).join('/') : '';
      if (parentDir) {
        await ensureRemoteDir(`${remoteDir}/${parentDir}`);
      }
      await puter.fs.write(`${remoteDir}/${relativeFile}`, content);
      log(`Yuklendi: ${relativeFile}`);
    }

    let result;
    try {
      log(`Once update deneniyor: ${subdomain}.puter.site`, 'warn');
      result = await puter.hosting.update(subdomain, remoteDir);
      log(`Site guncellendi: https://${subdomain}.puter.site`, 'success');
    } catch (updateError) {
      log(`Update basarisiz, create denenecek: ${normalizeErrorMessage(updateError)}`, 'warn');
      result = await puter.hosting.create(subdomain, remoteDir);
      log(`Site olusturuldu: https://${subdomain}.puter.site`, 'success');
    }

    window.open(`https://${(result?.subdomain || subdomain)}.puter.site`, '_blank');
  } catch (error) {
    log(`Deploy hatasi: ${normalizeErrorMessage(error)}`, 'error');
  }
}

async function loadManifest() {
  const sourceRoot = ($('source-root-input').value || 'dist-puter').trim();
  const manifest = await fetchJson(`${sourceRoot}/deploy-manifest.json`);
  state.manifest = manifest;
  $('manifest-status').textContent = `Manifest: ${sourceRoot}/deploy-manifest.json`;
  return manifest;
}

function renderManifest(manifest) {
  $('manifest-count').textContent = `${manifest.files.length} dosya`;
  $('manifest-preview').textContent = manifest.files.slice(0, 30).join('\n') + (manifest.files.length > 30 ? '\n...' : '');
}

async function diagnoseSubdomainAccess(subdomain) {
  try {
    if (typeof puter.hosting.list === 'function') {
      const sites = await listAccessibleSites();
      const hasAccess = Array.isArray(sites) && sites.some(site => site?.subdomain === subdomain);
      if (hasAccess) {
        log(`Erisim dogrulandi: ${subdomain}.puter.site`, 'success');
        return 'accessible';
      }
    }
  } catch (error) {
    log(`hosting.list() okunamadi: ${normalizeErrorMessage(error)}`, 'warn');
  }

  try {
    if (typeof puter.hosting.get === 'function') {
      await puter.hosting.get(subdomain);
      log(`hosting.get() ile erisim dogrulandi: ${subdomain}.puter.site`, 'success');
      return 'accessible';
    }
  } catch (error) {
    log(`hosting.get() sonucu: ${normalizeErrorMessage(error)}`, 'warn');
  }

  return 'inaccessible';
}

async function ensureRemoteDir(dirPath) {
  try {
    await puter.fs.mkdir(dirPath, { createMissingParents: true });
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!/exist|already|duplicate/i.test(message)) throw error;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchTextFile(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} icin HTTP ${response.status}`);
  return response.text();
}

function log(message, tone = '') {
  const line = `[${new Date().toLocaleTimeString('tr-TR')}] ${message}`;
  const output = $('log-output');
  const prefix = tone ? `[${tone}] ` : '';
  output.textContent += `${prefix}${line}\n`;
  output.scrollTop = output.scrollHeight;
}

function normalizeErrorMessage(error) {
  if (!error) return 'Bilinmeyen hata';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
