(function () {
  'use strict';

  var OPERATOR_LABELS = {
    add: '+',
    subtract: '-',
    multiply: 'x',
    divide: '/'
  };

  function roundNumber(value) {
    return Math.round((value + Number.EPSILON) * 1000000000000) / 1000000000000;
  }

  function formatNumber(value) {
    if (typeof value === 'string') {
      return value;
    }

    if (!Number.isFinite(value)) {
      return 'Error';
    }

    var absoluteValue = Math.abs(value);
    if (absoluteValue !== 0 && (absoluteValue >= 1000000000 || absoluteValue < 0.000000001)) {
      return value.toExponential(6).replace(/\.?0+e/, 'e');
    }

    var normalized = String(roundNumber(value));
    if (normalized.indexOf('.') >= 0) {
      normalized = normalized.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }

    return normalized;
  }

  function isTextInput(target) {
    if (!target) {
      return false;
    }

    var tagName = String(target.tagName || '').toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable
    );
  }

  function readStorage(key, fallbackValue) {
    try {
      var rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        return fallbackValue;
      }

      return JSON.parse(rawValue);
    } catch (error) {
      return fallbackValue;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }

  function createApp(options) {
    return new CalculatorApp(options || {});
  }

  function CalculatorApp(options) {
    this.options = Object.assign({
      layout: document.body ? document.body.getAttribute('data-layout-variant') || 'desktop' : 'desktop',
      storageKey: 'calculator-history',
      maxHistory: 10,
      readyMessage: 'Ready for input'
    }, options || {});

    this.root = document.querySelector('[data-calculator-root]') || document;
    this.expressionElement = document.getElementById('expression-display');
    this.displayElement = document.getElementById('main-display');
    this.statusElement = document.getElementById('status-display');
    this.historyElement = document.getElementById('history-list');
    this.clearHistoryButtons = Array.prototype.slice.call(
      document.querySelectorAll('[data-command="clear-history"]')
    );

    this.handleClick = this.handleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);

    this.history = this.loadHistory();
    this.resetCalculator(true);
    this.attachEvents();
    this.render();
    this.renderHistory();
  }

  CalculatorApp.prototype.attachEvents = function () {
    document.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeydown);
  };

  CalculatorApp.prototype.destroy = function () {
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeydown);
  };

  CalculatorApp.prototype.resetCalculator = function (silent) {
    this.currentValue = '0';
    this.storedValue = null;
    this.operator = null;
    this.waitingForNextValue = false;
    this.expressionText = '';
    this.statusText = this.options.readyMessage;
    this.resultJustComputed = false;
    this.isError = false;

    if (!silent) {
      this.render();
    }
  };

  CalculatorApp.prototype.loadHistory = function () {
    var savedHistory = readStorage(this.options.storageKey, []);
    if (!Array.isArray(savedHistory)) {
      return [];
    }

    return savedHistory
      .filter(function (item) {
        return item && typeof item.expression === 'string' && typeof item.result === 'string';
      })
      .slice(0, this.options.maxHistory);
  };

  CalculatorApp.prototype.saveHistory = function () {
    writeStorage(this.options.storageKey, this.history);
  };

  CalculatorApp.prototype.pushHistory = function (entry) {
    this.history.unshift(entry);
    this.history = this.history.slice(0, this.options.maxHistory);
    this.saveHistory();
    this.renderHistory();
  };

  CalculatorApp.prototype.clearHistory = function () {
    this.history = [];
    this.saveHistory();
    this.statusText = 'History cleared';
    this.render();
    this.renderHistory();
  };

  CalculatorApp.prototype.restoreHistoryItem = function (index) {
    var item = this.history[index];
    if (!item) {
      return;
    }

    this.currentValue = item.result;
    this.storedValue = null;
    this.operator = null;
    this.waitingForNextValue = false;
    this.expressionText = item.expression + ' =';
    this.statusText = 'Result restored from history';
    this.resultJustComputed = true;
    this.isError = false;
    this.render();
  };

  CalculatorApp.prototype.handleClick = function (event) {
    var button = event.target.closest('button');
    if (!button || !this.root.contains(button)) {
      return;
    }

    var historyIndex = button.getAttribute('data-history-index');
    if (historyIndex !== null) {
      this.restoreHistoryItem(Number(historyIndex));
      return;
    }

    var command = button.getAttribute('data-command');
    if (command === 'clear-history') {
      this.clearHistory();
      return;
    }

    var digit = button.getAttribute('data-digit');
    if (digit !== null) {
      this.inputDigit(digit);
      return;
    }

    var action = button.getAttribute('data-action');
    switch (action) {
      case 'decimal':
        this.inputDecimal();
        break;
      case 'operator':
        this.chooseOperator(button.getAttribute('data-operator'));
        break;
      case 'equals':
        this.evaluate();
        break;
      case 'clear-all':
        this.resetCalculator();
        break;
      case 'clear-entry':
        this.clearEntry();
        break;
      case 'backspace':
        this.backspace();
        break;
      case 'percent':
        this.applyPercent();
        break;
      case 'toggle-sign':
        this.toggleSign();
        break;
      default:
        break;
    }
  };

  CalculatorApp.prototype.handleKeydown = function (event) {
    if (isTextInput(event.target)) {
      return;
    }

    var operatorMap = {
      '+': 'add',
      '-': 'subtract',
      '*': 'multiply',
      'x': 'multiply',
      'X': 'multiply',
      '/': 'divide'
    };

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      this.inputDigit(event.key);
      return;
    }

    if (event.key === '.' || event.key === ',') {
      event.preventDefault();
      this.inputDecimal();
      return;
    }

    if (operatorMap[event.key]) {
      event.preventDefault();
      this.chooseOperator(operatorMap[event.key]);
      return;
    }

    if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      this.evaluate();
      return;
    }

    if (event.key === '%') {
      event.preventDefault();
      this.applyPercent();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      this.backspace();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Escape') {
      event.preventDefault();
      this.resetCalculator();
      return;
    }

    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.clearEntry();
    }
  };

  CalculatorApp.prototype.ensureReadyForInput = function () {
    if (!this.isError) {
      return;
    }

    this.resetCalculator(true);
  };

  CalculatorApp.prototype.inputDigit = function (digit) {
    this.ensureReadyForInput();

    if (this.resultJustComputed && !this.operator) {
      this.currentValue = digit;
      this.expressionText = '';
      this.resultJustComputed = false;
      this.statusText = 'Started a new calculation';
      this.render();
      return;
    }

    if (this.waitingForNextValue) {
      this.currentValue = digit;
      this.waitingForNextValue = false;
    } else {
      this.currentValue = this.currentValue === '0' ? digit : this.currentValue + digit;
    }

    this.resultJustComputed = false;
    this.statusText = 'Entering number';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.inputDecimal = function () {
    this.ensureReadyForInput();

    if (this.resultJustComputed && !this.operator) {
      this.currentValue = '0.';
      this.expressionText = '';
      this.resultJustComputed = false;
      this.statusText = 'Started a new calculation';
      this.render();
      return;
    }

    if (this.waitingForNextValue) {
      this.currentValue = '0.';
      this.waitingForNextValue = false;
      this.statusText = 'Entering number';
      this.updateExpressionPreview();
      this.render();
      return;
    }

    if (this.currentValue.indexOf('.') >= 0) {
      return;
    }

    this.currentValue += '.';
    this.statusText = 'Added decimal point';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.chooseOperator = function (nextOperator) {
    this.ensureReadyForInput();

    var inputValue = Number(this.currentValue);
    if (!Number.isFinite(inputValue)) {
      this.raiseError('Invalid number');
      return;
    }

    if (this.operator && this.waitingForNextValue) {
      this.operator = nextOperator;
      this.statusText = 'Operator updated';
      this.updateExpressionPreview();
      this.render();
      return;
    }

    if (this.storedValue === null) {
      this.storedValue = inputValue;
    } else if (this.operator) {
      var computation = this.compute(this.storedValue, inputValue, this.operator);
      if (!computation.ok) {
        this.raiseError(computation.message);
        return;
      }

      this.storedValue = computation.value;
      this.currentValue = formatNumber(computation.value);
    }

    this.operator = nextOperator;
    this.waitingForNextValue = true;
    this.resultJustComputed = false;
    this.statusText = 'Choose the next number';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.evaluate = function () {
    this.ensureReadyForInput();

    if (this.operator === null || this.storedValue === null) {
      this.statusText = 'Choose an operator first';
      this.render();
      return;
    }

    if (this.waitingForNextValue) {
      this.statusText = 'Enter the second value to finish the operation';
      this.render();
      return;
    }

    var leftValue = this.storedValue;
    var rightValue = Number(this.currentValue);
    var computation = this.compute(leftValue, rightValue, this.operator);
    if (!computation.ok) {
      this.raiseError(computation.message);
      return;
    }

    var expression = [
      formatNumber(leftValue),
      OPERATOR_LABELS[this.operator],
      formatNumber(rightValue)
    ].join(' ');

    this.currentValue = formatNumber(computation.value);
    this.expressionText = expression + ' =';
    this.storedValue = null;
    this.operator = null;
    this.waitingForNextValue = false;
    this.statusText = 'Result stored in history';
    this.resultJustComputed = true;

    this.pushHistory({
      expression: expression,
      result: this.currentValue,
      timestamp: new Date().toISOString()
    });

    this.render();
  };

  CalculatorApp.prototype.clearEntry = function () {
    this.ensureReadyForInput();

    this.currentValue = '0';
    this.waitingForNextValue = false;
    this.resultJustComputed = false;
    this.statusText = 'Current entry cleared';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.backspace = function () {
    this.ensureReadyForInput();

    if (this.resultJustComputed || this.waitingForNextValue) {
      this.statusText = 'Nothing to remove';
      this.render();
      return;
    }

    if (this.currentValue.length <= 1 || this.currentValue === '-0') {
      this.currentValue = '0';
    } else {
      this.currentValue = this.currentValue.slice(0, -1);
      if (this.currentValue === '-' || this.currentValue === '-0') {
        this.currentValue = '0';
      }
    }

    this.statusText = 'Removed the last digit';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.applyPercent = function () {
    this.ensureReadyForInput();

    var value = Number(this.currentValue);
    if (!Number.isFinite(value)) {
      this.raiseError('Invalid percentage');
      return;
    }

    if (
      this.storedValue !== null &&
      this.operator &&
      (this.operator === 'add' || this.operator === 'subtract')
    ) {
      value = (this.storedValue * value) / 100;
    } else {
      value = value / 100;
    }

    this.currentValue = formatNumber(roundNumber(value));
    this.waitingForNextValue = false;
    this.resultJustComputed = false;
    this.statusText = 'Converted to percentage';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.toggleSign = function () {
    this.ensureReadyForInput();

    if (this.currentValue === '0') {
      return;
    }

    this.currentValue = this.currentValue.charAt(0) === '-'
      ? this.currentValue.slice(1)
      : '-' + this.currentValue;

    this.statusText = 'Toggled the sign';
    this.updateExpressionPreview();
    this.render();
  };

  CalculatorApp.prototype.compute = function (leftValue, rightValue, operator) {
    var result;

    switch (operator) {
      case 'add':
        result = leftValue + rightValue;
        break;
      case 'subtract':
        result = leftValue - rightValue;
        break;
      case 'multiply':
        result = leftValue * rightValue;
        break;
      case 'divide':
        if (rightValue === 0) {
          return {
            ok: false,
            message: 'Cannot divide by zero'
          };
        }
        result = leftValue / rightValue;
        break;
      default:
        return {
          ok: false,
          message: 'Unsupported operator'
        };
    }

    return {
      ok: true,
      value: roundNumber(result)
    };
  };

  CalculatorApp.prototype.raiseError = function (message) {
    this.currentValue = 'Error';
    this.storedValue = null;
    this.operator = null;
    this.waitingForNextValue = false;
    this.expressionText = '';
    this.statusText = message;
    this.resultJustComputed = false;
    this.isError = true;
    this.render();
  };

  CalculatorApp.prototype.updateExpressionPreview = function () {
    if (this.operator && this.storedValue !== null) {
      if (this.waitingForNextValue) {
        this.expressionText = formatNumber(this.storedValue) + ' ' + OPERATOR_LABELS[this.operator];
        return;
      }

      this.expressionText = [
        formatNumber(this.storedValue),
        OPERATOR_LABELS[this.operator],
        this.currentValue
      ].join(' ');
      return;
    }

    if (!this.resultJustComputed) {
      this.expressionText = this.currentValue === '0' ? '' : this.currentValue;
    }
  };

  CalculatorApp.prototype.render = function () {
    if (this.expressionElement) {
      this.expressionElement.textContent = this.expressionText || ' ';
    }

    if (this.displayElement) {
      this.displayElement.textContent = this.currentValue;
    }

    if (this.statusElement) {
      this.statusElement.textContent = this.statusText;
    }
  };

  CalculatorApp.prototype.renderHistory = function () {
    if (!this.historyElement) {
      return;
    }

    if (!this.history.length) {
      this.historyElement.innerHTML =
        '<p class="history-empty">No saved calculations yet. Finish an operation to pin it here.</p>';
      return;
    }

    var formatter = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });

    this.historyElement.innerHTML = this.history
      .map(function (item, index) {
        var formattedTime = item.timestamp ? formatter.format(new Date(item.timestamp)) : '';
        return (
          '<button type="button" class="history-item" data-history-index="' + index + '">' +
            '<span class="history-expression">' + escapeText(item.expression) + '</span>' +
            '<span class="history-result">= ' + escapeText(item.result) + '</span>' +
            '<span class="history-time">' + escapeText(formattedTime) + '</span>' +
          '</button>'
        );
      })
      .join('');
  };

  function escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.CalculatorFactory = {
    createApp: createApp
  };

  window.CalculatorBootstrap = function (options) {
    if (window.__calculatorApp && typeof window.__calculatorApp.destroy === 'function') {
      window.__calculatorApp.destroy();
    }

    window.__calculatorApp = createApp(options);
    return window.__calculatorApp;
  };
})();
