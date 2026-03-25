document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.CalculatorBootstrap === 'function') {
    window.CalculatorBootstrap({
      layout: 'mobile',
      storageKey: 'calculator-history-mobile',
      readyMessage: 'Tap the keypad or use your keyboard'
    });
  }
});
