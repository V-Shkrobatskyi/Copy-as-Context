/** Show Android presses independently of Gecko's native CSS :active state. */
export function installTouchButtonFeedback(button: HTMLButtonElement, isAndroid: () => boolean): void {
  const clear = () => {
    button.classList.remove('is-pressed');
  };
  const press = () => {
    if (!isAndroid() || button.disabled) return;
    button.classList.add('is-pressed');
  };
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') press();
  });
  button.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') clear();
  });
  button.addEventListener('pointercancel', clear);
  button.addEventListener('pointerleave', clear);
  button.addEventListener('blur', clear);
}
