const form = document.getElementById('contact-form');
const status = document.querySelector('[data-form-status]');
const messages = {
  en: ['Sending…', 'Your message has been sent. We will reply by email.', 'We could not confirm your message was sent. Please retry or email digiforcebusiness@gmail.com directly.'],
  fr: ['Envoi…', 'Votre message a été envoyé. Nous vous répondrons par e-mail.', 'Impossible de confirmer l’envoi. Réessayez ou écrivez à digiforcebusiness@gmail.com.'],
  es: ['Enviando…', 'Tu mensaje se ha enviado. Responderemos por correo electrónico.', 'No pudimos confirmar el envío. Inténtalo de nuevo o escribe a digiforcebusiness@gmail.com.'],
  ar: ['جارٍ الإرسال…', 'تم إرسال رسالتك. سنرد عليك عبر البريد الإلكتروني.', 'لم نتمكن من تأكيد إرسال رسالتك. أعد المحاولة أو راسل digiforcebusiness@gmail.com.'],
}[document.documentElement.lang] || [];
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = messages[0];
  status.textContent = '';
  const data = new FormData(form);
  data.set('subject', '[ServePoint POS] ' + data.get('subject'));
  data.set('replyto', data.get('email'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(form.action, { method: 'POST', body: data, signal: controller.signal });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error('Message not accepted');
    status.dataset.error = 'false';
    status.textContent = messages[1];
    form.reset();
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'servepoint_conversion', action: 'contact_success', page: location.pathname });
  } catch {
    status.dataset.error = 'true';
    status.textContent = messages[2];
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    button.textContent = originalLabel;
  }
});
