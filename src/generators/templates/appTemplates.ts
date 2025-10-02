// Application-level templates for project scaffolding
import * as path from 'path';
import { GENERATOR_MARKERS } from '../../utils/constants';

export const packageJsonTemplate = (appName: string) => JSON.stringify(
  {
    name: appName || 'my-app',
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'npm run clean && tsc -p tsconfig.json && npx path-fixer',
      start: 'node build/app.js',
      clean: 'rm -rf build',
      dev: 'ts-node src/app.ts',
      // uncomment this if you want to use the devstand script
      // devstand: 'npm i && npm link @currentjs/router @currentjs/templating @currentjs/provider-mysql && npm run build'
    },
    dependencies: {
      '@currentjs/router': 'latest',
      '@currentjs/templating': 'latest',
      '@currentjs/provider-mysql': 'latest',
    },
    devDependencies: {
      typescript: '^5.6.3',
      '@types/node': '^22.7.4',
      '@koz1024/path-fixer': '^0.2.1',
    },
    type: 'module'
  },
  null,
  2
);

export const tsconfigTemplate = `{
  "compilerOptions": {
    "module": "es2020",
    "target": "es2020",
    "sourceMap": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": "./src",
    "outDir": "./build",
    "types": ["node"],
    "moduleResolution": "Node",
    "declaration": true,
    "declarationMap": false
  },
  "exclude": [
    "node_modules"
  ],
  "type": "module"
}`;

export const appYamlTemplate = `
providers:
  mysql: '@currentjs/provider-mysql'
database: mysql
modules: []`;

export const appTsTemplate = `import { createWebServer } from '@currentjs/router';
import { createTemplateEngine } from '@currentjs/templating';
import * as path from 'path';

/** DO NOT CHANGE THESE LINES **/
${GENERATOR_MARKERS.CONTROLLERS_START}
${GENERATOR_MARKERS.CONTROLLERS_END}
/** END OF DO NOT CHANGE THESE LINES **/

export async function main() {
  await Promise.all(Object.values(providers).map(provider => provider.init()));
  const webDir = path.join(process.cwd(), 'web');
  const renderEngine = createTemplateEngine({ directories: [process.cwd()] });
  const app = createWebServer({ controllers, webDir }, { 
    port: 3000, 
    renderer: (template, data, layout) => {
      try {
        return layout ? renderEngine.renderWithLayout(layout, template, data) : renderEngine.render(template, data);
      } catch (e) {
        return String(e instanceof Error ? e.message : e);
      }
    },
    errorTemplate: 'error'
  });
  await app.listen();
  console.log('Server started on http://localhost:3000');

  const handleTermination = async () => {
    try { await app.close(); } catch {}
    const shutdowns = Object.values(providers).map(provider => provider.shutdown ?? (() => {}));
    await Promise.all(shutdowns);
    process.exit(0);
  };

  process.on('SIGINT', handleTermination);
  process.on('SIGTERM', handleTermination);
}

void main();
`;

export const mainViewTemplate = `<!-- @template name="main_view" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your App</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossorigin="anonymous">
  <script src="/app.js"></script>
</head>
<body>
  <div class="container-fluid">
    <div id="main">{{ content }}</div>
  </div>
</body>
</html>
`;

export const errorTemplate = `<!-- @template name="error" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Your App</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossorigin="anonymous">
  <script src="/app.js"></script>
</head>
<body>
  <div class="container-fluid">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="text-center mt-5">
          <div class="display-1 text-danger fw-bold mb-3">{{ statusCode }}</div>
          <h2 class="mb-3">Oops! Something went wrong</h2>
          <p class="text-muted mb-4">{{ error }}</p>
          <div class="d-flex gap-2 justify-content-center">
            <button class="btn btn-primary" onclick="window.history.back()">Go Back</button>
            <a href="/" class="btn btn-outline-secondary">Home Page</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

export const frontendScriptTemplate = `/**
 * Common Frontend Functions for Generated Apps
 * This script provides utilities for UI feedback, navigation, form handling, and SPA-like behavior
 */

// Global configuration
window.AppConfig = {
  toastDuration: 3000,
  modalDuration: 1200,
  animationDuration: 300,
  debounceDelay: 300,
  translations: {},
  currentLang: null
};

// ===== TRANSLATION FUNCTIONS =====

/**
 * Get current language
 * Priority: localStorage -> navigator.language -> 'en'
 * @returns {string} Current language code
 */
function getCurrentLanguage() {
  if (window.AppConfig.currentLang) {
    return window.AppConfig.currentLang;
  }
  
  // 1. Check localStorage
  const storedLang = localStorage.getItem('lang');
  if (storedLang) {
    window.AppConfig.currentLang = storedLang;
    return storedLang;
  }
  
  // 2. Check browser language (Accept-Language equivalent)
  const browserLang = navigator.language || navigator.languages?.[0];
  if (browserLang) {
    // Extract language code (e.g., 'en-US' -> 'en')
    const langCode = browserLang.split('-')[0];
    window.AppConfig.currentLang = langCode;
    return langCode;
  }
  
  // 3. Default fallback
  window.AppConfig.currentLang = 'en';
  return 'en';
}

/**
 * Translate string to current language
 * @param {string} str - String in default language to translate
 * @returns {string} Translated string or original if translation not found
 */
function t(str) {
  if (!str || typeof str !== 'string') return str;
  
  const currentLang = getCurrentLanguage();
  
  // If current language is the default or no translations loaded, return original
  if (currentLang === 'en' || !window.AppConfig.translations || !window.AppConfig.translations[currentLang]) {
    return str;
  }
  
  const translation = window.AppConfig.translations[currentLang][str];
  return translation || str;
}

