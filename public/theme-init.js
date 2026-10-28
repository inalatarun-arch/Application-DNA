// Apply the saved theme before first paint to avoid a light/dark flash.
// Kept as a separate file so the page can use a Content-Security-Policy that forbids inline scripts.
try {
  var t = localStorage.getItem('eih.theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
