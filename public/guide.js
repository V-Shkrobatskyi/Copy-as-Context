const languageButtons = document.querySelectorAll('[data-language]');

function showLanguage(language) {
  const ukrainian = language === 'uk';
  document.documentElement.lang = ukrainian ? 'uk' : 'en';
  document.title = ukrainian
    ? 'Copy as Context — Посібник користувача'
    : 'Copy as Context — User guide';
  document.getElementById('guide-en').hidden = ukrainian;
  document.getElementById('guide-uk').hidden = !ukrainian;
  languageButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === document.documentElement.lang));
  });
}

languageButtons.forEach((button) => {
  button.addEventListener('click', () => {
    window.location.hash = button.dataset.language;
    showLanguage(button.dataset.language);
  });
});

window.addEventListener('hashchange', () => showLanguage(window.location.hash.slice(1)));
showLanguage(window.location.hash.slice(1));