/**
 * Set current language and save to localStorage
 * @param {string} langKey - Language code (e.g., 'en', 'ru', 'pl')
 */
function setLang(langKey) {
  if (!langKey || typeof langKey !== 'string') return;
  
  window.AppConfig.currentLang = langKey;
  localStorage.setItem('lang', langKey);
  
  // Optionally reload page to apply translations
  // Uncomment the next line if you want automatic page reload on language change
  // window.location.reload();
}

/**
 * Load translations from JSON file
 * @param {string} url - URL to translations JSON file (default: '/translations.json')
 */
function loadTranslations(url = '/translations.json') {
  fetch(url)
    .then(response => {
      if (!response.ok) {
        console.warn('Translations file not found:', url);
        return {};
      }
      return response.json();
    })
    .then(translations => {
      window.AppConfig.translations = translations || {};
    })
    .catch(error => {
      console.warn('Failed to load translations:', error);
      window.AppConfig.translations = {};
    });
}

// ===== UI FEEDBACK & NOTIFICATIONS =====

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'info', 'warning'
 */
function showToast(message, type = 'info') {
  // Translate the message
  message = t(message);
  const toast = document.createElement('div');
  toast.className = 'app-toast app-toast-' + type;
  toast.textContent = message;
  toast.style.cssText = \`
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
    transition: all \${window.AppConfig.animationDuration}ms ease;
    transform: translateX(100%);
    opacity: 0;
  \`;
  
  // Type-specific styling
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  toast.style.backgroundColor = colors[type] || colors.info;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 10);
  
  // Auto remove
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, window.AppConfig.animationDuration);
  }, window.AppConfig.toastDuration);
}

/**
 * Display inline message in specific container
 * @param {string} elementId - ID of the target element
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'info', 'warning'
 */
function showMessage(elementId, message, type = 'info') {
  const element = getElementSafely('#' + elementId);
  if (!element) return;
  
  // Translate the message
  message = t(message);
  element.textContent = message;
  element.className = 'app-message app-message-' + type;
  element.style.cssText = \`
    padding: 8px 12px;
    border-radius: 4px;
    margin: 8px 0;
    font-size: 14px;
    display: block;
  \`;
  
  // Type-specific styling
  const styles = {
    success: 'background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0;',
    error: 'background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;',
    warning: 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;',
    info: 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;'
  };
  element.style.cssText += styles[type] || styles.info;
}

/**
 * Show modal dialog
 * @param {string} modalId - ID of the modal element
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'info', 'warning'
 */
function showModal(modalId, message, type = 'info') {
  let modal = getElementSafely('#' + modalId);
  
  if (!modal) {
    // Create modal if it doesn't exist
    modal = document.createElement('dialog');
    modal.id = modalId;
    modal.innerHTML = \`
      <div class="modal-content">
        <div class="modal-header">
          <button class="modal-close" onclick="this.closest('dialog').close()">&times;</button>
        </div>
        <div class="modal-body"></div>
      </div>
    \`;
    modal.style.cssText = \`
      border: none;
      border-radius: 8px;
      padding: 0;
      max-width: 400px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    \`;
    document.body.appendChild(modal);
  }
  
  const content = modal.querySelector('.modal-body');
  if (content) {
    // Translate the message
    message = t(message);
    content.textContent = message;
    content.className = 'modal-body modal-' + type;
    content.style.cssText = 'padding: 20px; text-align: center;';
  }
  
  if (modal.showModal) {
    modal.showModal();
    setTimeout(() => {
      try { modal.close(); } catch(e) {}
    }, window.AppConfig.modalDuration);
  }
}

// ===== NAVIGATION & PAGE ACTIONS =====

/**
 * Enhanced history.back() with fallback
 */
function navigateBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

/**
 * Safe redirect with validation
 * @param {string} url - The URL to redirect to
 */
function redirectTo(url) {
  if (!url || typeof url !== 'string') return;
  // Basic URL validation
  if (url.startsWith('/') || url.startsWith('http')) {
    window.location.href = url;
  }
}

/**
 * Page reload with loading indication
 */
function reloadPage() {
  showToast('Reloading page...', 'info');
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

/**
 * Refresh specific page sections by reloading their content
 * @param {string} selector - CSS selector for the section to refresh
 */
function refreshSection(selector) {
  const element = getElementSafely(selector);
  if (!element) return;
  
  // If element has data-refresh-url, use that to reload content
  const refreshUrl = element.getAttribute('data-refresh-url');
  if (refreshUrl) {
    fetch(refreshUrl)
      .then(response => response.text())
      .then(html => {
        element.innerHTML = html;
      })
      .catch(error => {
        console.error('Failed to refresh section:', error);
        showToast('Failed to refresh content', 'error');
      });
  }
}

// ===== FORM & CONTENT MANAGEMENT =====

/**
 * Safe element removal with animation
 * @param {string} selector - CSS selector for element to remove
 */
function removeElement(selector) {
  const element = getElementSafely(selector);
  if (!element) return;
  
  element.style.transition = \`opacity \${window.AppConfig.animationDuration}ms ease\`;
  element.style.opacity = '0';
  
  setTimeout(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }, window.AppConfig.animationDuration);
}

/**
 * Update content in element
 * @param {string} selector - CSS selector for target element
 * @param {string} content - New content
 * @param {string} mode - 'replace', 'append', 'prepend'
 */
function updateContent(selector, content, mode = 'replace') {
  const element = getElementSafely(selector);
  if (!element) return;
  
  switch (mode) {
    case 'append':
      element.innerHTML += content;
      break;
    case 'prepend':
      element.innerHTML = content + element.innerHTML;
      break;
    case 'replace':
    default:
      element.innerHTML = content;
      break;
  }
}

/**
 * Reset form fields and validation states
 * @param {string} formSelector - CSS selector for the form
 */
function clearForm(formSelector) {
  const form = getElementSafely(formSelector);
  if (!form) return;
  
  if (form.reset) {
    form.reset();
  }
  
  // Clear validation messages
  const messages = form.querySelectorAll('.app-message');
  messages.forEach(msg => msg.remove());
}

// ===== CUSTOM SPA INTEGRATION =====

/**
 * Centralized success handler that executes strategy array
 * @param {object} response - The response object
 * @param {string[]} strategy - Array of strategy actions
 * @param {object} options - Additional options (basePath, entityName, etc.)
 */
function handleFormSuccess(response, strategy = ['back', 'toast'], options = {}) {
  const { basePath, entityName = 'Item' } = options;
  
  strategy.forEach(action => {
    switch (action) {
      case 'toast':
        showToast(\`\${entityName} saved successfully\`, 'success');
        break;
      case 'message':
        if (options.messageId) {
          showMessage(options.messageId, \`\${entityName} saved successfully\`, 'success');
        }
        break;
      case 'modal':
        if (options.modalId) {
          showModal(options.modalId, \`\${entityName} saved successfully\`, 'success');
        }
        break;
      case 'remove':
        // If targetSelector is specified, remove that element instead of the form
        if (options.targetSelector) {
          removeElement(options.targetSelector);
        } else if (options.formSelector) {
          removeElement(options.formSelector);
        }
        break;
      case 'redirect':
        if (basePath) {
          redirectTo(basePath);
        }
        break;
      case 'back':
        navigateBack();
        break;
      case 'reload':
      case 'refresh':
        reloadPage();
        break;
    }
  });
}

/**
 * Handle internal link navigation via fetch
 * @param {string} url - The URL to navigate to
 * @param {Element} targetElement - Element to update with new content (default: #main)
 */
function navigateToPage(url, targetElement = null) {
  const target = targetElement || document.querySelector('#main');
  if (!target) return;
  
  showLoading('#main');
  
  fetch(url, {
    headers: {
      'Accept': 'text/html',
      'X-Partial-Content': 'true'
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }
      return response.text();
    })
    .then(html => {
      target.innerHTML = html;
      // Update browser history
      window.history.pushState({}, '', url);
      // Re-initialize event listeners for new content
      initializeEventListeners();
    })
    .catch(error => {
      console.error('Navigation failed:', error);
      showToast('Failed to load page', 'error');
      // Fallback to normal navigation
      window.location.href = url;
    })
    .finally(() => {
      hideLoading('#main');
    });
}

/**
 * Convert form value to appropriate type based on field type
 * @param {string} value - Raw form value
 * @param {string} fieldType - Field type (number, boolean, etc.)
 * @returns {any} Converted value
 */
function convertFieldValue(value, fieldType) {
  if (!value || value === '') {
    return null;
  }
  
  switch (fieldType.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
      const intVal = parseInt(value, 10);
      return isNaN(intVal) ? null : intVal;
    
    case 'float':
    case 'decimal':
      const floatVal = parseFloat(value);
      return isNaN(floatVal) ? null : floatVal;
    
    case 'boolean':
    case 'bool':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return Boolean(value);
    
    case 'enum':
    case 'string':
    case 'text':
    default:
      return value;
  }
}

/**
 * Handle form submission via fetch with JSON data
 * @param {HTMLFormElement} form - The form element
 * @param {string[]} strategy - Strategy actions to execute on success
 * @param {object} options - Additional options
 */
function submitForm(form, strategy = ['back', 'toast'], options = {}) {
  const formData = new FormData(form);
  const jsonData = {};
  
  // Get field types from form data attribute
  const fieldTypesAttr = form.getAttribute('data-field-types');
  const fieldTypes = fieldTypesAttr ? JSON.parse(fieldTypesAttr) : {};
  
  // Convert FormData to JSON with proper typing
  for (const [key, value] of formData.entries()) {
    const fieldType = fieldTypes[key] || 'string';
    const convertedValue = convertFieldValue(value, fieldType);
    
    if (jsonData[key]) {
      // Handle multiple values (e.g., checkboxes)
      if (Array.isArray(jsonData[key])) {
        jsonData[key].push(convertedValue);
      } else {
        jsonData[key] = [jsonData[key], convertedValue];
      }
    } else {
      jsonData[key] = convertedValue;
    }
  }
  
  const url = form.getAttribute('data-action') || form.action;
  const method = (form.getAttribute('data-method') || form.method || 'POST').toUpperCase();
  
  showLoading(form);
  
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(jsonData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }
      return response.json();
    })
    .then(data => {
      handleFormSuccess(data, strategy, options);
    })
    .catch(error => {
      console.error('Form submission failed:', error);
      handleFormError({ message: error.message || 'Form submission failed' }, options);
    })
    .finally(() => {
      hideLoading(form);
    });
}

/**
 * Standardized error handling for forms
 * @param {object} response - The error response
 * @param {object} options - Options including target elements
 */
function handleFormError(response, options = {}) {
  const message = response.message || 'An error occurred';
  
  if (options.messageId) {
    showMessage(options.messageId, message, 'error');
  } else {
    showToast(message, 'error');
  }
}

/**
 * Add client-side validation helpers
 * @param {string} formSelector - CSS selector for the form
 */
function setupFormValidation(formSelector) {
  const form = getElementSafely(formSelector);
  if (!form) return;
  
  // Add basic required field validation
  const requiredFields = form.querySelectorAll('[required]');
  requiredFields.forEach(field => {
    field.addEventListener('blur', function() {
      if (!this.value.trim()) {
        showMessage(this.id + '-error', 'This field is required', 'error');
      } else {
        const errorEl = getElementSafely('#' + this.id + '-error');
        if (errorEl) errorEl.textContent = '';
      }
    });
  });
}

// ===== UTILITY FUNCTIONS =====

/**
 * Safe element selection with error handling
 * @param {string} selector - CSS selector
 * @returns {Element|null}
 */
function getElementSafely(selector) {
  try {
    return document.querySelector(selector);
  } catch (e) {
    console.warn('Invalid selector:', selector);
    return null;
  }
}

/**
 * Debounce utility for search/input handlers
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay = window.AppConfig.debounceDelay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Show loading state for target element
 * @param {string} target - CSS selector for target element
 */
function showLoading(target) {
  const element = getElementSafely(target);
  if (!element) return;
  
  element.style.position = 'relative';
  element.style.pointerEvents = 'none';
  element.style.opacity = '0.6';
  
  const loader = document.createElement('div');
  loader.className = 'app-loader';
  loader.style.cssText = \`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 20px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    z-index: 1000;
  \`;
  
  element.appendChild(loader);
  
  // Add CSS animation if not exists
  if (!document.querySelector('#app-loader-styles')) {
    const style = document.createElement('style');
    style.id = 'app-loader-styles';
    style.textContent = \`
      @keyframes spin {
        0% { transform: translate(-50%, -50%) rotate(0deg); }
        100% { transform: translate(-50%, -50%) rotate(360deg); }
      }
    \`;
    document.head.appendChild(style);
  }
}

/**
 * Hide loading state for target element
 * @param {string} target - CSS selector for target element
 */
function hideLoading(target) {
  const element = getElementSafely(target);
  if (!element) return;
  
  element.style.pointerEvents = '';
  element.style.opacity = '';
  
  const loader = element.querySelector('.app-loader');
  if (loader) {
    loader.remove();
  }
}

// ===== INITIALIZATION =====

/**
 * Initialize event listeners for links and forms
 */
function initializeEventListeners() {
  // Handle internal links
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    
    // Skip external links, anchors, and special protocols
    if (!href || 
        href.startsWith('http://') || 
        href.startsWith('https://') || 
        href.startsWith('mailto:') || 
        href.startsWith('tel:') || 
        href.startsWith('#') ||
        href.startsWith('javascript:')) {
      return;
    }
    
    // Remove any existing event listeners and add new one
    link.removeEventListener('click', handleLinkClick);
    link.addEventListener('click', handleLinkClick);
  });
  
  // Handle forms with strategy
  document.querySelectorAll('form[data-strategy]').forEach(form => {
    // Remove any existing event listeners and add new one
    form.removeEventListener('submit', handleFormSubmit);
    form.addEventListener('submit', handleFormSubmit);
  });
}

/**
 * Handle link click for internal navigation
 * @param {Event} event - Click event
 */
function handleLinkClick(event) {
  event.preventDefault();
  const href = event.currentTarget.getAttribute('href');
  if (href) {
    navigateToPage(href);
  }
}

/**
 * Handle form submission
 * @param {Event} event - Submit event
 */
function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  
  // Check for confirmation message
  const confirmMessage = form.getAttribute('data-confirm-message');
  if (confirmMessage) {
    const confirmed = confirm(t(confirmMessage));
    if (!confirmed) {
      return; // User cancelled
    }
  }
  
  const strategyAttr = form.getAttribute('data-strategy');
  const strategy = strategyAttr ? JSON.parse(strategyAttr) : ['back', 'toast'];
  
  // Extract options from form data attributes
  const options = {
    basePath: form.getAttribute('data-base-path') || '',
    entityName: form.getAttribute('data-entity-name') || 'Item',
    messageId: form.getAttribute('data-message-id'),
    modalId: form.getAttribute('data-modal-id'),
    formSelector: \`form[data-template="\${form.getAttribute('data-template')}"]\`,
    targetSelector: form.getAttribute('data-target-selector')
  };
  
  submitForm(form, strategy, options);
}

// Set up event handlers on page load
document.addEventListener('DOMContentLoaded', function() {
  // Initialize event listeners
  initializeEventListeners();
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', function(event) {
    // Reload the page content for the current URL
    navigateToPage(window.location.pathname);
  });
  
  // Load translations on page load
  loadTranslations();
});

// Expose functions globally
window.App = {
  // Translation functions
  t,
  setLang,
  getCurrentLanguage,
  loadTranslations,
  showToast,
  showMessage,
  showModal,
  navigateBack,
  redirectTo,
  reloadPage,
  refreshSection,
  removeElement,
  updateContent,
  clearForm,
  handleFormSuccess,
  handleFormError,
  setupFormValidation,
  getElementSafely,
  debounce,
  showLoading,
  hideLoading,
  // New SPA functions
  navigateToPage,
  submitForm,
  initializeEventListeners,
  // Type conversion
  convertFieldValue
};
`;

export const translationsTemplate = `{
  "ru": {
    "error": "ошибка",
    "success": "успешно",
    "Reloading page...": "Перезагрузка страницы...",
    "Request failed. Please try again.": "Запрос не выполнен. Попробуйте еще раз.",
    "This field is required": "Это поле обязательно",
    "An error occurred": "Произошла ошибка",
    "saved successfully": "успешно сохранено",
    "updated successfully": "успешно обновлено",
    "deleted successfully": "успешно удалено"
  },
  "pl": {
    "error": "błąd",
    "success": "sukces",
    "Reloading page...": "Przeładowywanie strony...",
    "Request failed. Please try again.": "Żądanie nie powiodło się. Spróbuj ponownie.",
    "This field is required": "To pole jest wymagane",
    "An error occurred": "Wystąpił błąd",
    "saved successfully": "zapisano pomyślnie",
    "updated successfully": "zaktualizowano pomyślnie",
    "deleted successfully": "usunięto pomyślnie"
  },
  "es": {
    "error": "error",
    "success": "éxito",
    "Reloading page...": "Recargando página...",
    "Request failed. Please try again.": "La solicitud falló. Por favor, inténtelo de nuevo.",
    "This field is required": "Este campo es obligatorio",
    "An error occurred": "Ha ocurrido un error",
    "saved successfully": "guardado exitosamente",
    "updated successfully": "actualizado exitosamente",
    "deleted successfully": "eliminado exitosamente"
  },
  "de": {
    "error": "Fehler",
    "success": "Erfolg",
    "Reloading page...": "Seite wird neu geladen...",
    "Request failed. Please try again.": "Anfrage fehlgeschlagen. Bitte versuchen Sie es erneut.",
    "This field is required": "Dieses Feld ist erforderlich",
    "An error occurred": "Ein Fehler ist aufgetreten",
    "saved successfully": "erfolgreich gespeichert",
    "updated successfully": "erfolgreich aktualisiert",
    "deleted successfully": "erfolgreich gelöscht"
  },
  "pt": {
    "error": "erro",
    "success": "sucesso",
    "Reloading page...": "Recarregando página...",
    "Request failed. Please try again.": "A solicitação falhou. Por favor, tente novamente.",
    "This field is required": "Este campo é obrigatório",
    "An error occurred": "Ocorreu um erro",
    "saved successfully": "salvo com sucesso",
    "updated successfully": "atualizado com sucesso",
    "deleted successfully": "excluído com sucesso"
  },
  "zh": {
    "error": "错误",
    "success": "成功",
    "Reloading page...": "正在重新加载页面...",
    "Request failed. Please try again.": "请求失败。请再试一次。",
    "This field is required": "此字段为必填项",
    "An error occurred": "发生错误",
    "saved successfully": "保存成功",
    "updated successfully": "更新成功",
    "deleted successfully": "删除成功"
  }
}`;

export const cursorRulesTemplate = `# CurrentJS Framework Rules

## Architecture Overview
This is a CurrentJS framework application using clean architecture principles with the following layers:
- **Controllers**: Handle HTTP requests/responses and route handling
- **Services**: Contain business logic and orchestrate operations
- **Stores**: Provide data access layer and database operations
- **Domain Entities**: Core business models
- **Views**: HTML templates for server-side rendering

## Commands

\`\`\`bash
current create module Modulename # Creates "Modulename" with default structure and yaml file
\`\`\`
\`\`\`bash
current generate Modulename # Generates all TypeScript files based on the module's yaml, and runs "npm run build"
current generate # Does the same as above, but for all modules
\`\`\`
\`\`\`bash
current commit [files...] # Commits all changes in the code, so they won't be overwritten after regeneration
current diff [module] # Show differences between generated and current code
\`\`\`

## The flow
1. Create an empty app (\`current create app\`) – this step is already done.
2. Create a new module: \`current create module Name\`
3. In the module's yaml file, define module's:
 - model(s)
 - routes & actions
 - permissions
4. Generate TypeScript files: \`current generate Name\`
5. If required, make changes in the:
 - model (i.e. some specific business rules or validations)
 - views
6. Commit those changes: \`current commit\`

--- If needed more than CRUD: ---

7. Define action in the service by creating a method
8. Describe this action in the module's yaml. Additionaly, you may define routes and permissions.
9. \`current generate Modulename\`
10. commit changes: \`current commit\`

## Configuration Files

### Application Configuration (app.yaml)

**Do not modify this file**

### Module Configuration (modulename.yaml)

**The most work must be done in these files**

**Complete Module Example:**
\`\`\`yaml
models:
  - name: Post                          # Entity name (capitalized)
    fields:
      - name: title                     # Field name
        type: string                    # Field type: string, number, boolean, datetime
        required: true                  # Validation requirement
      - name: content
        type: string
        required: true
      - name: authorId
        type: number
        required: true
      - name: publishedAt
        type: datetime
        required: false
      - name: status
        type: string
        required: true

api:                                    # REST API configuration
  prefix: /api/posts                    # Base URL for API endpoints
  model: Post                           # Optional: which model this API serves (defaults to first model)
  endpoints:
    - method: GET                       # HTTP method
      path: /                           # Relative path (becomes /api/posts/)
      action: list                      # Action name (references actions section)
    - method: GET
      path: /:id                        # Path parameter
      action: get
    - method: POST
      path: /
      action: create
    - method: PUT
      path: /:id
      action: update
    - method: DELETE
      path: /:id
      action: delete
    - method: POST                      # Custom endpoint
      path: /:id/publish
      action: publish
      model: Post                       # Optional: override model for specific endpoint

routes:                                 # Web interface configuration
  prefix: /posts                        # Base URL for web pages
  model: Post                           # Optional: which model this route serves (defaults to first model)
  strategy: [toast, back]               # Default success strategies for forms
  endpoints:
    - path: /                           # List page
      action: list
      view: postList                    # Template name
    - path: /:id                        # Detail page
      action: get
      view: postDetail
    - path: /create                     # Create form page
      action: empty                     # No data loading action
      view: postCreate
    - path: /:id/edit                   # Edit form page
      action: get                       # Load existing data
      view: postUpdate
      model: Post                       # Optional: override model for specific endpoint

actions:                                # Business logic mapping
  list:
    handlers: [Post:default:list]       # Use built-in list handler
  get:
    handlers: [Post:default:get]    # Use built-in get handler
  create:
    handlers: [Post:default:create]     # Built-in create
  update:
    handlers: [Post:default:update]
  delete:
    handlers: [                         # Chain multiple handlers
      Post:checkCanDelete,              # Custom business logic
      Post:default:delete
    ]
  publish:                              # Custom action
    handlers: [
      Post:default:get,             # Fetch entity
      Post:validateForPublish,          # Custom validation
      Post:updatePublishStatus          # Custom update logic
    ]

permissions:                            # Role-based access control
  - role: all
    actions: [list, get]                # Anyone (including anonymous)
  - role: authenticated
    actions: [create]                   # Must be logged in
  - role: owner
    actions: [update, publish]          # Entity owner permissions
  - role: admin
    actions: [update, delete, publish]  # Admin role permissions
  - role: editor
    actions: [publish]                  # Editor role permissions
\`\`\`

**Make sure no \`ID\`/\`owner id\`/\`is deleted\` fields are present in the model definition, since it's added automatically**

**Field Types:**
- \`string\` - Text data
- \`number\` - Numeric data (integer or float)
- \`boolean\` - True/false values
- \`datetime\` - Date and time values

**🔄 Handler vs Action Architecture:**
- **Handler**: Creates a separate service method (one handler = one service method)
- **Action**: Virtual controller concept that calls handler methods step-by-step

**Built-in Action Handlers:**
- \`ModelName:default:list\` - Creates service method with pagination parameters
- \`ModelName:default:get\` - Creates service method named \`get\` with ID parameter
- \`ModelName:default:create\` - Creates service method with DTO parameter
- \`ModelName:default:update\` - Creates service method with ID and DTO parameters
- \`ModelName:default:delete\` - Creates service method with ID parameter

**Custom Action Handlers:**
- \`ModelName:customMethodName\` - Creates service method that accepts \`result, context\` parameters
- \`result\`: Result from previous handler (or \`null\` if it's the first handler)
- \`context\`: The request context object
- Each handler generates a separate method in the service
- User can customize the implementation after generation

**🔗 Multiple Handlers per Action:**
When an action has multiple handlers, each handler generates a separate service method, and the controller action calls them sequentially. The action returns the result from the last handler.

**Parameter Passing Rules:**
- **Default handlers** (\`:default:\`): Receive standard parameters (id, pagination, DTO, etc.)
- **Custom handlers**: Receive \`(result, context)\` where:
  - \`result\`: Result from previous handler, or \`null\` if it's the first handler
  - \`context\`: Request context object

**Handler Format Examples:**
- \`Post:default:list\` - Creates Post service method \`list(page, limit)\`
- \`Post:default:get\` - Creates Post service method \`get(id)\`
- \`Post:validateContent\` - Creates Post service method \`validateContent(result, context)\`
- \`Comment:notifySubscribers\` - Creates Comment service method \`notifySubscribers(result, context)\`

**Strategy Options (for forms):**
- \`toast\` - Success toast notification
- \`back\` - Navigate back in browser history
- \`message\` - Inline success message
- \`modal\` - Modal success dialog
- \`redirect\` - Redirect to specific URL
- \`refresh\` - Reload current page

**Permission Roles:**
- \`all\` - Anyone (including anonymous users)
- \`authenticated\` - Any logged-in user
- \`owner\` - User who created the entity
- \`admin\`, \`editor\`, \`user\` - Custom roles from JWT token
- Multiple roles can be specified for each action

**Generated Files from Configuration:**
- Domain entity class (one per model)
- Service class (one per model)
- API controller with REST endpoints (one per model)
- Web controller with page rendering (one per model)
- Store class with database operations (one per model)
- HTML templates for all views
- TypeScript interfaces and DTOs

**Multi-Model Support:**
- Each model gets its own service, controller, and store
- Use \`model\` parameter in \`api\` and \`routes\` to specify which model to use (defaults to first model)
- Use \`model\` parameter on individual endpoints to override model for specific endpoints
- Action handlers use \`modelname:action\` format to specify which model's service method to call
- Controllers and services are generated per model, not per module

## Module Structure
\`\`\`
src/modules/ModuleName/
├── application/
│   ├── services/ModuleService.ts      # Business logic
│   └── validation/ModuleValidation.ts # DTOs and validation
├── domain/
│   └── entities/Module.ts             # Domain model
├── infrastructure/
│   ├── controllers/
│   │   ├── ModuleApiController.ts     # REST API endpoints
│   │   └── ModuleWebController.ts     # Web page controllers
│   ├── interfaces/StoreInterface.ts   # Data access interface
│   └── stores/ModuleStore.ts          # Data access implementation
├── views/
│   ├── modulelist.html               # List view template
│   ├── moduledetail.html             # Detail view template
│   ├── modulecreate.html             # Create form template
│   └── moduleupdate.html             # Update form template
└── module.yaml                       # Module configuration
\`\`\`

## Best Practices

- Use Domain Driven Design and Clean Architecture (kind of).
- Prefer declarative configuration over imperative programming: when possible, change yamls instead of writing the code. Write the code only when it's really neccessary.
- CRUD operation are autogenerated (first in module's yaml, then in the generated code).
- If some custom action is needed, then it has to be defined in the **Service** then just put this action to the module's yaml. You may also define new methods in the *Store* and its interface (if needed).
- Business rules must be defined only in models. That also applies to business rules validations (in contrast to *just* validations: e.g. if field exists and is of needed type – then validators are in use)

## Core Package APIs (For Generated Code)

### @currentjs/router - Controller Decorators & Context

**Decorators (in controllers):**
\`\`\`typescript
@Controller('/api/posts')  // Base path for controller
@Get('/')                  // GET endpoint
@Get('/:id')              // GET with path parameter
@Post('/')                // POST endpoint
@Put('/:id')              // PUT endpoint
@Delete('/:id')           // DELETE endpoint
@Render('template', 'layout')  // For web controllers
\`\`\`

**Context Object (in route handlers):**
\`\`\`typescript
interface IContext {
  request: {
    url: string;
    path: string;
    method: string;
    parameters: Record<string, string | number>; // Path params + query params
    body: any; // Parsed JSON or raw string
    headers: Record<string, string | string[]>;
    user?: AuthenticatedUser; // Parsed JWT user if authenticated
  };
  response: Record<string, any>;
}

// Usage examples
const id = parseInt(ctx.request.parameters.id as string);
const page = parseInt(ctx.request.parameters.page as string) || 1;
const payload = ctx.request.body;
const user = ctx.request.user; // If authenticated
\`\`\`

**Authentication Support:**
- JWT tokens parsed automatically from \`Authorization: Bearer <token>\` header
- User object available at \`ctx.request.user\` with \`id\`, \`email\`, \`role\` fields
- No manual setup required in generated code

### @currentjs/templating - Template Syntax

**Variables & Data Access:**
\`\`\`html
{{ variableName }}
{{ object.property }}
{{ $root.arrayData }}     <!-- Access root data -->
{{ $index }}              <!-- Loop index -->
\`\`\`

**Control Structures:**
\`\`\`html
<!-- Loops -->
<tbody x-for="$root" x-row="item">
  <tr>
    <td>{{ item.name }}</td>
    <td>{{ $index }}</td>
  </tr>
</tbody>

<!-- Conditionals -->
<div x-if="user.isAdmin">Admin content</div>
<span x-if="errors.name">{{ errors.name }}</span>

<!-- Template includes -->
<userCard name="{{ user.name }}" role="admin" />
\`\`\`

**Layout Integration:**
- Templates use \`<!-- @template name="templateName" -->\` header
- Main layout gets \`{{ content }}\` variable
- Forms use \`{{ formData.field || '' }}\` for default values

### @currentjs/provider-mysql - Database Operations

**Query Execution (in stores):**
\`\`\`typescript
// Named parameters (preferred)
const result = await this.db.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);

// Result handling
if (result.success && result.data.length > 0) {
  return result.data.map(row => this.rowToModel(row));
}
\`\`\`

**Common Query Patterns:**
\`\`\`typescript
// Insert with auto-generated fields
const row = { ...data, created_at: new Date(), updated_at: new Date() };
const result = await this.db.query(
  \`INSERT INTO table_name (\${fields.join(', ')}) VALUES (\${placeholders})\`,
  row
);
const newId = result.insertId;

// Update with validation
const query = \`UPDATE table_name SET \${updateFields.join(', ')}, updated_at = :updated_at WHERE id = :id\`;
await this.db.query(query, { ...updateData, updated_at: new Date(), id });

// Soft delete
await this.db.query(
  'UPDATE table_name SET deleted_at = :deleted_at WHERE id = :id',
  { deleted_at: new Date(), id }
);
\`\`\`

**Error Handling:**
\`\`\`typescript
try {
  const result = await this.db.query(query, params);
} catch (error) {
  if (error instanceof MySQLConnectionError) {
    throw new Error(\`Database connection error: \${error.message}\`);
  } else if (error instanceof MySQLQueryError) {
    throw new Error(\`Query error: \${error.message}\`);
  }
  throw error;
}
\`\`\`

## Frontend System (web/app.js)

### Translation System

**Basic Usage:**
\`\`\`javascript
// Translate strings
t('Hello World')  // Returns translated version or original
t('Save changes')

// Set language
setLang('pl')     // Switch to Polish
setLang('en')     // Switch to English
getCurrentLanguage()  // Get current language code
\`\`\`

**Translation File (web/translations.json):**
\`\`\`json
{
  "pl": {
    "Hello World": "Witaj Świecie",
    "Save changes": "Zapisz zmiany",
    "Delete": "Usuń"
  },
  "ru": {
    "Hello World": "Привет мир",
    "Save changes": "Сохранить изменения"
  }
}
\`\`\`

### UI Feedback & Notifications

**Toast Notifications:**
\`\`\`javascript
showToast('Success message', 'success')  // Green toast
showToast('Error occurred', 'error')     // Red toast  
showToast('Information', 'info')         // Blue toast
showToast('Warning', 'warning')          // Yellow toast
\`\`\`

**Inline Messages:**
\`\`\`javascript
showMessage('messageId', 'Success!', 'success')
showMessage('errorContainer', 'Validation failed', 'error')
\`\`\`

**Modal Dialogs:**
\`\`\`javascript
showModal('confirmModal', 'Item saved successfully', 'success')
showModal('errorModal', 'Operation failed', 'error')
\`\`\`

### Navigation & Page Actions

**Navigation Functions:**
\`\`\`javascript
navigateBack()              // Go back in history or to home
redirectTo('/posts')        // Safe redirect with validation
reloadPage()               // Reload with loading indicator
refreshSection('#content') // Refresh specific section

// SPA-style navigation
navigateToPage('/posts/123')  // Loads via AJAX, updates #main
\`\`\`

**Content Management:**
\`\`\`javascript
updateContent('#results', newHtml, 'replace')  // Replace content
updateContent('#list', itemHtml, 'append')     // Add to end
updateContent('#list', itemHtml, 'prepend')    // Add to beginning
removeElement('#item-123')                     // Animate and remove
\`\`\`

### Form Handling & Strategy System

**Form Strategy Configuration:**
\`\`\`html
<!-- Form with strategy attributes -->
<form data-strategy='["toast", "back"]' 
      data-entity-name="Post"
      data-field-types='{"age": "number", "active": "boolean"}'>
  <input name="title" type="text" required>
  <input name="age" type="number">
  <input name="active" type="checkbox">
  <button type="submit">Save</button>
</form>
\`\`\`

**Available Strategies:**
- \`toast\` - Show success toast notification
- \`back\` - Navigate back using browser history
- \`message\` - Show inline message in specific element
- \`modal\` - Show modal dialog
- \`redirect\` - Redirect to specific URL
- \`refresh\` - Reload the page
- \`remove\` - Remove form element

**Manual Form Submission:**
\`\`\`javascript
const form = document.querySelector('#myForm');
submitForm(form, ['toast', 'back'], {
  entityName: 'Post',
  basePath: '/posts',
  messageId: 'form-message'
});
\`\`\`

**Success Handling:**
\`\`\`javascript
handleFormSuccess(response, ['toast', 'back'], {
  entityName: 'Post',
  basePath: '/posts',
  messageId: 'success-msg',
  modalId: 'success-modal'
});
\`\`\`

### Form Validation & Type Conversion

**Client-side Validation Setup:**
\`\`\`javascript
setupFormValidation('#createForm');  // Adds required field validation
\`\`\`

**Field Type Conversion:**
\`\`\`javascript
// Automatic conversion based on data-field-types
convertFieldValue('123', 'number')    // Returns 123 (number)
convertFieldValue('true', 'boolean')  // Returns true (boolean)
convertFieldValue('text', 'string')   // Returns 'text' (string)
\`\`\`

### Loading States & Utilities

**Loading Indicators:**
\`\`\`javascript
showLoading('#form')      // Show spinner on form
hideLoading('#form')      // Hide spinner
showLoading('#main')      // Show spinner on main content
\`\`\`

**Utility Functions:**
\`\`\`javascript
debounce(searchFunction, 300)  // Debounce for search inputs
getElementSafely('#selector') // Safe element selection
clearForm('#myForm')          // Reset form and clear validation
\`\`\`

### Event Handling & SPA Integration

**Automatic Link Handling:**
- Internal links automatically use AJAX navigation
- External links work normally
- Links with \`data-external\` skip AJAX handling

**Automatic Form Handling:**
- Forms with \`data-strategy\` use AJAX submission
- Regular forms work normally
- Automatic JSON conversion from FormData

**Custom Event Listeners:**
\`\`\`javascript
// Re-initialize after dynamic content loading
initializeEventListeners();

// Handle specific link navigation
document.querySelector('#myLink').addEventListener('click', (e) => {
  e.preventDefault();
  navigateToPage('/custom/path');
});
\`\`\`

### Global App Object

**Accessing Functions:**
\`\`\`javascript
// All functions available under window.App
App.showToast('Message', 'success');
App.navigateBack();
App.t('Translate this');
App.setLang('pl');
App.showLoading('#content');
\`\`\`

### Template Data Binding
\`\`\`html
<!-- List with pagination -->
<tbody x-for="modules" x-row="module">
  <tr>
    <td>{{ module.name }}</td>
    <td><a href="/module/{{ module.id }}">View</a></td>
  </tr>
</tbody>

<!-- Form with validation errors -->
<div x-if="errors.name" class="text-danger">{{ errors.name }}</div>
<input type="text" name="name" value="{{ formData.name || '' }}" class="form-control">

<!-- Form with strategy attributes -->
<form data-strategy='["toast", "back"]' 
      data-entity-name="Module"
      data-field-types='{"count": "number", "active": "boolean"}'>
  <!-- form fields -->
</form>
\`\`\`
`;

// Directory structure constants
export const DEFAULT_DIRECTORIES = {
  SRC: 'src',
  DIST: 'build', 
  WEB: 'web',
  TEMPLATES: path.join('src', 'common', 'ui', 'templates'),
  SERVICES: path.join('src', 'common', 'services')
} as const;

// File names constants
export const DEFAULT_FILES = {
  PACKAGE_JSON: 'package.json',
  TSCONFIG: 'tsconfig.json',
  APP_YAML: 'app.yaml',
  APP_TS: 'app.ts',
  MAIN_VIEW: 'main_view.html',
  ERROR_TEMPLATE: 'error.html',
  FRONTEND_SCRIPT: 'app.js',
  TRANSLATIONS: 'translations.json',
  CURSOR_RULES: '.cursorrules'
} as const;
