// Установка текущего года в футере
document.getElementById('year').textContent = new Date().getFullYear();

// Плавная прокрутка для якорных ссылок
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});


// Только Cloudflare Worker → Telegram. Токен бота в этом файле НЕ хранится.
const PROXY_URL = 'https://still-butterfly-98a9.technoparkkirov.workers.dev';

// Кулдаун кнопки после успешной отправки
const COOLDOWN_MS = 20_000;

const form = document.getElementById('requestForm');
const success = document.getElementById('formSuccess');
const errorBox = document.getElementById('formError');
const submitBtn = form.querySelector('button[type="submit"]');

function isValidContact(s) {
    if (!s) return false;
    const phoneLike = /^[+\d()\-\s]{7,}$/.test(s) && (s.match(/\d/g) || []).length >= 7;
    const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    return phoneLike || emailLike;
}

if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());

        // honeypot
        if (data.website || data.phone2) {
            success.classList.add('is-visible');
            form.reset();
            return;
        }

        if (!data.name || !data.contact || !isValidContact(data.contact)) {
            errorBox.textContent = 'Заполните имя и корректный контакт (телефон или e-mail).';
            errorBox.classList.add('is-visible');
            return;
        }
        errorBox.classList.remove('is-visible');

        const original = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';

        try {
            const res = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    contact: data.contact,
                    type: data.type,
                    message: data.message,
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Не удалось отправить заявку');
            }
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = original;
            errorBox.textContent = 'Не удалось отправить заявку. Попробуйте позже или напишите нам на technoparkkirov@mail.ru.';
            errorBox.classList.add('is-visible');
            return;
        }

        // Успех
        success.classList.add('is-visible');
        form.reset();
        let left = Math.ceil(COOLDOWN_MS / 1000);
        const tick = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(tick);
                submitBtn.disabled = false;
                submitBtn.textContent = original;
            } else {
                submitBtn.textContent = `Готово · ${left}с`;
            }
        }, 1000);
        setTimeout(() => success.classList.remove('is-visible'), 8000);
    });
}
