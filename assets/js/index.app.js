(function () {
  'use strict';

  function boot() {
    if (typeof window.CalculatorBootstrap === 'function') {
      window.CalculatorBootstrap({
        layout: 'desktop',
        storageKey: 'calculator-history-desktop',
        readyMessage: 'Desktop calculator ready'
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
