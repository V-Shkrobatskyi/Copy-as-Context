import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="popup" aria-labelledby="popup-title">
    <h1 id="popup-title">Copy as Context</h1>
    <p>
      Semantic page capture is being prepared. Copy controls will be available
      after the Chrome accessibility capture is implemented.
    </p>
  </main>
`;
